import os
import re
import requests
from jose import jwt
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from typing import List, Optional
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import mqtt_engine

load_dotenv()

# Global variables for MongoDB
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY")
DB_NAME = "railyn"
client = None
JWKS_CACHE = None

def get_jwks():
    global JWKS_CACHE
    if not JWKS_CACHE and CLERK_SECRET_KEY:
        res = requests.get("https://api.clerk.com/v1/jwks", headers={"Authorization": f"Bearer {CLERK_SECRET_KEY}"})
        if res.status_code == 200:
            JWKS_CACHE = res.json()
    return JWKS_CACHE

security = HTTPBearer()

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not CLERK_SECRET_KEY:
        # If no clerk key is set, bypass auth for local development
        return {"sub": "local_dev_user"}
        
    token = credentials.credentials
    try:
        jwks = get_jwks()
        payload = jwt.decode(token, jwks, algorithms=["RS256"], options={"verify_aud": False})
        return payload
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    global client
    print(f"Connecting to MongoDB...")
    client = AsyncIOMotorClient(MONGO_URL)
    app.state.db = client[DB_NAME]
    yield
    print("Closing MongoDB connection...")
    client.close()

# Rate limiter setup
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="Railyn API", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Models ---
class BookingRequest(BaseModel):
    train_number: str
    from_stn: str
    to_stn: str
    class_type: str
    passenger_name: str
    passenger_age: int

class CancelRequest(BaseModel):
    booking_id: str

class DelayRequest(BaseModel):
    train_number: str
    delay_hours: int

class SwapRequest(BaseModel):
    old_booking_id: str
    new_train_number: str

class UserRequest(BaseModel):
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    image_url: Optional[str] = None

# --- Routes ---

@app.get("/")
@limiter.limit("20/minute")
async def root(request: Request):
    return {"message": "Hello, User! Welcome to Railyn."}

@app.get("/healthz")
@limiter.limit("20/minute")
def health_check(request: Request):
    return {"status": "ok"}

@app.get("/stn_search")
@limiter.limit("30/minute")
async def station_search(request: Request, q: str):
    db = request.app.state.db
    # Search by code or name using regex (case-insensitive)
    query = {"$or": [
        {"code": {"$regex": f"^{q}", "$options": "i"}},
        {"name": {"$regex": q, "$options": "i"}}
    ]}
    
    # We want to return top 10 stations
    cursor = db.stations.find(query, {"_id": 0}).limit(10)
    stations = await cursor.to_list(length=10)
    return {"results": stations}

@app.get("/trn_search")
@limiter.limit("20/minute")
async def train_search(request: Request, from_stn: str, to_stn: str):
    db = request.app.state.db
    from_stn = from_stn.upper()
    to_stn = to_stn.upper()

    # We need to find trains where from_stn occurs BEFORE to_stn in the schedule.
    # We use MongoDB Aggregation to perform this complex join efficiently.
    pipeline = [
        {"$match": {"station_code": from_stn}},
        {"$lookup": {
            "from": "schedules",
            "let": {"t_num": "$train_number", "f_id": "$id"},
            "pipeline": [
                {"$match": {
                    "$expr": {
                        "$and": [
                            {"$eq": ["$train_number", "$$t_num"]},
                            {"$eq": ["$station_code", to_stn]},
                            {"$gt": ["$id", "$$f_id"]} # Arrival must be after departure
                        ]
                    }
                }}
            ],
            "as": "dest"
        }},
        {"$match": {"dest": {"$ne": []}}},
        {"$lookup": {
            "from": "trains",
            "localField": "train_number",
            "foreignField": "number",
            "as": "train_info"
        }},
        {"$unwind": "$train_info"},
        {"$unwind": "$dest"},
        {"$project": {
            "_id": 0,
            "train_number": "$train_number",
            "train_name": "$train_info.name",
            "type": "$train_info.type",
            "departure": "$departure",
            "arrival": "$dest.arrival",
            "duration_h": "$train_info.duration_h",
            "duration_m": "$train_info.duration_m",
            "seat_inventory": "$train_info.seat_inventory"
        }},
        {"$sort": {"departure": 1}}
    ]

    cursor = db.schedules.aggregate(pipeline)
    trains = await cursor.to_list(length=100)
    return {"results": trains}

@app.post("/book_tkt")
@limiter.limit("10/minute")
async def book_ticket(request: Request, booking: BookingRequest, user_token: dict = Depends(verify_token)):
    db = request.app.state.db
    user_id = user_token.get("sub")
    
    # 1. Fetch train
    train = await db.trains.find_one({"number": booking.train_number})
    if not train:
        raise HTTPException(status_code=404, detail="Train not found")
        
    seat_inv = train.get("seat_inventory", {})
    if booking.class_type not in seat_inv:
        raise HTTPException(status_code=400, detail="Invalid class type")
        
    available_seats = seat_inv[booking.class_type]
    
    status = "CNF"
    wl_position = 0
    
    if available_seats > 0:
        # Decrement inventory
        await db.trains.update_one(
            {"number": booking.train_number},
            {"$inc": {f"seat_inventory.{booking.class_type}": -1}}
        )
    else:
        # Waitlist logic
        status = "WL"
        # Find how many are already on waitlist for this train/class
        wl_count = await db.bookings.count_documents({
            "train_number": booking.train_number,
            "class_type": booking.class_type,
            "status": "WL"
        })
        wl_position = wl_count + 1

    # Create booking record
    booking_record = {
        "user_id": user_id,
        "train_number": booking.train_number,
        "from_stn": booking.from_stn,
        "to_stn": booking.to_stn,
        "class_type": booking.class_type,
        "passenger_name": booking.passenger_name,
        "passenger_age": booking.passenger_age,
        "status": status,
        "wl_position": wl_position if status == "WL" else None
    }
    
    result = await db.bookings.insert_one(booking_record)
    
    return {
        "booking_id": str(result.inserted_id),
        "status": status,
        "wl_position": wl_position if status == "WL" else None,
        "message": "Booking successful" if status == "CNF" else "Added to Waitlist"
    }

@app.post("/register_user")
@limiter.limit("5/minute")
async def register_user(request: Request, user: UserRequest, user_token: dict = Depends(verify_token)):
    db = request.app.state.db
    user_id = user_token.get("sub")
    
    # Upsert user record into the 'users' collection
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "profile_pic": user.image_url,
        }},
        upsert=True
    )
    return {"message": "User details synced to database"}

@app.get("/my_bookings")
@limiter.limit("20/minute")
async def get_my_bookings(request: Request, user_token: dict = Depends(verify_token)):
    db = request.app.state.db
    user_id = user_token.get("sub")
    
    # Fetch all bookings for the authenticated user
    cursor = db.bookings.find({"user_id": user_id})
    bookings = await cursor.to_list(length=100)
    
    # Convert ObjectId to string for JSON serialization
    for b in bookings:
        b["_id"] = str(b["_id"])
        
    return {"bookings": bookings}

@app.post("/cancel_tkt")
@limiter.limit("5/minute")
async def cancel_ticket(request: Request, cancel_req: CancelRequest, background_tasks: BackgroundTasks, user_token: dict = Depends(verify_token)):
    db = request.app.state.db
    from bson.objectid import ObjectId
    
    booking = await db.bookings.find_one({"_id": ObjectId(cancel_req.booking_id), "user_id": user_token.get("sub")})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
        
    if booking["status"] in ["CANCELLED", "CANCELLED_SWAPPED"]:
        return {"message": "Already cancelled"}
        
    # Update to CANCELLED
    await db.bookings.update_one({"_id": ObjectId(cancel_req.booking_id)}, {"$set": {"status": "CANCELLED"}})
    
    if booking["status"] == "CNF":
        # Increment seat inventory
        await db.trains.update_one(
            {"number": booking["train_number"]},
            {"$inc": {f"seat_inventory.{booking['class_type']}": 1}}
        )
        # Directly trigger the Autonomy Engine Waitlist upgrade via BackgroundTasks
        background_tasks.add_task(mqtt_engine.handle_waitlist_upgrade, db, booking["train_number"], booking["class_type"])
    elif booking["status"] == "WL":
        await db.bookings.update_one({"_id": ObjectId(cancel_req.booking_id)}, {"$set": {"wl_position": None}})
        
    return {"message": "Ticket cancelled successfully."}

@app.post("/simulate/delay")
@limiter.limit("5/minute")
async def simulate_delay(request: Request, delay_req: DelayRequest, background_tasks: BackgroundTasks):
    delay_event = {
        "train_number": delay_req.train_number,
        "delay_hours": delay_req.delay_hours
    }
    # Directly trigger the Autonomy Engine to find reroutes via BackgroundTasks
    background_tasks.add_task(mqtt_engine.handle_delay, db, delay_event)
    return {"message": f"Delay of {delay_req.delay_hours} hrs registered for train {delay_req.train_number}. Autonomy Engine taking over."}

@app.post("/swap_tkt")
@limiter.limit("5/minute")
async def swap_ticket(request: Request, swap_req: SwapRequest, user_token: dict = Depends(verify_token)):
    db = request.app.state.db
    user_id = user_token.get("sub")
    from bson.objectid import ObjectId
    
    old_booking = await db.bookings.find_one({"_id": ObjectId(swap_req.old_booking_id), "user_id": user_id})
    if not old_booking:
        raise HTTPException(status_code=404, detail="Booking not found")
        
    # Cancel old
    await db.bookings.update_one({"_id": ObjectId(swap_req.old_booking_id)}, {"$set": {"status": "CANCELLED_SWAPPED"}})
    if old_booking["status"] == "CNF":
        await db.trains.update_one({"number": old_booking["train_number"]}, {"$inc": {f"seat_inventory.{old_booking['class_type']}": 1}})
        
    # Book new train (Assume seats available for swap)
    await db.trains.update_one({"number": swap_req.new_train_number}, {"$inc": {f"seat_inventory.{old_booking['class_type']}": -1}})
    
    new_booking = {
        "user_id": user_id,
        "train_number": swap_req.new_train_number,
        "from_stn": old_booking["from_stn"],
        "to_stn": old_booking["to_stn"],
        "class_type": old_booking["class_type"],
        "passenger_name": old_booking["passenger_name"],
        "passenger_age": old_booking["passenger_age"],
        "status": "CNF",
        "wl_position": None
    }
    res = await db.bookings.insert_one(new_booking)
    
    return {"message": "Successfully swapped train!", "new_booking_id": str(res.inserted_id)}
