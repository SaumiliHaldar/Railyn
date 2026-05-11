import os
import re
import io
import base64
import requests
import random
import string
import qrcode
from PIL import Image
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
import mqtt_engine, shared_mem
from bson.objectid import ObjectId

load_dotenv()

# Global variables for MongoDB
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
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
    client = AsyncIOMotorClient(MONGO_URI)
    app.state.db = client[DB_NAME]
    
    # Initialize Shared Memory for seat inventory
    print("Initializing Shared Memory Box...")
    await shared_mem.init_shm(app.state.db)
    
    yield
    print("Closing MongoDB connection and cleaning up SHM...")
    client.close()
    shared_mem.cleanup()

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
class Passenger(BaseModel):
    name: str
    age: int
    gender: Optional[str] = "Male"

class BookingRequest(BaseModel):
    train_number: str
    train_name: str
    from_stn: str
    to_stn: str
    departure: str
    arrival: str
    travel_date: str
    class_type: str
    passengers: List[Passenger]
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    total_fare: Optional[int] = 0

class CancelRequest(BaseModel):
    booking_id: str
    passenger_names: Optional[List[str]] = None

class DelayRequest(BaseModel):
    train_number: str
    delay_hours: int

class SwapRequest(BaseModel):
    old_booking_id: str

# ── Pricing Utility ──────────────────────────────────────────
CLASS_MULTIPLIERS = {
    "General": 0.65,
    "Sleeper": 1.0,
    "3AC": 2.4,
    "2AC": 3.6,
    "1AC": 5.4
}
BASE_RATE = 0.65 # INR per KM

def calculate_fare(h, m, cls):
    # Synthetic distance: avg speed 55km/h
    dist = (h + (m/60)) * 55
    mult = CLASS_MULTIPLIERS.get(cls, 1.0)
    fare = int(dist * BASE_RATE * mult)
    # Ensure min 3 digits and max 4 digits (as requested)
    return min(max(fare, 140), 9999)
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
    
    # Inject real-time seat counts from shared memory
    for t in trains:
        t_num = t["train_number"]
        real_inv = {}
        for cls in shared_mem.CLASSES:
            count = shared_mem.get_seats(t_num, cls)
            if count is not None:
                real_inv[cls] = count
        if real_inv:
            t["seat_inventory"] = real_inv
            
        # Add dynamic pricing for each class
        fares = {}
        h = t.get("duration_h", 5)
        m = t.get("duration_m", 0)
        for cls in shared_mem.CLASSES:
            fares[cls] = calculate_fare(h, m, cls)
        t["fares"] = fares

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
        
    available_seats = shared_mem.get_seats(booking.train_number, booking.class_type)
    if available_seats is None:
        raise HTTPException(status_code=400, detail="Invalid train or class type")
        
    num_passengers = len(booking.passengers)
    status = "CNF"
    wl_position = 0
    assigned_passengers = []
    
    if available_seats >= num_passengers:
        # 1. Update Shared Memory (Immediate)
        new_count = shared_mem.update_seats(booking.train_number, booking.class_type, -num_passengers)
        
        # 2. Sync to MongoDB (Background or inline)
        await db.trains.update_one(
            {"number": booking.train_number},
            {"$set": {f"seat_inventory.{booking.class_type}": new_count}}
        )
        
        # Assign seats for each passenger
        coach = random.choice(["B1", "B2", "A1", "S1", "S2", "H1"])
        start_seat = random.randint(1, 72 - num_passengers)
        for i, p in enumerate(booking.passengers):
            assigned_passengers.append({
                "name": p.name,
                "age": p.age,
                "gender": p.gender,
                "coach": coach,
                "seat": start_seat + i,
                "status": "CNF"
            })
    else:
        # Waitlist logic for the whole group
        status = "WL"
        wl_count = await db.bookings.count_documents({
            "train_number": booking.train_number,
            "class_type": booking.class_type,
            "status": "WL"
        })
        wl_position = wl_count + 1
        for p in booking.passengers:
            assigned_passengers.append({
                "name": p.name,
                "age": p.age,
                "gender": p.gender,
                "coach": "WL",
                "seat": wl_position,
                "status": "WL"
            })

    # Generate 10-digit PNR
    pnr = "".join([str(random.randint(0, 9)) for _ in range(10)])

    # Create booking record
    booking_record = {
        "user_id": user_id,
        "user_name": booking.user_name or "Unknown User",
        "user_email": booking.user_email or "Unknown Email",
        "pnr": pnr,
        "train_number": booking.train_number,
        "train_name": booking.train_name,
        "from_stn": booking.from_stn,
        "to_stn": booking.to_stn,
        "departure": booking.departure,
        "arrival": booking.arrival,
        "travel_date": booking.travel_date,
        "class_type": booking.class_type,
        "passengers": assigned_passengers,
        "status": status,
        "wl_position": wl_position if status == "WL" else None
    }
    
    result = await db.bookings.insert_one(booking_record)
    
    return {
        "booking_id": str(result.inserted_id),
        "pnr": pnr,
        "passengers": assigned_passengers,
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
    
    booking = await db.bookings.find_one({"_id": ObjectId(cancel_req.booking_id), "user_id": user_token.get("sub")})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
        
    if booking["status"] == "CANCELLED":
        return {"message": "Already cancelled"}
        
    # Determine who to cancel
    pax_to_cancel = cancel_req.passenger_names
    current_passengers = booking.get("passengers", [])
    
    # If no specific names, cancel ALL currently active passengers
    if not pax_to_cancel:
        pax_to_cancel = [p["name"] for p in current_passengers if p["status"] != "CAN"]

    if not pax_to_cancel:
        return {"message": "No active passengers to cancel."}

    num_cancelled_now = 0
    new_pax_list = []
    for p in current_passengers:
        if p["name"] in pax_to_cancel and p["status"] != "CAN":
            p["status"] = "CAN"
            num_cancelled_now += 1
        new_pax_list.append(p)

    # Calculate overall booking status
    all_cancelled = all(p["status"] == "CAN" for p in new_pax_list)
    final_status = "CANCELLED" if all_cancelled else booking["status"]

    # Update Database
    await db.bookings.update_one(
        {"_id": ObjectId(cancel_req.booking_id)}, 
        {"$set": {"status": final_status, "passengers": new_pax_list}}
    )
    
    # Release seats ONLY if the original booking was CNF (actually occupied a seat)
    if booking["status"] == "CNF" and num_cancelled_now > 0:
        # 1. Update Shared Memory (Release N seats)
        new_count = shared_mem.update_seats(booking["train_number"], booking["class_type"], num_cancelled_now)
        
        # 2. Sync to MongoDB
        await db.trains.update_one(
            {"number": booking["train_number"]},
            {"$set": {f"seat_inventory.{booking['class_type']}": new_count}}
        )
        
        # 3. Trigger Autonomy Engine for each seat released
        for _ in range(num_cancelled_now):
            background_tasks.add_task(mqtt_engine.handle_waitlist_upgrade, db, booking["train_number"], booking["class_type"])
            
    return {"message": f"Successfully cancelled {num_cancelled_now} passenger(s)."}

@app.post("/simulate/delay")
@limiter.limit("5/minute")
async def simulate_delay(request: Request, delay_req: DelayRequest, background_tasks: BackgroundTasks):
    db = request.app.state.db
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
        new_old_count = shared_mem.update_seats(old_booking["train_number"], old_booking["class_type"], 1)
        await db.trains.update_one({"number": old_booking["train_number"]}, {"$set": {f"seat_inventory.{old_booking['class_type']}": new_old_count}})
        
    # Book new train (Assume seats available for swap)
    new_new_count = shared_mem.update_seats(swap_req.new_train_number, old_booking["class_type"], -1)
    await db.trains.update_one({"number": swap_req.new_train_number}, {"$set": {f"seat_inventory.{old_booking['class_type']}": new_new_count}})
    
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

# ─── QR Code Generator ────────────────────────────────────────────────────────

@app.get("/qr/{pnr}")
async def generate_qr(
    pnr: str,
    name: Optional[str] = None,
    age: Optional[str] = None,
    train_name: Optional[str] = None,
    train_no: Optional[str] = None,
    from_stn: Optional[str] = None,
    to_stn: Optional[str] = None,
    date: Optional[str] = None,
    class_type: Optional[str] = None,
    coach: Optional[str] = None,
    seat: Optional[str] = None,
    pax_count: Optional[str] = None,
):
    """
    Generates a unique QR code per booking.
    Encodes all real ticket details — exactly what IRCTC & airline QR codes do.
    No URLs. Just structured booking data for offline verification.
    """
    # Compact but comprehensive format (similar to real e-tickets)
    pax_display = f"{name or 'N/A'}"
    if pax_count and int(pax_count) > 1:
        pax_display += f" + {int(pax_count)-1} others"

    qr_payload = (
        f"RAILYN|PNR:{pnr}|"
        f"PSGR:{pax_display}|"
        f"AGE:{age or 'N/A'}|"
        f"TRAIN:{train_no or 'N/A'}|"
        f"FROM:{from_stn or 'N/A'}|"
        f"TO:{to_stn or 'N/A'}|"
        f"DATE:{date or 'N/A'}|"
        f"CLS:{class_type or 'N/A'}|"
        f"SEAT:{coach or 'N/A'}-{seat or 'N/A'}"
    )

    qr = qrcode.QRCode(
        version=None,                                # Auto-fit
        error_correction=qrcode.constants.ERROR_CORRECT_H, # High error correction for easier scanning
        box_size=10,                                 # Larger boxes for better resolution
        border=4,                                    # Standard white quiet zone
    )
    qr.add_data(qr_payload)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)

    b64 = base64.b64encode(buffer.read()).decode("utf-8")
    return {"qr_data": f"data:image/png;base64,{b64}"}


# ─── PNR Search ───────────────────────────────────────────────────────────────

@app.get("/search_booking/{pnr}")
async def search_booking_by_pnr(pnr: str, user=Depends(verify_token)):
    db = client[DB_NAME]
    user_id = user["sub"]
    
    # Search across all bookings with this PNR
    booking = await db.bookings.find_one({"pnr": pnr})
    
    if not booking:
        raise HTTPException(status_code=404, detail="No booking found with this PNR")
    
    booking["_id"] = str(booking["_id"])
    return booking
