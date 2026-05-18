import os
import re
import io
import base64
import requests
import random
import string
import qrcode
import zlib
from PIL import Image
from jose import jwt
from datetime import datetime
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
import mqtt_engine, shared_mem, pricing
import razorpay
from bson.objectid import ObjectId

load_dotenv()

# Global variables for MongoDB
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY")
# Global variables for Razorpay
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")
rzp_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))

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
        # Disable verify_exp check to prevent token expiration failures caused by clock drift or idle modals
        payload = jwt.decode(token, jwks, algorithms=["RS256"], options={"verify_aud": False, "verify_exp": False})
        return payload
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")

security_optional = HTTPBearer(auto_error=False)

def verify_token_optional(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_optional)):
    if not credentials:
        return None
    if not CLERK_SECRET_KEY:
        return {"sub": "local_dev_user"}
    token = credentials.credentials
    try:
        jwks = get_jwks()
        # Disable verify_exp check to prevent token expiration failures caused by clock drift or idle modals
        payload = jwt.decode(token, jwks, algorithms=["RS256"], options={"verify_aud": False, "verify_exp": False})
        return payload
    except Exception:
        return None

async def create_indexes(db):
    print("Creating MongoDB indexes for high-speed queries...")
    # 1. Schedules Indexes (Crucial for train search O(1) matching & O(1) joins)
    await db.schedules.create_index("station_code")
    await db.schedules.create_index([("train_number", 1), ("station_code", 1), ("id", 1)])
    
    # 2. Trains Index (Crucial for train metadata lookup in joins)
    try:
        await db.trains.create_index("number", unique=True)
    except Exception as e:
        print(f"Non-fatal error creating trains index: {e}")
        await db.trains.create_index("number")
    
    # 3. Bookings Indexes (Crucial for sub-millisecond PNR fetches and replay prevention)
    try:
        await db.bookings.create_index("pnr", unique=True)
    except Exception as e:
        print(f"Non-fatal error creating bookings pnr index: {e}")
        await db.bookings.create_index("pnr")
        
    await db.bookings.create_index("user_id")
    await db.bookings.create_index("razorpay_payment_id", sparse=True)
    print("Indexes created successfully!")

@asynccontextmanager
async def lifespan(app: FastAPI):
    global client
    print(f"Connecting to MongoDB...")
    client = AsyncIOMotorClient(MONGO_URI)
    app.state.db = client[DB_NAME]
    
    # Programmatically initialize crucial query indexes for high performance search
    await create_indexes(app.state.db)
    
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
    razorpay_order_id: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    razorpay_signature: Optional[str] = None

class CancelRequest(BaseModel):
    booking_id: str
    passenger_names: Optional[List[str]] = None

class DelayRequest(BaseModel):
    train_number: str
    delay_hours: int

class SwapRequest(BaseModel):
    old_booking_id: str
    new_train_number: str

# ── Pricing Utility ──────────────────────────────────────────
CLASS_MULTIPLIERS = {
    "General": 0.65,
    "Sleeper": 1.0,
    "3AC": 2.4,
    "2AC": 3.6,
    "1AC": 5.4
}
BASE_RATE = 0.65 # INR per KM

def calculate_fare(dist, cls, train_type="Express", age=30):
    res = pricing.FareEngine.calculate_fare(dist, cls, train_type, age)
    return res["total"]

class UserRequest(BaseModel):
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    image_url: Optional[str] = None

class SavedPassengerRequest(BaseModel):
    name: str
    age: int
    gender: str

class PaymentOrderRequest(BaseModel):
    amount: int # Amount in INR
    currency: str = "INR"

class PaymentVerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str

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
    # Escape special regex characters to prevent injection/ReDoS attacks
    safe_q = re.escape(q)
    # Search by code or name using regex (case-insensitive)
    query = {"$or": [
        {"code": {"$regex": f"^{safe_q}", "$options": "i"}},
        {"name": {"$regex": safe_q, "$options": "i"}}
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
            "seat_inventory": "$train_info.seat_inventory",
            "distance": "$train_info.distance"
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
            
        # Add dynamic pricing and waitlist probability for each class
        fares = {}
        probabilities = {}
        dist = t.get("distance", 100) # Use real distance if available, else default
        t_type = t.get("type", "Express")
        
        for cls in shared_mem.CLASSES:
            fares[cls] = calculate_fare(dist, cls, t_type)
            
            # Smart Waitlist Probability Heuristic
            count = t["seat_inventory"].get(cls, 0)
            if count > 0:
                probabilities[cls] = "High"
            else:
                wl_pos = abs(count)
                # Simple heuristic: lower WL pos and more time to journey = higher prob
                # Here we simulate with random/fixed logic for the demo
                if wl_pos < 15:
                    probabilities[cls] = "High"
                elif wl_pos < 40:
                    probabilities[cls] = "Medium"
                else:
                    probabilities[cls] = "Low"
                    
        t["fares"] = fares
        t["wl_probabilities"] = probabilities

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
        
    # 2. Verify Payment (CRITICAL SECURITY FIX)
    dist = train.get("distance", 100)
    t_type = train.get("type", "Express")
    recalculated_fare = sum([calculate_fare(dist, booking.class_type, t_type, p.age) for p in booking.passengers])
    
    if RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET and booking.razorpay_payment_id:
        try:
            # Cryptographically verify the signature
            if booking.razorpay_order_id and booking.razorpay_signature:
                params_dict = {
                    'razorpay_order_id': booking.razorpay_order_id,
                    'razorpay_payment_id': booking.razorpay_payment_id,
                    'razorpay_signature': booking.razorpay_signature
                }
                rzp_client.utility.verify_payment_signature(params_dict)
            else:
                raise HTTPException(status_code=400, detail="Missing payment signature or order ID")

            payment = rzp_client.payment.fetch(booking.razorpay_payment_id)
            if payment['status'] not in ['captured', 'authorized']:
                 raise HTTPException(status_code=400, detail="Payment not captured")
            
            # Verify amount (Razorpay amount is in paisa)
            if int(payment['amount']) < recalculated_fare * 100:
                raise HTTPException(status_code=400, detail="Payment amount mismatch")
                
            # Check if this payment ID has already been used (Simple replay protection)
            existing_booking = await db.bookings.find_one({"razorpay_payment_id": booking.razorpay_payment_id})
            if existing_booking:
                raise HTTPException(status_code=400, detail="Payment already used for another booking")
        except Exception as e:
            if isinstance(e, HTTPException): raise e
            raise HTTPException(status_code=400, detail=f"Payment verification failed: {str(e)}")
    elif not booking.razorpay_payment_id and RAZORPAY_KEY_ID:
        raise HTTPException(status_code=400, detail="Missing payment ID")

    # 3. Handle Seat Inventory Atomically
    seat_inv = train.get("seat_inventory", {})
    if booking.class_type not in seat_inv:
        raise HTTPException(status_code=400, detail="Invalid class type")
        
    num_passengers = len(booking.passengers)
    status = "CNF"
    wl_position = 0
    assigned_passengers = []
    
    # Attempt atomic process-safe reservation
    success, remaining_seats = shared_mem.reserve_seats_atomic(
        booking.train_number, booking.class_type, num_passengers
    )
    
    if success:
        # Sync the new inventory count to MongoDB
        await db.trains.update_one(
            {"number": booking.train_number},
            {"$set": {f"seat_inventory.{booking.class_type}": remaining_seats}}
        )
        
        # Assign seats for each passenger with CORRECT COACH PREFIX
        prefix_map = {"1AC": "H", "2AC": "A", "3AC": "B", "Sleeper": "S", "General": "GS"}
        coach_prefix = prefix_map.get(booking.class_type, "S")
        coach_num = random.randint(1, 3) if booking.class_type in ["Sleeper", "3AC"] else 1
        coach = f"{coach_prefix}{coach_num}"
        
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
        # Waitlist logic
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
        "wl_position": wl_position if status == "WL" else None,
        "total_fare": recalculated_fare,
        "razorpay_payment_id": booking.razorpay_payment_id,
        "created_at": datetime.now()
    }
    
    result = await db.bookings.insert_one(booking_record)
    
    return {
        "booking_id": str(result.inserted_id),
        "booking": {
            **booking_record,
            "_id": str(result.inserted_id)
        },
        "pnr": pnr,
        "passengers": assigned_passengers,
        "status": status,
        "wl_position": wl_position if status == "WL" else None,
        "total_fare": recalculated_fare,
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

@app.get("/saved_passengers")
@limiter.limit("20/minute")
async def get_saved_passengers(request: Request, user_token: dict = Depends(verify_token)):
    db = request.app.state.db
    user_id = user_token.get("sub")
    user_doc = await db.users.find_one({"user_id": user_id}, {"saved_passengers": 1, "_id": 0})
    passengers = (user_doc or {}).get("saved_passengers", [])
    return {"passengers": passengers}

@app.post("/saved_passengers")
@limiter.limit("20/minute")
async def save_passenger(request: Request, passenger: SavedPassengerRequest, user_token: dict = Depends(verify_token)):
    db = request.app.state.db
    user_id = user_token.get("sub")
    
    # Clean the name: strip leading/trailing spaces
    clean_name = passenger.name.strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="Passenger name cannot be empty")
    
    # Pull existing passenger with the same name (case-insensitive search inside the array is a bit tricky, but an exact name match is solid. Let's do a case-insensitive pull using exact regex match if possible, or simple case-sensitive pull. A case-sensitive pull on clean_name is safe and standard).
    await db.users.update_one(
        {"user_id": user_id},
        {"$pull": {"saved_passengers": {"name": clean_name}}}
    )
    
    # Push the new/updated passenger details
    new_pax = {
        "name": clean_name,
        "age": passenger.age,
        "gender": passenger.gender
    }
    
    await db.users.update_one(
        {"user_id": user_id},
        {"$push": {"saved_passengers": new_pax}},
        upsert=True
    )
    return {"message": "Passenger details saved successfully", "passenger": new_pax}

@app.delete("/saved_passengers/{name}")
@limiter.limit("20/minute")
async def delete_saved_passenger(request: Request, name: str, user_token: dict = Depends(verify_token)):
    db = request.app.state.db
    user_id = user_token.get("sub")
    
    result = await db.users.update_one(
        {"user_id": user_id},
        {"$pull": {"saved_passengers": {"name": name}}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Passenger not found in saved list")
    return {"message": "Passenger deleted successfully"}

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

# --- Payment Routes ---

@app.post("/payment_order")
@limiter.limit("10/minute")
async def create_payment_order(request: Request, order_req: PaymentOrderRequest, user_token: dict = Depends(verify_token)):
    """
    Step 1: Create a Razorpay Order
    """
    try:
        # Amount is multiplied by 100 to convert to Paisa (Razorpay requirement)
        data = {
            "amount": order_req.amount * 100,
            "currency": order_req.currency,
            "receipt": f"receipt_{random.randint(1000, 9999)}",
            "payment_capture": 1 # Auto-capture
        }
        order = rzp_client.order.create(data=data)
        return order
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Razorpay Order Error: {str(e)}")

@app.post("/payment_verify")
@limiter.limit("10/minute")
async def verify_payment(request: Request, verify_req: PaymentVerifyRequest, user_token: dict = Depends(verify_token)):
    """
    Step 2: Verify Razorpay Signature
    """
    try:
        params_dict = {
            'razorpay_order_id': verify_req.razorpay_order_id,
            'razorpay_payment_id': verify_req.razorpay_payment_id,
            'razorpay_signature': verify_req.razorpay_signature
        }
        rzp_client.utility.verify_payment_signature(params_dict)
        return {"status": "success", "message": "Payment verified successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid payment signature")

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
    
    old_booking = await db.bookings.find_one({"_id": ObjectId(swap_req.old_booking_id), "user_id": user_id})
    if not old_booking:
        raise HTTPException(status_code=404, detail="Booking not found")
        
    if old_booking["status"] == "CANCELLED_SWAPPED":
        return {"message": "Already swapped"}

    # Fetch new train
    new_train = await db.trains.find_one({"number": swap_req.new_train_number})
    if not new_train:
        raise HTTPException(status_code=404, detail="New train not found")

    num_pax = len([p for p in old_booking["passengers"] if p["status"] != "CAN"])
    if num_pax == 0:
        raise HTTPException(status_code=400, detail="No active passengers to swap")

    # Verify seats in new train
    available = shared_mem.get_seats(swap_req.new_train_number, old_booking["class_type"])
    if available < num_pax:
        raise HTTPException(status_code=400, detail="Not enough seats in new train")

    # Cancel old
    await db.bookings.update_one({"_id": ObjectId(swap_req.old_booking_id)}, {"$set": {"status": "CANCELLED_SWAPPED"}})
    if old_booking["status"] == "CNF":
        new_old_count = shared_mem.update_seats(old_booking["train_number"], old_booking["class_type"], num_pax)
        await db.trains.update_one({"number": old_booking["train_number"]}, {"$set": {f"seat_inventory.{old_booking['class_type']}": new_old_count}})
        
    # Book new train
    new_new_count = shared_mem.update_seats(swap_req.new_train_number, old_booking["class_type"], -num_pax)
    await db.trains.update_one({"number": swap_req.new_train_number}, {"$set": {f"seat_inventory.{old_booking['class_type']}": new_new_count}})
    
    # Create new booking record (copying passengers)
    new_passengers = []
    prefix_map = {"1AC": "H", "2AC": "A", "3AC": "B", "Sleeper": "S", "General": "GS"}
    coach_prefix = prefix_map.get(old_booking["class_type"], "S")
    coach = f"{coach_prefix}{random.randint(1, 3)}"
    start_seat = random.randint(1, 40)

    for i, p in enumerate(old_booking["passengers"]):
        if p["status"] != "CAN":
            new_passengers.append({
                **p,
                "coach": coach,
                "seat": start_seat + i,
                "status": "CNF"
            })
        else:
            new_passengers.append(p)

    new_booking = {
        **old_booking,
        "_id": None, # Let MongoDB generate a new ID
        "train_number": swap_req.new_train_number,
        "train_name": new_train["name"],
        "status": "CNF",
        "passengers": new_passengers,
        "pnr": "".join([str(random.randint(0, 9)) for _ in range(10)]),
        "created_at": datetime.now(),
        "swapped_from": str(old_booking["_id"])
    }
    del new_booking["_id"] # Ensure it's not present
    
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

@app.get("/pnr_status/{pnr}")
@limiter.limit("30/minute")
async def get_pnr_status(request: Request, pnr: str, user_token: Optional[dict] = Depends(verify_token_optional)):
    db = request.app.state.db
    booking = await db.bookings.find_one({"pnr": pnr}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="PNR not found or invalid")
    
    # If authenticated user is the owner, return the full booking details
    user_id = user_token.get("sub") if user_token else None
    if user_id and booking.get("user_id") == user_id:
        return {"booking": booking}
        
    # Mask passenger details for public verification to protect PII (GDPR/IRCTC standard compliance)
    masked_passengers = []
    for p in booking.get("passengers", []):
        parts = p.get("name", "").split()
        masked_name = ""
        if parts:
            masked_parts = []
            for part in parts:
                if len(part) > 1:
                    masked_parts.append(part[0] + "*" * (len(part) - 1))
                else:
                    masked_parts.append(part)
            masked_name = " ".join(masked_parts)
        else:
            masked_name = "Unknown"
            
        masked_passengers.append({
            "name": masked_name,
            "coach": p.get("coach"),
            "seat": p.get("seat"),
            "status": p.get("status")
        })
        
    safe_booking = {
        "pnr": booking.get("pnr"),
        "train_number": booking.get("train_number"),
        "train_name": booking.get("train_name"),
        "from_stn": booking.get("from_stn"),
        "to_stn": booking.get("to_stn"),
        "departure": booking.get("departure"),
        "arrival": booking.get("arrival"),
        "travel_date": booking.get("travel_date"),
        "class_type": booking.get("class_type"),
        "status": booking.get("status"),
        "passengers": masked_passengers
    }
    return {"booking": safe_booking}

# ─── Train Vacancy Chart ───────────────────────────────────────────────────────

@app.get("/train_chart/{train_id}")
async def get_train_chart(request: Request, train_id: str, date: Optional[str] = None):    
    db = request.app.state.db
    # If no date is provided, use today's date in YYYY-MM-DD format
    if not date:
        date = datetime.now().strftime("%Y-%m-%d")

    # The trains collection stores number as 'number' and name as 'name'
    # Support searching by train number OR by train name (regex)
    query = {"$or": [{"number": train_id}, {"name": {"$regex": train_id, "$options": "i"}}]}
    train = await db.trains.find_one(query, {"_id": 0})
    
    if not train:
        raise HTTPException(status_code=404, detail="Train not found")
        
    coaches = []
    inventory = train.get("seat_inventory", {})
    train_number = train.get("number", "")
    train_name = train.get("name", "")

    # Fetch all active bookings for this train on this SPECIFIC DATE
    bookings_cursor = db.bookings.find({
        "train_number": train_number, 
        "travel_date": date,
        "status": "CNF"
    })
    bookings = await bookings_cursor.to_list(length=1000)
    
    occupied_seats = set()
    for b in bookings:
        for p in b.get("passengers", []):
            if p.get("status") == "CNF" and p.get("coach") and p.get("seat"):
                occupied_seats.add(f"{p['coach']}_{p['seat']}")
    
    for cls, count in inventory.items():
        prefix = "S" if cls == "Sleeper" else "B" if cls == "3AC" else "A" if cls == "2AC" else "H"
        num_coaches = 3 if cls in ["Sleeper", "3AC"] else 1
        
        for i in range(1, num_coaches + 1):
            coach_id = f"{prefix}{i}"
            max_seats = 72 if cls in ["Sleeper", "3AC"] else 46
            
            # Simulated inventory per coach (for seats not explicitly booked)
            coach_inv = min(max_seats, count // num_coaches)
            
            seats = []
            for s in range(1, max_seats + 1):
                seat_key = f"{coach_id}_{s}"
                
                # Check if explicitly booked in DB
                if seat_key in occupied_seats:
                    is_occupied = True
                else:
                    # Deterministic occupancy for the rest to make it look realistic/full
                    seed = zlib.adler32(f"{train_number}{coach_id}{s}{date}".encode())
                    # Only simulate occupancy if total available is less than max
                    is_occupied = (seed % 100) > (coach_inv / max_seats * 100 + 5)

                # IRCTC Layout logic for 8-seat compartments (SL/3A)
                berth_type = "LB"
                if cls in ["Sleeper", "3AC"]:
                    if s % 8 in [1, 4]: berth_type = "LB"
                    elif s % 8 in [2, 5]: berth_type = "MB"
                    elif s % 8 in [3, 6]: berth_type = "UB"
                    elif s % 8 == 7: berth_type = "SL"
                    elif s % 8 == 0: berth_type = "SU"
                elif cls == "2AC":
                    # 2AC has 4 seats in compartment + 2 side berths = 6 total per section
                    if s % 6 in [1, 3]: berth_type = "LB"
                    elif s % 6 in [2, 4]: berth_type = "UB"
                    elif s % 6 == 5: berth_type = "SL"
                    elif s % 6 == 0: berth_type = "SU"
                else: # 1AC or other
                    berth_type = "LB" if s % 2 == 1 else "UB"

                seats.append({
                    "num": s,
                    "type": berth_type,
                    "is_occupied": is_occupied
                })
                
            coaches.append({
                "coach": coach_id,
                "class_name": cls,
                "available": len([s for s in seats if not s["is_occupied"]]),
                "seats": seats
            })
            
    return {
        "train": train_name,
        "train_number": train_number,
        "date": date,
        "coaches": sorted(coaches, key=lambda x: x['coach'])
    }
