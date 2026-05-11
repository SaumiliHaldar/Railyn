import os
import json
import numpy as np
from multiprocessing import shared_memory
from dotenv import load_dotenv

load_dotenv()
# Configuration
SHM_NAME = "railyn_seat_inventory"
CLASSES = ["1AC", "2AC", "3AC", "Sleeper", "General"]
NUM_CLASSES = len(CLASSES)

CLASSES = ["1AC", "2AC", "3AC", "Sleeper", "General"]
NUM_CLASSES = len(CLASSES)

# Mapping of train_number to index in shared memory
_train_to_idx = {}
_shm = None
_inventory_array = None

async def init_shm(db):
    """Initializes shared memory. Should be called once by the main process."""
    global _shm, _inventory_array, _train_to_idx
    
    # Fetch all trains to determine size and mapping using the provided async db
    cursor = db.trains.find({}, {"number": 1, "seat_inventory": 1})
    trains = await cursor.to_list(length=10000)
    num_trains = len(trains)
    
    # Calculate size: num_trains * num_classes * 4 bytes (int32)
    size = num_trains * NUM_CLASSES * 4
    
    try:
        # Try to attach if it exists
        _shm = shared_memory.SharedMemory(name=SHM_NAME)
        print(f"Attached to existing shared memory: {SHM_NAME}")
    except FileNotFoundError:
        # Create if it doesn't exist
        _shm = shared_memory.SharedMemory(name=SHM_NAME, create=True, size=size)
        print(f"Created new shared memory: {SHM_NAME} (Size: {size} bytes)")
    
    # Create numpy array backed by shared memory
    _inventory_array = np.ndarray((num_trains, NUM_CLASSES), dtype=np.int32, buffer=_shm.buf)
    
    # Populate mapping and initial data
    for i, train in enumerate(trains):
        train_num = train["number"]
        _train_to_idx[train_num] = i
        
        # If we created the SHM, populate it from DB
        inv = train.get("seat_inventory", {})
        for j, cls in enumerate(CLASSES):
            _inventory_array[i, j] = inv.get(cls, 0)
            
    print(f"Shared Memory initialized with {num_trains} trains.")

def get_seats(train_number, class_type):
    """Returns the current seat count for a train and class."""
    if train_number not in _train_to_idx or class_type not in CLASSES:
        return None
    
    idx = _train_to_idx[train_number]
    cls_idx = CLASSES.index(class_type)
    return int(_inventory_array[idx, cls_idx])

def update_seats(train_number, class_type, delta):
    """Updates the seat count by delta. Returns the new count."""
    if train_number not in _train_to_idx or class_type not in CLASSES:
        return None
    
    idx = _train_to_idx[train_number]
    cls_idx = CLASSES.index(class_type)
    
    # Atomic-ish update
    _inventory_array[idx, cls_idx] += delta
    return int(_inventory_array[idx, cls_idx])


def cleanup():
    """Closes and unlinks shared memory."""
    global _shm
    if _shm:
        _shm.close()
        try:
            _shm.unlink()
        except FileNotFoundError:
            pass
        _shm = None

