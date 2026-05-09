import os
import json
from contextlib import asynccontextmanager
from multiprocessing import shared_memory
from fastapi import FastAPI, Depends, HTTPException, status, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import jwt
import asyncio
from slowapi import Limiter, _rate_limit_exceeded_handler
from mqtt_client import start_mqtt_listener, stop_mqtt_listener
from train_agent import simulate_trains
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request

limiter = Limiter(key_func=get_remote_address)
# --- Configuration & Constants ---
SHM_NAME = "railyn_platforms_shm"
SHM_SIZE = 1024  # 1 KB is plenty for platforms serialized as JSON
CLERK_PEM_PUBLIC_KEY = os.getenv("CLERK_PEM_PUBLIC_KEY", "")

# --- Shared Memory Manager ---
def initialize_shared_memory():
    """Create or attach to the shared memory block for platforms."""
    try:
        shm = shared_memory.SharedMemory(name=SHM_NAME, create=True, size=SHM_SIZE)
    except FileExistsError:
        shm = shared_memory.SharedMemory(name=SHM_NAME, create=False)
        
    initial_data = {
        f"P{i}": {"status": "free", "train_id": None} for i in range(1, 6)
    }
    _write_to_shm(shm, initial_data)
    return shm

def _write_to_shm(shm: shared_memory.SharedMemory, data: dict):
    encoded_data = json.dumps(data).encode('utf-8')
    padded_data = encoded_data.ljust(SHM_SIZE, b' ')
    shm.buf[:SHM_SIZE] = padded_data

def read_platforms():
    """Read platform data from shared memory."""
    try:
        shm = shared_memory.SharedMemory(name=SHM_NAME, create=False)
        data_string = bytes(shm.buf[:]).decode('utf-8', errors='ignore').rstrip('\x00 ')
        if not data_string:
            return {}
        return json.loads(data_string)
    except FileNotFoundError:
        return {}
    finally:
        if 'shm' in locals():
            shm.close()

def update_platform(platform_id: str, status: str, train_id: str = None):
    try:
        shm = shared_memory.SharedMemory(name=SHM_NAME, create=False)
        current_data = read_platforms()
        
        if platform_id in current_data:
            current_data[platform_id] = {"status": status, "train_id": train_id}
            _write_to_shm(shm, current_data)
            return True
        return False
    except FileNotFoundError:
        return False
    finally:
        if 'shm' in locals():
            shm.close()

def cleanup_shared_memory():
    """Unlink the shared memory block on shutdown."""
    try:
        shm = shared_memory.SharedMemory(name=SHM_NAME, create=False)
        shm.close()
        shm.unlink()
    except FileNotFoundError:
        pass

# --- Clerk Authentication Dependency ---
def verify_clerk_token(authorization: str = Header(None)):
    """Middleware to verify Clerk JWT token."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header"
        )
    
    token = authorization.split(" ")[1]
    
    # If no public key is set (e.g. local testing without Clerk setup yet), let it pass
    # IN PRODUCTION, REMOVE THIS BYPASS
    if not CLERK_PEM_PUBLIC_KEY:
        print("WARNING: CLERK_PEM_PUBLIC_KEY not set. Bypassing auth for development.")
        return {"sub": "dev_user"}
        
    try:
        # Verify the token using the Clerk Public Key
        decoded = jwt.decode(token, CLERK_PEM_PUBLIC_KEY, algorithms=["RS256"])
        return decoded
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# --- FastAPI App Setup ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Initializing Shared Memory for platforms...")
    global_shm = initialize_shared_memory()
    
    # Start MQTT Listener
    start_mqtt_listener()
    
    # Start Train Simulator as a background task
    simulator_task = asyncio.create_task(simulate_trains())
    
    yield
    
    print("Cleaning up...")
    simulator_task.cancel()
    stop_mqtt_listener()
    cleanup_shared_memory()
    # explicitly keep global_shm alive until cleanup
    del global_shm

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

# --- Routes ---
@app.get("/")
@limiter.limit("10/minute")
async def root(request: Request):
    return {"message": "Hello, User! Welcome to Railyn."}

@app.get("/healthz")
@limiter.limit("60/minute")
async def health_check(request: Request):
    return {"status": "ok"}

@app.get("/platforms")
@limiter.limit("60/minute")
def get_platform_state(request: Request, user: dict = Depends(verify_clerk_token)):
    """Returns the current state of all platforms from Shared Memory. Protected by Clerk."""
    platforms = read_platforms()
    return {"platforms": platforms}

@app.post("/platforms/{platform_id}/status")
@limiter.limit("20/minute")
def set_platform_status(request: Request, platform_id: str, status: str, train_id: str = None, user: dict = Depends(verify_clerk_token)):
    """Manually update a platform. Protected by Clerk."""
    success = update_platform(platform_id, status, train_id)
    if not success:
        raise HTTPException(status_code=404, detail="Platform not found")
    return {"message": f"Platform {platform_id} updated successfully"}
