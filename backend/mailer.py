import os
import requests
import asyncio
import base64
import logging
import time
from datetime import datetime
from dotenv import load_dotenv
from PIL import Image, ImageOps
import io
import jinja2


load_dotenv()
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("railyn.mailer")



# Initialize persistent HTTP session for connection pooling & TLS cache reuse to speed up Google Apps Script requests
http_session = requests.Session()

APPS_SCRIPT_URL = os.getenv("APPS_SCRIPT_URL")
TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "templates")

# Initialize Jinja2 Environment
jinja_env = jinja2.Environment(loader=jinja2.FileSystemLoader(TEMPLATES_DIR))

def get_logo_url() -> str:
    """Returns a public HTTPS URL for the logo — safe for email clients like Gmail
    which block data: URIs. Uses LOGO_URL env var, then GitHub raw URL fallback."""
    logo_env = os.getenv("LOGO_URL")
    if logo_env:
        logger.info(f"Logo URL from LOGO_URL env: {logo_env}")
        return logo_env
    fallback = "https://raw.githubusercontent.com/SaumiliHaldar/Railyn/main/frontend/src/assets/logo1.png"
    logger.info(f"Using GitHub raw URL for email logo: {fallback}")
    return fallback


def get_logo_base64() -> str:
    """Returns a resized base64 data URI of logo1.png — safe for PDFs rendered
    by Google Apps Script (which CAN render data: URIs, unlike Gmail).
    Falls back to get_logo_url() if local file is missing."""
    local_logo = os.path.join(os.path.dirname(__file__), "logo1.png")
    if os.path.exists(local_logo):
        try:
            with open(local_logo, "rb") as f:
                img = Image.open(f).convert("RGBA")
            # Resize to 48px height (actual display size) to keep payload tiny
            target_h = 48
            ratio = target_h / img.height
            target_w = int(img.width * ratio)
            img = img.resize((target_w, target_h), Image.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format="PNG", optimize=True)
            b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
            logger.info(f"PDF logo resized to {target_w}x{target_h}px as base64 ({len(b64)/1024:.1f} KB).")
            return f"data:image/png;base64,{b64}"
        except Exception as e:
            logger.warning(f"Failed to read/resize local logo for PDF: {e}")
    return get_logo_url()


def send_to_apps_script(email: str, subject: str, html_body: str, pdf_html: str = None, pnr: str = "Ticket"):
    """Synchronously issues the POST request to the deployed Google Apps Script URL using connection pooling."""
    if not APPS_SCRIPT_URL:
        logger.warning(f"APPS_SCRIPT_URL is not configured in .env. Skipping email dispatch to {email}.")
        return False
        
    start_time = time.time()
    body_sz = len(html_body) / 1024.0
    pdf_sz = len(pdf_html) / 1024.0 if pdf_html else 0.0
    
    logger.info(f"[EMAIL TRIGGERED] Dispatching email (PNR: {pnr}) to {email}...")
        
    try:
        payload = {
            "email": email,
            "subject": subject,
            "htmlBody": html_body,
            "pdfHtml": pdf_html,
            "pnr": pnr
        }
        res = http_session.post(APPS_SCRIPT_URL, json=payload, timeout=15)
        latency = time.time() - start_time
        if res.status_code == 200:
            result = res.json()
            if result.get("status") == "success":
                logger.info(
                    f"[EMAIL SENT] PNR: {pnr} | To: {email} | Body: {body_sz:.1f}KB | PDF: {pdf_sz:.1f}KB | Time Taken: {latency:.2f}s | Status: SUCCESS"
                )
                return True
            else:
                logger.error(
                    f"[EMAIL FAILED] PNR: {pnr} | To: {email} | Time Taken: {latency:.2f}s | Status: FAILED (Apps Script: {result.get('message')})"
                )
        else:
            logger.error(
                f"[EMAIL FAILED] PNR: {pnr} | To: {email} | Time Taken: {latency:.2f}s | Status: HTTP_{res.status_code}"
            )
    except Exception as e:
        latency = time.time() - start_time
        logger.exception(
            f"[EMAIL EXCEPTION] PNR: {pnr} | To: {email} | Time Taken: {latency:.2f}s | Status: EXCEPTION ({e})"
        )
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


def generate_qr_base64(
    pnr: str,
    name: str = None,
    age: str = None,
    train_name: str = None,
    train_no: str = None,
    from_stn: str = None,
    to_stn: str = None,
    date: str = None,
    class_type: str = None,
    coach: str = None,
    seat: str = None,
    pax_count: str = None,
) -> str:
    """
    Generates a unique QR code per booking locally in the mailer process
    without importing app.py (prevents circular imports and heavy dependency issues).
    Optimized to box_size=4 to reduce base64 footprint by over 80% for lightning fast uploads.
    """
    import qrcode
    import time
    
    start_time = time.time()
    
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
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=4,
        border=4,
    )
    qr.add_data(qr_payload)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)

    b64 = base64.b64encode(buffer.read()).decode("utf-8")
    elapsed = time.time() - start_time
    logger.info(f"Generated QR code locally in {elapsed:.3f}s. Size of Base64: {len(b64)/1024.0:.2f} KB")
    return f"data:image/png;base64,{b64}"


async def trigger_email(email_type: str, email: str, data: dict):
    """
    Asynchronously renders base and view templates, schedules non-blocking background dispatch.
    Uses simplified, user-readable subjects and dynamically embeds base64 project logo.
    """
    if not APPS_SCRIPT_URL:
        logger.warning("APPS_SCRIPT_URL is not set. Email notification will not be sent.")
        return
        
    subject = ""
    content_html = ""
    pdf_html = None
    pnr = data.get("pnr", "Ticket")
    
    # Format travel date for presentation
    formatted_date = format_to_ddmmyyyy(data.get("travel_date") or "")
    
    # 1. Logo — URL for email body (Gmail blocks data: URIs), base64 for PDF only
    logo_url = get_logo_url()
    logo_base64 = get_logo_base64()
    
    template_data = {
        "logo_src": logo_url,  # used in base.html (email body)
        "pnr": pnr,
        "train_number": data.get("train_number", ""),
        "train_name": data.get("train_name", ""),
        "travel_date": formatted_date,
        "class_type": data.get("class_type", ""),
        "passengers": data.get("passengers", []),
        "status": data.get("status", "CNF"),
        "wl_position": data.get("wl_position", 0),
        "from_stn": data.get("from_stn", ""),
        "to_stn": data.get("to_stn", ""),
        "departure": data.get("departure", ""),
        "arrival": data.get("arrival", ""),
        "user_name": data.get("user_name", "Passenger"),
        "total_fare": data.get("total_fare", 0),
        "razorpay_payment_id": data.get("razorpay_payment_id", "DIRECT_WALLET"),
    }

    # 3. Process View Layouts
    if email_type == "BOOKING":
        subject = f"Booking Confirmed - PNR: {pnr}"
        status = data.get("status", "CNF")
        
        # Format Status Styles
        template_data["status_label"] = "Ticket Confirmed & PDF Attached" if status == "CNF" else "Seat Waitlisted — Added to Queue"
        template_data["alert_color"] = "#F0F7F1" if status == "CNF" else "#fffbeb"
        template_data["border_color"] = "#1E6F2B" if status == "CNF" else "#fbbf24"
        template_data["text_color"] = "#1E6F2B" if status == "CNF" else "#b45309"
        
        template = jinja_env.get_template("booking.html")
        content_html = template.render(**template_data)
        
        passengers = data.get("passengers", [])
        first_pax = passengers[0] if passengers else {}
        name = first_pax.get("name")
        age = str(first_pax.get("age")) if first_pax.get("age") is not None else None
        coach = first_pax.get("coach")
        seat = str(first_pax.get("seat")) if first_pax.get("seat") is not None else None
        pax_count = str(len(passengers))
        
        try:
            # Generate the QR code locally, completely bypassing the circular dependency import of app.py
            qr_data = generate_qr_base64(
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
            template_data["qr_url"] = qr_data
        except Exception as e:
            logger.error(f"Failed to generate QR code locally: {e}")
            import urllib.parse
            qr_data_string = f"RAILYN|PNR:{pnr}|TRAIN:{data.get('train_number')}|CLASS:{data.get('class_type')}|DATE:{formatted_date}"
            template_data["qr_url"] = f"https://api.qrserver.com/v1/create-qr-code/?size=120x120&data={urllib.parse.quote(qr_data_string)}"
        
        pdf_template = jinja_env.get_template("pdf_ticket.html")
        pdf_html = pdf_template.render(**{**template_data, "logo_src": logo_base64})
        
    elif email_type == "CANCEL":
        subject = f"Ticket Cancelled - PNR: {pnr}"
        
        template_data.update({
            "cancelled_passengers": data.get("cancelled_passengers", []),
            "original_fare": data.get("original_fare", 0),
            "cancellation_fee": data.get("cancellation_fee", 0),
            "refund_amount": data.get("refund_amount", 0)
        })
            
        template = jinja_env.get_template("cancel.html")
        content_html = template.render(**template_data)
        
    elif email_type == "SWAP":
        subject = f"Train Swapped - PNR: {data.get('new_pnr')}"
        
        template_data.update({
            "old_train_number": data.get("old_train_number", ""),
            "old_train_name": data.get("old_train_name", ""),
            "old_pnr": data.get("old_pnr", ""),
            "new_train_number": data.get("new_train_number", ""),
            "new_train_name": data.get("new_train_name", ""),
            "new_pnr": data.get("new_pnr", "")
        })
            
        template = jinja_env.get_template("swap.html")
        content_html = template.render(**template_data)
        
    elif email_type == "WL_UPGRADE":
        subject = f"Ticket Upgraded to Confirmed - PNR: {pnr}"
            
        template = jinja_env.get_template("wl_upgrade.html")
        content_html = template.render(**template_data)
        
    elif email_type == "WELCOME":
        subject = f"Welcome to Railyn, {data.get('user_name', 'Passenger')}!"
        template = jinja_env.get_template("welcome.html")
        content_html = template.render(**template_data)
    
    # 4. Inject View inside Outer base_layout
    base_template = jinja_env.get_template("base.html")
    final_email_html = base_template.render(CONTENT=content_html, logo_src=logo_url)

    # 5. Execute Apps Script dispatch directly (blocking the worker thread/process)
    logger.info(f"Dispatched Apps Script HTTP request for PNR: {pnr}")
    send_to_apps_script(email, subject, final_email_html, pdf_html, pnr)

