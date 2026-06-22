# Railyn

This repository contains the source code for Railyn, a production-grade digital railway booking engine. Integrated with a modern web dashboard, Railyn delivers seamless, IRCTC-style ticket bookings, dynamic pricing, race-free atomic seat allocation, real-time telemetry streaming via MQTT, and an automated delay-mitigation engine.

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

Railyn is a full-stack, high-concurrency train booking and scheduling platform built to handle real-world railway operations at scale. By leveraging a high-performance Python ASGI backend, atomic shared-memory buffers, and a robust real-time event pipeline, Railyn delivers instant booking transactions, automated waitlist clearing, and intelligent delay-routing mechanisms — all without manual intervention.

## Features

- **Atomic Seat Allocation**: Implements a dedicated multi-process shared-memory arena for deadlock-free seat inventory reservations and waitlist sequencing, bypassing database-level locking for high-throughput concurrency.
- **Upstash Redis Caching**: Employs an intelligent distributed caching tier that accelerates search routes (`/trn_search`) with in-memory lookups while dynamically injecting real-time seat inventories.
- **Transaction State Logging**: Enforces booking atomicity via a programmatic state ledger. All pending/committed transaction entries are routed through isolated multiprocessing locks and console-native logging streams, ensuring clean, container-portable execution without disk I/O bottlenecks.
- **Background Email Pipeline**: Handles booking confirmations, cancellations, and waitlist upgrades asynchronously using FastAPI's BackgroundTasks, including QR code generation and PDF ticket delivery via Google Apps Script.
- **Dynamic Pricing Engine**: Multi-tiered pricing calculations utilizing travel distance, class multipliers (General, Sleeper, 3AC, 2AC, 1AC), and age concessions.
- **Secure Razorpay Checkout**: Fully integrated payment flow verifying Razorpay order signatures, payment capture status, and calculated totals server-side in Python to prevent tampering.
- **Real-Time Telemetry & Alerts**: Instant server-to-client event pushing powered by EMQX MQTT Brokers, enabling live notifications and immediate action prompts for passengers.
- **Proactive Delay Mitigation**: A background routing subsystem that monitors train schedules and automatically surfaces seat-swap options on faster alternative trains for affected passengers.
- **Automated Communication Hub**: Serverless email integration utilizing Google Apps Script nodes to dispatch professional IRCTC-themed booking receipts, cancellation tickets, seat-upgrade notices, and dynamic QR-coded Electronic Reservation Slips (ERS) as PDFs.
- **Secure Authentication**: Integrates Clerk identity management for JWT-verified session handling with automated local-development bypasses.

## Technologies Used

- **FastAPI**: Modern, high-performance, asynchronous web framework for Python APIs.
- **Redis**: High-performance key-value caching database accessed over TLS/SSL via Upstash for accelerated train search results.
- **React & TypeScript**: Interactive, type-safe, component-driven frontend architecture.
- **Vite & Tailwind CSS v4**: Ultra-fast build toolchain and a highly stylized, utility-first modern visual design.
- **MongoDB**: NoSQL document store with programmatically configured indexes on startup for optimized schedule joins, train lookups, and PNR queries.
- **Shared Memory Buffer**: Specialized process-isolated memory buffer for race-free, concurrent inventory management.
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
- **Book & Swap Tickets**: Search train routes, complete secure Razorpay checkout, receive PDF tickets, swap trains, or handle delays proactively.
- **Simulate Real-Time Scenarios**: Trigger background processes such as waitlist upgrades or train delay rerouting alerts.

## Core Architecture & Engines

### Shared Memory Buffer
- **Concurrent Seat Allocation**: Bypasses slow database-level locks by executing thread-safe, atomic seat reservations inside a high-speed shared memory buffer shared across worker processes, then syncing updates asynchronously to MongoDB.

### Transaction State Logging
- **Booking Atomicity**: Guarantees seat reservation sequence integrity using programmatically isolated memory blocks synchronized under multiprocessing locks. States are logged via console-native streams rather than disk-bound files, preserving fast container startups and eliminating permission bottlenecks.

### Background Email Pipeline
- **Zero-Overhead Email Dispatch**: Email notifications (booking confirmations, cancellations, waitlist upgrades, train swaps) are dispatched using FastAPI's native `BackgroundTasks`. Emails fire immediately after the API response is returned — no separate worker process, no message broker queue, no operational overhead.

### Delay Routing Engine
- **Intelligent Disruption Handling**: Continuously tracks delays and cancellations via the MQTT engine. If a disruption occurs, the backend automatically locates optimal alternatives, verifies seat inventory, and streams dynamic swap prompts directly to affected users — no manual triage required.

### Google Apps Script Node
- **Serverless PDF Ticket Generator**: Renders professional HTML templates into stylized PDFs containing travel details, passenger rosters, dynamic QR codes, and delivers them directly via Gmail.

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