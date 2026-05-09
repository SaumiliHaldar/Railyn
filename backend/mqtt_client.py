import paho.mqtt.client as mqtt
import json
import random

BROKER = "broker.emqx.io"
PORT = 1883
TOPIC_EVENTS = "railyn/station/events"
TOPIC_UPDATES = "railyn/station/updates"

client = None

def on_connect(client, userdata, flags, rc):
    print(f"✅ MQTT Listener connected to {BROKER} with result code {rc}")
    client.subscribe(TOPIC_EVENTS)

def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode())
        print(f"📥 Received MQTT Event: {payload}")
        process_train_event(payload)
    except Exception as e:
        print(f"Error processing message: {e}")

def process_train_event(event):
    """The Autonomy Engine Rules"""
    # Import locally to avoid circular dependencies if we need to interact with app.py's functions
    # For now, we'll implement shared memory access directly here
    from app import read_platforms, update_platform
    
    event_type = event.get("type")
    train_id = event.get("train_id")
    
    if not event_type or not train_id:
        return

    platforms = read_platforms()

    if event_type == "arriving":
        # Find a free platform
        assigned = False
        for pid, data in platforms.items():
            if data["status"] == "free":
                # Claim it
                update_platform(pid, "boarding", train_id)
                assigned = True
                print(f"🚉 AUTONOMY: Assigned {train_id} to {pid}")
                
                # Broadcast the assignment
                publish_update({
                    "type": "platform_assigned",
                    "train_id": train_id,
                    "platform": pid,
                    "message": f"Train {train_id} assigned to {pid}"
                })
                break
        
        if not assigned:
            print(f"⚠️ AUTONOMY: No free platforms for {train_id}!")
            publish_update({
                "type": "conflict",
                "train_id": train_id,
                "message": "No platforms available. Train held outside station."
            })

    elif event_type == "departed":
        # Free the platform
        for pid, data in platforms.items():
            if data["train_id"] == train_id:
                update_platform(pid, "free", None)
                print(f"🚉 AUTONOMY: Freed {pid} as {train_id} departed")
                
                publish_update({
                    "type": "platform_freed",
                    "train_id": train_id,
                    "platform": pid,
                    "message": f"Train {train_id} departed. {pid} is now free."
                })
                break

    elif event_type == "delayed":
        # Just broadcast it to the frontend
        print(f"⏱️ AUTONOMY: Cascading delay for {train_id}")
        publish_update({
            "type": "delay_alert",
            "train_id": train_id,
            "delay_mins": event.get("delay_mins", 15),
            "message": f"Train {train_id} delayed by {event.get('delay_mins', 15)} mins"
        })

def publish_update(update_data):
    """Publish the autonomous decision back to the broker for the frontend."""
    if client:
        client.publish(TOPIC_UPDATES, json.dumps(update_data))

def start_mqtt_listener():
    """Start the MQTT client in a background thread."""
    global client
    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_message = on_message

    print("Starting MQTT Listener...")
    client.connect(BROKER, PORT, 60)
    # loop_start() runs a background thread automatically
    client.loop_start()

def stop_mqtt_listener():
    """Stop the MQTT client."""
    global client
    if client:
        print("Stopping MQTT Listener...")
        client.loop_stop()
        client.disconnect()
