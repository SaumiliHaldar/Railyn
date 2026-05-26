import os
import json
import paho.mqtt.client as mqtt
from dotenv import load_dotenv
import shared_mem
from mailer import trigger_email

load_dotenv()

MQTT_BROKER = "broker.emqx.io"
MQTT_PORT = 1883
print("Connecting to MQTT Broker...")
mqtt_client = mqtt.Client()
try:
    mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
    mqtt_client.loop_start()
    print("Connected to MQTT!")
except Exception as e:
    print("MQTT Connection Failed:", e)

def push_notification(user_id, topic_suffix, payload):
    topic = f"railyn/user/{user_id}/{topic_suffix}"
    mqtt_client.publish(topic, json.dumps(payload))
    print(f"MQTT Publish -> {topic}: {payload}")

async def handle_waitlist_upgrade(db, train_number, class_type):
    """Zero-Babysitting Waitlist Engine"""
    # 1. Check if there is an active waitlist for this train and class
    wl_booking = await db.bookings.find_one(
        {"train_number": train_number, "class_type": class_type, "status": "WL"},
        sort=[("wl_position", 1)]
    )
    if not wl_booking:
        return # No waitlist to clear
        
    # 2. Check if there are seats available in SHM
    available = shared_mem.get_seats(train_number, class_type)
    
    if available is not None and available > 0:
        print(f"Upgrading Waitlist for {train_number} {class_type}!")
        # 1. Update Shared Memory (Immediate)
        new_count = shared_mem.update_seats(train_number, class_type, -1)
        
        # 2. Upgrade to CNF in DB
        await db.bookings.update_one({"_id": wl_booking["_id"]}, {"$set": {"status": "CNF", "wl_position": None}})
        
        # 3. Sync inventory to DB
        await db.trains.update_one({"number": train_number}, {"$set": {f"seat_inventory.{class_type}": new_count}})
        # Shift other waitlist positions up
        await db.bookings.update_many(
            {"train_number": train_number, "class_type": class_type, "status": "WL", "wl_position": {"$gt": wl_booking["wl_position"]}},
            {"$inc": {"wl_position": -1}}
        )
        
        # Fire MQTT Notification
        push_notification(wl_booking["user_id"], "notify", {
            "title": "Ticket Confirmed! 🎉",
            "message": f"Your waitlisted ticket for Train {train_number} ({class_type}) has automatically been upgraded to CONFIRMED!"
        })
        
        # Trigger Non-blocking Waitlist Upgrade Email
        import asyncio
        passengers_data = [
            {"name": p["name"], "coach": p.get("coach", "B1"), "seat": p.get("seat", 10)}
            for p in wl_booking.get("passengers", [{"name": wl_booking.get("user_name", "Passenger")}])
        ]
            
        asyncio.create_task(trigger_email("WL_UPGRADE", wl_booking.get("user_email", "passenger@railyn.co"), {
            "user_name": wl_booking.get("user_name", "Valued Passenger"),
            "pnr": wl_booking.get("pnr"),
            "train_number": train_number,
            "train_name": wl_booking.get("train_name", "Express"),
            "class_type": class_type,
            "travel_date": wl_booking.get("travel_date", "N/A"),
            "passengers": passengers_data
        }))

async def handle_delay(db, delay_event):
    """The Controlled Delay Simulator"""
    train_number = delay_event["train_number"]
    delay_hours = delay_event["delay_hours"]
    print(f"Processing {delay_hours}hr delay for Train {train_number}...")
    
    # 1. Find all CNF users on this train
    cursor = db.bookings.find({"train_number": train_number, "status": "CNF"})
    affected_bookings = await cursor.to_list(length=1000)
    
    for booking in affected_bookings:
        # 2. Find alternative train between from_stn and to_stn
        alt_train_cursor = db.schedules.aggregate([
            {"$match": {"station_code": booking.get("from_stn", ""), "train_number": {"$ne": train_number}}},
            {"$lookup": {
                "from": "schedules",
                "let": {"t_num": "$train_number", "f_id": "$id"},
                "pipeline": [
                    {"$match": {"$expr": {"$and": [
                        {"$eq": ["$train_number", "$$t_num"]},
                        {"$eq": ["$station_code", booking.get("to_stn", "")]},
                        {"$gt": ["$id", "$$f_id"]}
                    ]}}}
                ],
                "as": "dest"
            }},
            {"$match": {"dest": {"$ne": []}}},
            {"$limit": 1} # Find the first available alternative
        ])
        
        alt_train = await alt_train_cursor.to_list(length=1)
        if alt_train:
            new_train_number = alt_train[0]["train_number"]
            
            # Check availability in Shared Memory before proposing
            available = shared_mem.get_seats(new_train_number, booking["class_type"])
            num_passengers = len(booking.get("passengers", [1])) # Default to 1 if not found
            
            if available is not None and available >= num_passengers:
                print(f"Proposing swap from {train_number} to {new_train_number} for user {booking['user_id']}")
                
                # 3. Fire Actionable MQTT Prompt
                push_notification(booking["user_id"], "action", {
                    "title": "Train Delayed ⚠️",
                    "message": f"Train {train_number} is delayed by {delay_hours} hours. Seats are available on {new_train_number}.",
                    "action_prompt": f"Swap to Train {new_train_number} arriving shortly?",
                    "action_endpoint": "/swap_tkt",
                    "payload": {
                        "old_booking_id": str(booking["_id"]),
                        "new_train_number": new_train_number
                    }
                })
            else:
                print(f"Skipping swap proposal for user {booking['user_id']}: No seats on alternative {new_train_number}")
