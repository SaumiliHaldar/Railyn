import json
import random
import os
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# Database connection
MONGO_URI = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = "railyn_db"

print(f"Connecting to MongoDB...")
client = MongoClient(MONGO_URI)
db = client[DB_NAME]

# Collections
stations_col = db["stations"]
trains_col = db["trains"]
schedules_col = db["schedules"]

# Clear existing data
print("Clearing existing collections...")
stations_col.delete_many({})
trains_col.delete_many({})
schedules_col.delete_many({})

DATA_DIR = os.path.join(os.path.dirname(__file__), "data_repo")
STATIONS_FILE = os.path.join(DATA_DIR, "stations.json")
TRAINS_FILE = os.path.join(DATA_DIR, "trains.json")
SCHEDULES_FILE = os.path.join(DATA_DIR, "schedules.json")

def generate_seat_inventory():
    """
    Generates a realistic seat inventory based on Indian Railways LHB coach 
    compositions. Total passenger coaches are strictly capped around 22.
    """
    # Determine number of coaches per class
    num_1ac = random.choice([0, 1])           # 0 to 1 coach
    num_2ac = random.randint(1, 3)            # 1 to 3 coaches
    num_3ac = random.randint(4, 8)            # 4 to 8 coaches
    num_sl = random.randint(6, 12)            # 6 to 12 coaches
    num_gen = random.randint(2, 4)            # 2 to 4 coaches
    
    # Platform limit restriction: max ~22 passenger coaches (leaving 2 for SLR/Generator)
    while (num_1ac + num_2ac + num_3ac + num_sl + num_gen) > 22:
        if num_sl > 6: num_sl -= 1
        elif num_3ac > 4: num_3ac -= 1
        elif num_gen > 2: num_gen -= 1
        elif num_2ac > 1: num_2ac -= 1
        else: break

    # Multiply by standard LHB seating capacity
    return {
        "1AC": num_1ac * 24,   # 24 seats per 1AC coach
        "2AC": num_2ac * 54,   # 54 seats per 2AC coach
        "3AC": num_3ac * 72,   # 72 seats per 3AC coach
        "Sleeper": num_sl * 80,  # 80 seats per Sleeper coach
        "General": num_gen * 100 # ~100 seats per General coach
    }

print("Loading stations...")
with open(STATIONS_FILE, 'r', encoding='utf-8') as f:
    stations_data = json.load(f)
    stations_to_insert = []
    for feature in stations_data.get('features', []):
        props = feature.get('properties', {})
        geom = feature.get('geometry', {})
        stations_to_insert.append({
            "code": props.get('code'),
            "name": props.get('name'),
            "zone": props.get('zone'),
            "state": props.get('state'),
            "location": geom
        })
    if stations_to_insert:
        stations_col.insert_many(stations_to_insert)
        print(f"Inserted {len(stations_to_insert)} stations.")

print("Loading trains...")
with open(TRAINS_FILE, 'r', encoding='utf-8') as f:
    trains_data = json.load(f)
    trains_to_insert = []
    for feature in trains_data.get('features', []):
        props = feature.get('properties', {})
        geom = feature.get('geometry', {})
        
        # Adding synthetic seat inventory
        props['seat_inventory'] = generate_seat_inventory()
        props['route_geometry'] = geom
        
        trains_to_insert.append(props)
        
    if trains_to_insert:
        trains_col.insert_many(trains_to_insert)
        print(f"Inserted {len(trains_to_insert)} trains.")

print("Loading schedules... (This may take a while)")
with open(SCHEDULES_FILE, 'r', encoding='utf-8') as f:
    schedules_data = json.load(f)
    
    # We might want to chunk the inserts for large datasets
    batch_size = 10000
    for i in range(0, len(schedules_data), batch_size):
        batch = schedules_data[i:i + batch_size]
        schedules_col.insert_many(batch)
        print(f"Inserted {min(i + batch_size, len(schedules_data))}/{len(schedules_data)} schedules...", end='\r')
    print(f"\nInserted a total of {len(schedules_data)} schedules.")

print("Seeding complete! 🚀")
