# Railyn

This repository contains the source code for Railyn, a state-of-the-art, high-performance digital railway booking engine and autonomous travel platform. Integrated with a modern web dashboard, Railyn delivers seamless, IRCTC-style ticket bookings, dynamic pricing, sub-millisecond atomic seat allocation, real-time telemetry streaming via MQTT, and an autonomous delay-mitigation engine.

## Table of Contents

- [About the Project](#about-the-project)
- [Features](#features)
- [Technologies Used](#technologies-used)
- [Installation](#installation)
- [Usage](#usage)
- [Core Architecture & Engines](#core-architecture--engines)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

## About the Project

Railyn is a professionalized, high-concurrency train booking and scheduling platform designed to handle modern railway operations. By leveraging a high-performance Python ASGI backend, atomic shared-memory buffers, and a robust real-time event pipeline, Railyn facilitates instant booking transactions, automated waitlist clearing, and self-healing delay-routing mechanisms to ensure a resilient, zero-babysitting travel ecosystem.

## Features

- **Atomic Seat Allocation**: Implements a dedicated multi-process shared-memory arena for sub-millisecond, deadlock-free seat inventory reservations and waitlist sequencing.
- **Upstash Redis Caching**: Employs an intelligent distributed caching tier that accelerates search routes (`/trn_search`) to sub-millisecond latencies while dynamically injecting real-time seat inventories.
- **Write-Ahead Logging (WAL)**: Enforces transaction-safe atomicity for bookings. All pending/committed transaction ledger entries are routed programmatically through standard logging streams rather than physical disk I/O, ensuring zero-clutter execution and container-native portability.
- **Background Email Pipeline**: Handles booking confirmations, cancellations, and waitlist upgrades asynchronously using FastAPI's BackgroundTasks, including QR code generation and PDF ticket delivery via Google Apps Script.
- **Dynamic Pricing Engine**: Multi-tiered pricing calculations utilizing travel distance, class multipliers (General, Sleeper, 3AC, 2AC, 1AC), and age concessions.
- **Cryptographic Razorpay Checkout**: Fully integrated secure checkout verifying order signatures, payment capture status, and calculated totals in Python to prevent fraud.
- **Real-Time Telemetry & Alerts**: Instant server-to-client event pushing powered by EMQX MQTT Brokers, enabling live notifications and immediate action prompts for passengers.
- **Autonomous Delay Mitigation**: A zero-babysitting routing subsystem that monitors train schedules and automatically offers affected passengers seat swaps on faster alternative trains.
- **Automated Communication Hub**: Zero-SMTP integration utilizing Google Apps Script nodes to dispatch professional IRCTC-themed booking receipts, cancellation tickets, seat-upgrade notices, and dynamic QR-coded Electronic Reservation Slips (ERS) as PDFs.
- **Secure Authentication**: Integrates Clerk identity management for secure, zero-trust JWT credential verification with automated local-development bypasses.

## Technologies Used

- **FastAPI**: Modern, high-performance, asynchronous web framework for Python APIs.
- **Redis**: Secure, high-performance key-value caching database accessed over TLS/SSL for accelerated train search results.
- **React & TypeScript**: Interactive, type-safe, component-driven frontend architecture.
- **Vite & Tailwind CSS v4**: Ultra-fast build toolchain and a highly stylized, utility-first modern visual design.
- **MongoDB**: NoSQL document store with programmatically configured indexes on startup for optimized schedule joins, train lookups, and PNR queries.
- **Shared Memory Box**: Specialized process-isolated memory buffer for race-free inventory management.
- **Paho MQTT & EMQX**: Fast, lightweight publish/subscribe messaging infrastructure for real-time telemetry streaming.
- **Google Apps Script**: Serverless proxy endpoint for reliable email delivery and PDF generation.
- **Clerk**: Comprehensive user identity management and secure session validation.
- **Framer Motion**: Smooth micro-animations and transition states in the web portal.

## Installation

### Backend Setup

1. **Clone the repository**:
    ```bash
    git clone https://github.com/SaumiliHaldar/Railyn.git
    cd Railyn/backend
    ```
2. **Create a virtual environment & activate it**:
    ```bash
    python -m venv venv
    # Windows
    venv\Scripts\activate
    # Mac/Linux
    source venv/bin/activate
    ```
3. **Install dependencies**:
    ```bash
    pip install -r requirements.txt
    ```
4. **Create a `.env` file** in the `backend` directory:
    ```env
    MONGO_URI=your_mongodb_connection_string
    CLERK_SECRET_KEY=your_clerk_secret_key
    RAZORPAY_KEY_ID=your_razorpay_key_id
    RAZORPAY_KEY_SECRET=your_razorpay_key_secret
    APPS_SCRIPT_URL=your_google_apps_script_deployment_url
    REDIS_URL=rediss://default:your_upstash_token@your_upstash_endpoint.upstash.io:6379
    RESEND_API_KEY=your_resend_api_key
    ```
5. **Run the application**:
    ```bash
    # Single command — no separate worker process needed
    uvicorn app:app --reload
    ```

### Frontend Setup

1. **Navigate to the frontend directory**:
    ```bash
    cd ../frontend
    ```
2. **Install dependencies**:
    ```bash
    npm install
    ```
3. **Create a `.env.local` file**:
    ```env
    VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
    VITE_API_URL=http://localhost:8000
    VITE_RAZORPAY_KEY_ID=your_razorpay_key_id
    ```
4. **Run the development server**:
    ```bash
    npm run dev
    ```

## Usage

- **Access the Dashboard**: Navigate to [http://localhost:5173](http://localhost:5173) in your browser.
- **Authenticate & Profile**: Log in securely using Clerk, sync your profile, and manage your saved passengers list.
- **Book & Swap Tickets**: Search train routes, complete secure Razorpay checkout, receive PDF tickets, swap trains, or handle delays autonomously.
- **Simulate Real-Time Scenarios**: Trigger background processes such as waitlist upgrades or train delay rerouting alerts.

## Core Architecture & Engines

### Shared Memory Buffer
- **Sub-Millisecond Allocation**: Bypasses slow disk-bound database locks by executing thread-safe, atomic seat reservations inside a high-speed shared memory buffer, then syncing updates asynchronously.

### Write-Ahead Logging (WAL)
- **High-Throughput Atomicity**: Guarantees seat reservation sequence integrity using programmatically isolated memory blocks synchronized under multiprocessing locks. To preserve fast container startups and eliminate permission bottlenecks, it logs states cleanly via console-native logging streams rather than slower disk-bound write-ahead files.

### Background Email Pipeline
- **Zero-Process Email Dispatch**: Email notifications (booking confirmations, cancellations, waitlist upgrades, train swaps) are dispatched using FastAPI's native `BackgroundTasks`. Emails fire immediately after the API response is returned — no separate worker process, no message broker queue, no operational overhead.

### Autonomous Routing Engine
- **Self-Healing Logistics**: Continuously tracks delays and cancellations via the MQTT engine. If a disruption occurs, the backend locates optimal alternatives, verifies seat availability, and streams dynamic swap prompts to users.

### Google Apps Script Node
- **Serverless PDF Ticket Generator**: Formulates professional HTML templates into highly stylized PDFs containing automated travel details, passenger rosters, dynamic QR codes, and sends them directly via Gmail.

## Contributing

1. Fork the project.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

## License

Railyn is licensed under the MIT License.

## Contact

For any questions or feedback, please reach out to:

**Name**: Saumili Haldar  
**Email**: haldar.saumili843@gmail.com