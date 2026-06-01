import os
import requests
import asyncio
import base64
import logging
from datetime import datetime
from dotenv import load_dotenv
from PIL import Image, ImageOps
import io
import jinja2
from celery import Celery

load_dotenv()
logger = logging.getLogger("railyn.mailer")

REDIS_URL = os.getenv("REDIS_URL")
celery_app = Celery("mailer", broker=REDIS_URL, backend=REDIS_URL)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Kolkata",
    enable_utc=True,
    redis_backend_use_ssl={"ssl_cert_reqs": None} if "rediss://" in (REDIS_URL or "") else False,
    broker_use_ssl={"ssl_cert_reqs": None} if "rediss://" in (REDIS_URL or "") else False,
)

APPS_SCRIPT_URL = os.getenv("APPS_SCRIPT_URL")
TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "templates")
ASSETS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "src", "assets"))

# Initialize Jinja2 Environment
jinja_env = jinja2.Environment(loader=jinja2.FileSystemLoader(TEMPLATES_DIR))

def get_logo_src() -> str:
    """Gets a web-safe, stable public HTTPS URL for the Railyn logo to ensure rendering in all email clients (like Gmail/Outlook).
    Uses LOGO_URL from environment variables if set, falling back to the raw GitHub asset."""
    logo_env = os.getenv("LOGO_URL")
    if logo_env:
        logger.info(f"Loading logo from LOGO_URL env: {logo_env}")
        return logo_env
        
    # Default to the highly reliable, CDN-cached raw GitHub URL for your frontend assets
    fallback_url = "https://raw.githubusercontent.com/SaumiliHaldar/Railyn/main/frontend/src/assets/logo1.png"
    logger.info(f"Using stable GitHub raw URL fallback: {fallback_url}")
    return fallback_url


def send_to_apps_script(email: str, subject: str, html_body: str, pdf_html: str = None, pnr: str = "Ticket"):
    """Synchronously issues the POST request to the deployed Google Apps Script URL."""
    if not APPS_SCRIPT_URL:
        logger.warning("APPS_SCRIPT_URL is not configured in .env. Skipping email dispatch.")
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
                logger.info(f"Email '{subject}' dispatched successfully!")
                return True
            else:
                logger.error(f"Apps Script execution failed: {result.get('message')}")
        else:
            logger.error(f"POST failed with status: {res.status_code}")
    except Exception as e:
        logger.exception(f"Failed to send email '{subject}': {e}")
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
        logger.warning("APPS_SCRIPT_URL is not set. Email notification will not be sent.")
        return
        
    subject = ""
    content_html = ""
    pdf_html = None
    pnr = data.get("pnr", "Ticket")
    
    # Format travel date for presentation
    formatted_date = format_to_ddmmyyyy(data.get("travel_date") or "")
    
    # 1. Fetch Dynamic Base64 logo.png
    logo_src = get_logo_src()
    
    template_data = {
        "logo_src": logo_src,
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
            template_data["qr_url"] = qr_response.get("qr_data", "")
        except Exception as e:
            logger.error(f"Failed to generate QR code locally: {e}")
            import urllib.parse
            qr_data_string = f"RAILYN|PNR:{pnr}|TRAIN:{data.get('train_number')}|CLASS:{data.get('class_type')}|DATE:{formatted_date}"
            template_data["qr_url"] = f"https://api.qrserver.com/v1/create-qr-code/?size=120x120&data={urllib.parse.quote(qr_data_string)}"
        
        pdf_template = jinja_env.get_template("pdf_ticket.html")
        pdf_html = pdf_template.render(**template_data)
        
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
    
    # 4. Inject View inside Outer base_layout
    base_template = jinja_env.get_template("base.html")
    final_email_html = base_template.render(CONTENT=content_html, logo_src=logo_src)

    # 5. Execute Apps Script dispatch directly (blocking the worker thread/process)
    logger.info(f"Dispatched Apps Script HTTP request for PNR: {pnr}")
    send_to_apps_script(email, subject, final_email_html, pdf_html, pnr)


@celery_app.task(bind=True, max_retries=5, default_retry_delay=10)
def send_ticket_email_task(self, email_type, email, data):
    """
    Celery background task that executes trigger_email inside an asyncio runtime environment.
    """
    logger.info(f"Celery task started: Dispatching '{email_type}' email to {email}")
    try:
        asyncio.run(trigger_email(email_type, email, data))
    except Exception as exc:
        logger.error(f"Celery task failed with error: {exc}. Retrying...")
        raise self.retry(exc=exc)
