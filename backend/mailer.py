import os
import requests
import asyncio
import base64
from datetime import datetime
from dotenv import load_dotenv
from PIL import Image,ImageOps
import io

load_dotenv()

APPS_SCRIPT_URL = os.getenv("APPS_SCRIPT_URL")
TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "templates")
ASSETS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "src", "assets"))


def get_logo_src() -> str:
    """Gets a web-safe, stable public HTTPS URL for the Railyn logo to ensure rendering in all email clients (like Gmail/Outlook).
    Uses LOGO_URL from environment variables if set, falling back to the raw GitHub asset."""
    logo_env = os.getenv("LOGO_URL")
    if logo_env:
        print(f"[Mailer] Loading logo from LOGO_URL env: {logo_env}")
        return logo_env
        
    # Default to the highly reliable, CDN-cached raw GitHub URL for your frontend assets
    fallback_url = "https://raw.githubusercontent.com/SaumiliHaldar/Railyn/main/frontend/src/assets/logo1.png"
    print(f"[Mailer] Using stable GitHub raw URL fallback: {fallback_url}")
    return fallback_url


def load_template(filename: str) -> str:
    """Reads a template file securely from the templates directory."""
    path = os.path.join(TEMPLATES_DIR, filename)
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        print(f"[Mailer Error] Failed to read template {filename}: {e}")
        return ""


def send_to_apps_script(email: str, subject: str, html_body: str, pdf_html: str = None, pnr: str = "Ticket"):
    """Synchronously issues the POST request to the deployed Google Apps Script URL."""
    if not APPS_SCRIPT_URL:
        print("WARNING: APPS_SCRIPT_URL is not configured in .env. Skipping email dispatch.")
        return False
        
    try:
        payload = {
            "email": email,
            "subject": subject,
            "htmlBody": html_body,
            "pdfHtml": pdf_html,
            "pnr": pnr
        }
        res = requests.post(APPS_SCRIPT_URL, json=payload, timeout=15)
        if res.status_code == 200:
            result = res.json()
            if result.get("status") == "success":
                print(f"[Mailer] Email '{subject}' dispatched successfully!")
                return True
            else:
                print(f"[Mailer Error] Apps Script execution failed: {result.get('message')}")
        else:
            print(f"[Mailer Error] POST failed with status: {res.status_code}")
    except Exception as e:
        print(f"[Mailer Exception] Failed to send email '{subject}': {e}")
    return False


def format_to_ddmmyyyy(date_str: str) -> str:
    """Formats a YYYY-MM-DD date string to DD-MM-YYYY format for formal presentation."""
    if not date_str:
        return ""
    parts = date_str.split("-")
    if len(parts) == 3 and len(parts[0]) == 2:
        return date_str
    if len(parts) == 3 and len(parts[0]) == 4:
        return f"{parts[2]}-{parts[1]}-{parts[0]}"
    try:
        from datetime import datetime
        d = datetime.strptime(date_str, "%Y-%m-%d")
        return d.strftime("%d-%m-%Y")
    except:
        return date_str


async def trigger_email(email_type: str, email: str, data: dict):
    """
    Asynchronously renders base and view templates, schedules non-blocking background dispatch.
    Uses simplified, user-readable subjects and dynamically embeds base64 project logo.
    """
    if not APPS_SCRIPT_URL:
        print("WARNING: APPS_SCRIPT_URL is not set. Email notification will not be sent.")
        return
        
    subject = ""
    content_html = ""
    pdf_html = None
    pnr = data.get("pnr", "Ticket")
    
    # Format travel date for presentation
    formatted_date = format_to_ddmmyyyy(data.get("travel_date") or "")
    
    # 1. Fetch Dynamic Base64 logo.png
    logo_src = get_logo_src()
    
    # 2. Load Base Layout
    base_layout = load_template("base.html")
    if not base_layout:
        print("[Mailer Error] Master layout base.html not found.")
        return
        
    # Inject logo.png into the base layout header
    base_layout = base_layout.replace("{logo_src}", logo_src)

    # 3. Process View Layouts
    if email_type == "BOOKING":
        subject = f"Booking Confirmed - PNR: {pnr}"
        status = data.get("status", "CNF")
        
        # Format Status Styles
        status_label = "Ticket Confirmed & PDF Attached" if status == "CNF" else "Seat Waitlisted — Added to Queue"
        alert_color = "#F0F7F1" if status == "CNF" else "#fffbeb"
        border_color = "#1E6F2B" if status == "CNF" else "#fbbf24"
        text_color = "#1E6F2B" if status == "CNF" else "#b45309"
        
        passenger_rows = ""
        for idx, p in enumerate(data.get("passengers", [])):
            p_status = p.get("status", status)
            passenger_rows += f"""
            <tr style="border-bottom:1px solid #e2e8f0; font-size:13px; text-align: left;">
              <td style="padding:10px; color:#334155;">{idx + 1}</td>
              <td style="padding:10px; font-weight:600; color:#0f172a;">{p['name']}</td>
              <td style="padding:10px; color:#475569;">{p['age']} / {p.get('gender', 'M')}</td>
              <td style="padding:10px; color:#1E6F2B; font-weight:bold;">{p.get('coach', 'WL')}-{p.get('seat', data.get('wl_position', idx+1))}</td>
              <td style="padding:10px;"><span style="background-color:{'#F0F7F1; color:#1E6F2B;' if p_status == 'CNF' else '#fffbeb; color:#b45309;'} padding:3px 8px; border-radius:4px; font-size:10px; font-weight:bold;">{p_status}</span></td>
            </tr>"""
            
        booking_view = load_template("booking.html")
        # Replace default placeholder styles with actual dynamic styles to skin the alert box
        booking_view = booking_view.replace(
            'style="background-color: transparent; border-left: 5px solid transparent; padding: 15px; border-radius: 6px; margin-bottom: 25px;"',
            f'style="background-color: {alert_color}; border-left: 5px solid {border_color}; padding: 15px; border-radius: 6px; margin-bottom: 25px;"'
        )
        booking_view = booking_view.replace(
            'style="margin: 0; font-size: 15px; color: black; font-weight: 700;"',
            f'style="margin: 0; font-size: 15px; color: {text_color}; font-weight: 700;"'
        )
        content_html = booking_view.format(
            status_label=status_label,
            train_number=data.get("train_number"),
            train_name=data.get("train_name"),
            from_stn=data.get("from_stn"),
            to_stn=data.get("to_stn"),
            travel_date=formatted_date,
            class_type=data.get("class_type"),
            pnr=pnr,
            passenger_rows=passenger_rows
        )
        
        # Fetch QR code base64 from the existing app.py endpoint logic via dynamic import to prevent circular dependency
        from app import generate_qr
        
        passengers = data.get("passengers", [])
        first_pax = passengers[0] if passengers else {}
        name = first_pax.get("name")
        age = str(first_pax.get("age")) if first_pax.get("age") is not None else None
        coach = first_pax.get("coach")
        seat = str(first_pax.get("seat")) if first_pax.get("seat") is not None else None
        pax_count = str(len(passengers))
        
        try:
            qr_response = await generate_qr(
                pnr=pnr,
                name=name,
                age=age,
                train_name=data.get("train_name"),
                train_no=data.get("train_number"),
                from_stn=data.get("from_stn"),
                to_stn=data.get("to_stn"),
                date=formatted_date,
                class_type=data.get("class_type"),
                coach=coach,
                seat=seat,
                pax_count=pax_count
            )
            qr_url = qr_response.get("qr_data", "")
        except Exception as e:
            print(f"[Mailer Error] Failed to generate QR code locally: {e}")
            # Fallback to qrserver if local generation fails
            import urllib.parse
            qr_data_string = f"RAILYN|PNR:{pnr}|TRAIN:{data.get('train_number')}|CLASS:{data.get('class_type')}|DATE:{formatted_date}"
            qr_url = f"https://api.qrserver.com/v1/create-qr-code/?size=120x120&data={urllib.parse.quote(qr_data_string)}"
        
        pdf_ticket_view = load_template("pdf_ticket.html")
        pdf_html = pdf_ticket_view
        pdf_html = pdf_html.replace("{logo_src}", logo_src)
        pdf_html = pdf_html.replace("{pnr}", pnr)
        pdf_html = pdf_html.replace("{train_number}", data.get("train_number") or "")
        pdf_html = pdf_html.replace("{train_name}", data.get("train_name") or "")
        pdf_html = pdf_html.replace("{travel_date}", formatted_date or "")
        pdf_html = pdf_html.replace("{from_stn}", data.get("from_stn") or "")
        pdf_html = pdf_html.replace("{to_stn}", data.get("to_stn") or "")
        pdf_html = pdf_html.replace("{departure}", data.get("departure") or "")
        pdf_html = pdf_html.replace("{arrival}", data.get("arrival") or "")
        pdf_html = pdf_html.replace("{class_type}", data.get("class_type") or "")
        pdf_html = pdf_html.replace("{user_name}", data.get("user_name") or "Passenger")
        pdf_html = pdf_html.replace("{passenger_rows}", passenger_rows)
        pdf_html = pdf_html.replace("{qr_url}", qr_url)
        pdf_html = pdf_html.replace("{total_fare}", str(data.get("total_fare", 0)))
        pdf_html = pdf_html.replace("{razorpay_payment_id}", data.get("razorpay_payment_id") or "DIRECT_WALLET")
        
    elif email_type == "CANCEL":
        subject = f"Ticket Cancelled - PNR: {pnr}"
        
        passenger_rows = ""
        for idx, name in enumerate(data.get("cancelled_passengers", [])):
            passenger_rows += f"""
            <tr style="border-bottom:1px solid #e2e8f0; font-size:13px;">
              <td style="padding:10px; color:#334155;">{idx + 1}</td>
              <td style="padding:10px; font-weight:600; color:#334155;">{name}</td>
              <td style="padding:10px; color:#dc2626; font-weight:bold;">CANCELLED</td>
              <td style="padding:10px; color:#64748b; font-size:12px;">Refund Processed</td>
            </tr>"""
            
        cancel_view = load_template("cancel.html")
        content_html = cancel_view.format(
            pnr=pnr,
            train_number=data.get("train_number"),
            train_name=data.get("train_name"),
            travel_date=formatted_date,
            passenger_rows=passenger_rows,
            original_fare=data.get("original_fare", 0),
            cancellation_fee=data.get("cancellation_fee", 0),
            refund_amount=data.get("refund_amount", 0),
            razorpay_payment_id=data.get("razorpay_payment_id") or "DIRECT_WALLET"
        )
        
    elif email_type == "SWAP":
        subject = f"Train Swapped - PNR: {data.get('new_pnr')}"
        
        passenger_rows = ""
        for idx, p in enumerate(data.get("passengers", [])):
            passenger_rows += f"""
            <tr style="border-bottom:1px solid #e2e8f0; font-size:13px;">
              <td style="padding:8px;">{idx + 1}</td>
              <td style="padding:8px; font-weight:600;">{p['name']}</td>
              <td style="padding:8px; color:#1E6F2B; font-weight:bold;">{p.get('coach', 'S1')}-{p.get('seat', 10)}</td>
              <td style="padding:8px; font-weight:bold; color:green;">CNF</td>
            </tr>"""
            
        swap_view = load_template("swap.html")
        content_html = swap_view.format(
            old_train_number=data.get("old_train_number"),
            old_train_name=data.get("old_train_name"),
            old_pnr=data.get("old_pnr"),
            new_train_number=data.get("new_train_number"),
            new_train_name=data.get("new_train_name"),
            new_pnr=data.get("new_pnr"),
            passenger_rows=passenger_rows
        )
        
    elif email_type == "WL_UPGRADE":
        subject = f"Ticket Upgraded to Confirmed - PNR: {pnr}"
        
        passenger_rows = ""
        for idx, p in enumerate(data.get("passengers", [])):
            passenger_rows += f"""
            <tr style="border-bottom:1px solid #e2e8f0; font-size:13px;">
              <td style="padding:8px;">{idx + 1}</td>
              <td style="padding:8px; font-weight:600;">{p['name']}</td>
              <td style="padding:8px; color:#166534; font-weight:bold;">{p.get('coach', 'B1')}-{p.get('seat', 10)}</td>
              <td style="padding:8px; font-weight:bold; color:green;">CNF</td>
            </tr>"""
            
        upgrade_view = load_template("wl_upgrade.html")
        content_html = upgrade_view.format(
            pnr=pnr,
            train_number=data.get("train_number"),
            train_name=data.get("train_name"),
            travel_date=formatted_date,
            class_type=data.get("class_type"),
            passenger_rows=passenger_rows
        )
    
    # 4. Inject View inside Outer base_layout
    final_email_html = base_layout.replace("{{CONTENT}}", content_html)

    # 5. Schedule in a background thread to prevent event-loop blocking
    asyncio.create_task(asyncio.to_thread(send_to_apps_script, email, subject, final_email_html, pdf_html, pnr))
