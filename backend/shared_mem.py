import os
import json
import multiprocessing
import numpy as np
import time
from multiprocessing import shared_memory
from dotenv import load_dotenv
import logging

load_dotenv()
# Configuration
SHM_NAME = "railyn_seat_inventory"
CLASSES = ["1AC", "2AC", "3AC", "Sleeper", "General"]
NUM_CLASSES = len(CLASSES)

# Mapping of train_number to index in shared memory
_train_to_idx = {}
_shm = None
_inventory_array = None

class WALEngine:
    def __init__(self, filepath=None):
        # File logging is completely disabled to avoid disk clutter per user request.
        self.filepath = None

    def write_pending_log(self, tx_id, train_number, class_type, delta, expected_remaining):
        """Logs a pending seat allocation to the console instead of a file."""

        logging.getLogger("railyn.wal").info(
            f"WAL [PENDING]: tx_id={tx_id}, train={train_number}, class={class_type}, delta={delta}, remaining={expected_remaining}"
        )

    def write_commit_log(self, tx_id):
        """Logs a committed seat allocation to the console instead of a file."""

        logging.getLogger("railyn.wal").info(f"WAL [COMMIT]: tx_id={tx_id}")

    async def recover_state(self, db):
        """Clean start - file logging is disabled."""
        logging.getLogger("railyn.wal").info("WAL: Log file disabled. Clean start.")

wal_engine = WALEngine()

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


# Process and Thread Lock for synchronization
_shm_lock = multiprocessing.Lock()

def reserve_seats_atomic(train_number, class_type, num_passengers, tx_id=None):
    """
    Thread-safe and process-safe seat allocation.
    Performs the check and reservation atomically.
    Returns a tuple: (success: bool, remaining_seats: int)
    """
    if train_number not in _train_to_idx or class_type not in CLASSES:
        return False, 0
    
    idx = _train_to_idx[train_number]
    cls_idx = CLASSES.index(class_type)
    
    with _shm_lock:
        current_seats = int(_inventory_array[idx, cls_idx])
        if current_seats >= num_passengers:
            _inventory_array[idx, cls_idx] -= num_passengers
            new_seats = int(_inventory_array[idx, cls_idx])
            
            if tx_id:
                try:
                    wal_engine.write_pending_log(tx_id, train_number, class_type, num_passengers, new_seats)
                except Exception as e:
                    print(f"WAL Write Error: {e}")
                    
            return True, new_seats
        return False, current_seats

