import asyncio
import json
import random
import paho.mqtt.client as mqtt

BROKER = "broker.emqx.io"
PORT = 1883
TOPIC_EVENTS = "railyn/station/events"

async def simulate_trains():
    """Background task to simulate trains arriving, departing, and getting delayed."""
    client = mqtt.Client()
    client.connect(BROKER, PORT, 60)
    
    print("🚂 Train Simulator started...")
    
    trains = [f"T-{random.randint(1000, 9999)}" for _ in range(5)]
    events = ["arriving", "departed", "delayed"]
    
    while True:
        await asyncio.sleep(random.randint(5, 15))  # Wait 5 to 15 seconds
        
        train_id = random.choice(trains)
        event_type = random.choice(events)
        
        payload = {
            "type": event_type,
            "train_id": train_id
        }
        
        if event_type == "delayed":
            payload["delay_mins"] = random.choice([10, 20, 30, 45, 60])
            
        print(f"📡 SIMULATOR: Publishing event -> {payload}")
        client.publish(TOPIC_EVENTS, json.dumps(payload))
