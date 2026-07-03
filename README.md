# ⚡ High-Throughput Flash Sale System

A production-grade flash sale platform built to handle thousands of concurrent purchase attempts without overselling or race conditions.

---

## 📋 Table of Contents

- [System Architecture](#-system-architecture)
- [Tech Stack](#-tech-stack)
- [Design Choices & Trade-offs](#-design-choices--trade-offs)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [API Reference](#-api-reference)
- [Running Tests](#-running-tests)
- [Stress Testing](#-stress-testing)
- [Future Improvements](#-future-improvements)

---

## 🏗 System Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT BROWSER                       │
│                    React + Vite (port 5173)                 │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP REST
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     BACKEND SERVER                          │
│              Fastify + TypeScript (port 3000)               │
│                                                             │
│  ┌─────────────┐    ┌──────────────────────────────────┐    │
│  │  Route      │    │       Purchase Flow              │    │
│  │  Handlers   │ -> │  1. Validate input (Zod)         │    │
│  │             │    │  2. Check sale window            │    │
│  │  /status    │    │  3. Atomic Redis Lua Script      │    │
│  │  /purchase  │    │     ├─ Check duplicate user      │    │
│  │  /purchase/ │    │     ├─ Check remaining stock     │    │
│  │   :userId   │    │     └─ Decrement stock + add user│    │
│  └─────────────┘    │  4. BullMQ Queue → PostgreSQL    │    │
│                     └──────────────────────────────────┘    │
└───────────┬─────────────────────────┬───────────────────────┘
            │                         │
            ▼                         ▼
┌───────────────────┐     ┌───────────────────────┐
│      REDIS        │     │      POSTGRESQL       │
│  (Cache & Queue)  │     │   (Source of Truth)   │
│                   │     │                       │
│  stock:<id>       │     │  products table       │
│  buyers:<id>      │     │  purchases table      │
│  BullMQ jobs      │     │  (unique constraint:  │
│                   │     │   user_id+product_id) │
└───────────────────┘     └───────────────────────┘
```

### Flow Diagram: Purchase Request

```text
User clicks "Buy Now"
        │
        ▼
POST /purchase
        │
        ├── ❌ Invalid input? → 400 Bad Request
        │
        ├── ❌ Sale not active? → 400 Flash sale not active
        │
        ▼
   Redis Lua Script (atomic)
        │
        ├── ❌ User already bought? → 400 Already purchased  (result = -1)
        │
        ├── ❌ Stock = 0? → 400 Sold out                     (result = -2)
        │
        └── ✅ DECR stock + SADD userId → 201 Success        (result = 1)
                    │
                    └─── BullMQ Job ──▶ Asynchronous DB insert (with retry)
```

---

## 🛠 Tech Stack

| Layer                  | Technology              | Reason                                              |
| ---------------------- | ----------------------- | --------------------------------------------------- |
| **Backend**            | Fastify + TypeScript    | High-performance HTTP server, low overhead          |
| **Frontend**           | React + Vite            | Fast dev experience, modular UI components          |
| **Database**           | PostgreSQL              | Durable source of truth with ACID guarantees        |
| **Cache / Atomic Ops** | Redis                   | Sub-millisecond latency for hot-path operations     |
| **Message Queue**      | BullMQ                  | Resilient background jobs and retry mechanisms      |
| **ORM**                | Prisma                  | Type-safe DB access, easy migrations                |
| **Validation**         | Zod                     | Runtime schema validation with TypeScript inference |
| **Logging**            | Pino                    | Structured, high-performance JSON logging           |
| **Testing**            | Vitest                  | Fast unit/integration testing                       |
| **Containerization**   | Docker + Docker Compose | Reproducible local environment                      |

---

## 🧠 Design Choices & Trade-offs

### 1. Redis Lua Script for Atomic Operations

The core purchase logic runs inside a single **Redis Lua Script** that atomically:

1. Checks if the user is already in the `buyers` SET
2. Checks if remaining stock > 0
3. Decrements stock and adds the user to the buyers SET

**Why?** Redis guarantees that Lua scripts execute atomically — no two scripts can interleave. This completely eliminates race conditions and overselling without needing distributed locks.

---

### 2. BullMQ for Durable PostgreSQL Writes

After a successful Redis operation, the purchase is written to PostgreSQL asynchronously via **BullMQ**. The API responds with `201 Success` immediately.

**Why?** Writing directly to PostgreSQL poses a risk of data loss if the database briefly goes down or the server crashes before completing the write. BullMQ ensures that if a database write fails, it will be automatically retried with exponential backoff until successful.

---

### 3. Distributed Lock for Self-Healing

When the server boots, it reads all existing purchases from PostgreSQL and syncs them to Redis.
Because this application is designed for multi-pod Kubernetes deployments, a **Distributed Lock (`SETNX`)** is utilized during startup.

**Why?** If multiple pods start simultaneously, only the pod that acquires the lock will perform the DB-to-Redis synchronization, preventing race conditions and corrupted states.

---

### 4. Fail-Fast Environment Validation & Graceful Shutdown

- **Fail-Fast**: Upon boot, all environment variables are validated using Zod. If configurations are missing or incorrect, the server crashes immediately with a clear error, preventing obscure runtime bugs.
- **Graceful Shutdown**: The server actively listens for `SIGINT` and `SIGTERM`. Upon termination, it stops accepting new requests, finishes in-flight operations, and gracefully closes Prisma, BullMQ, and Redis connections.

---

### 5. Frontend Atomic Architecture

The frontend is architected according to Senior Engineer standards:

- **Modular Components**: Views are split into small, atomic elements (`Header`, `ProductInfo`, `PurchaseForm`, etc.) following the Single Responsibility Principle.
- **Custom Hooks**: Business logic, such as countdown timers and API polling, is decoupled from the UI using custom React hooks (`useCountdown`, `useFlashSale`).
- **Dynamic Config**: API URLs are handled dynamically via Environment Variables (`.env`), making it deployment-ready.

---

## 📁 Project Structure

```text
bkpi-flash-sale-project/
├── docker-compose.yml          # Orchestrates all services
├── README.md
├── .gitignore
│
├── backend/
│   ├── src/
│   │   ├── config/             # Zod Env config, Prisma client
│   │   ├── controllers/        # Route logic & Error mapping
│   │   ├── domain/             # Core interfaces (Repositories, Services)
│   │   ├── infrastructure/     # BullMQ, Redis implementations
│   │   ├── services/           # Business logic (FlashSaleService)
│   │   └── tests/              # Modular unit testing (Vitest)
│
└── frontend/
    ├── .env
    └── src/
        ├── components/         # Atomic UI components
        ├── hooks/              # Custom React hooks
        ├── types/              # TypeScript interfaces
        └── App.tsx             # Root Layout
```

---

## 🚀 Getting Started

### Prerequisites

- [Docker](https://www.docker.com/get-started) & Docker Compose
- [Node.js](https://nodejs.org/) v18+ (for running tests outside Docker)

### Option A: Run with Docker Compose (Recommended)

This starts **all services** (PostgreSQL, Redis, Backend, Frontend) in one command.

```bash
# Clone the repository
git clone <your-repo-url>
cd bkpi-flash-sale-project

# Start all services
docker compose up --build
```

| Service     | URL                   |
| ----------- | --------------------- |
| Frontend    | http://localhost:5173 |
| Backend API | http://localhost:3000 |
| PostgreSQL  | localhost:5432        |
| Redis       | localhost:6379        |

To stop all services:

```bash
docker compose down
```

To stop and remove all volumes (reset database):

```bash
docker compose down -v
```

---

### Option B: Run Locally (Without Docker)

**Requirements:** PostgreSQL and Redis must be running locally.

#### 1. Backend

```bash
cd backend
npm install

# Set environment variables
export DATABASE_URL="postgresql://postgres:password@localhost:5432/flash_sale?schema=public"
export REDIS_URL="redis://localhost:6379"

# Run database migrations
npx prisma migrate dev

# Start development server (with hot reload)
npm run dev
```

#### 2. Frontend

```bash
cd frontend
npm install

# Setup environment variables
cp .env.example .env

# Start development server
npm run dev
```

---

## 📡 API Reference

Base URL: `http://localhost:3000`

### `GET /flash-sale/status`

Returns the current status of the flash sale.

**Response `200`:**

```json
{
  "status": "active",
  "productId": "flash-sale-product-id",
  "remainingStock": 87,
  "startTime": "2026-07-03T03:00:00.000Z",
  "endTime": "2026-07-03T04:00:00.000Z"
}
```

`status` values: `"upcoming"` | `"active"` | `"ended"`

---

### `POST /purchase`

Attempts to purchase the flash sale item.

**Request Body:**

```json
{
  "userId": "user-abc-123",
  "productId": "flash-sale-product-id"
}
```

**Response `201` (Success):**

```json
{
  "message": "Purchase successful! Your item is secured."
}
```

**Response `400` (Already purchased):**

```json
{
  "error": "You have already purchased this item"
}
```

**Response `400` (Sold out):**

```json
{
  "error": "Product is sold out"
}
```

**Response `400` (Sale not active):**

```json
{
  "error": "Flash sale is not active"
}
```

---

### `GET /purchase/:userId`

Checks if a specific user successfully secured an item.

**Response `200`:**

```json
{
  "userId": "user-abc-123",
  "hasSecuredItem": true
}
```

---

## 🧪 Running Tests

```bash
# Run tests inside Docker
docker compose run --rm backend npm test
docker compose run --rm frontend npm test
```

Tests use **Vitest** and Fastify's built-in injection utility to test routes without starting a real HTTP server.

---

## 📈 Stress Testing

Stress tests simulate thousands of concurrent users hitting the purchase endpoint simultaneously to verify:

- No overselling (final purchase count ≤ initial stock)
- Correct enforcement of one-purchase-per-user
- System stability under high load

### Using k6

Install [k6](https://k6.io/docs/get-started/installation/) then run:

```bash
# Basic load test: 200 concurrent users for 30 seconds
k6 run --vus 200 --duration 30s - <<EOF
import http from 'k6/http';
import { check } from 'k6';

export default function () {
  const userId = \`user-\${Math.floor(Math.random() * 10000)}\`;
  const res = http.post('http://localhost:3000/purchase', JSON.stringify({
    userId,
    productId: 'flash-sale-product-id',
  }), { headers: { 'Content-Type': 'application/json' } });

  check(res, {
    'status is 201 or 400': (r) => r.status === 201 || r.status === 400,
  });
}
EOF
```

### Expected Results

| Metric                     | Expected                  |
| -------------------------- | ------------------------- |
| Total successful purchases | ≤ 100 (initial stock)     |
| Duplicate purchases        | 0                         |
| Overselling                | 0                         |
| Error rate under load      | < 1% (only expected 400s) |
| p95 response time          | < 50ms                    |

After the stress test, verify the result:

```bash
curl http://localhost:3000/flash-sale/status
# "remainingStock" should be 0 if stock ran out
```

---

## 🌍 Environment Variables

Berikut adalah daftar variabel lingkungan (`.env`) utama yang digunakan dalam proyek ini beserta nilai _default_-nya untuk pengembangan lokal:

### Backend (`backend/.env`)

| Variable       | Description                    | Default Local Value                                                      |
| -------------- | ------------------------------ | ------------------------------------------------------------------------ |
| `DATABASE_URL` | Koneksi ke database PostgreSQL | `postgresql://postgres:password@localhost:5432/flash_sale?schema=public` |
| `REDIS_URL`    | Koneksi ke server Redis        | `redis://localhost:6379`                                                 |
| `PORT`         | Port server backend            | `3000`                                                                   |

### Frontend (`frontend/.env`)

Salin file `.env.example` menjadi `.env` sebelum menjalankan frontend:

```bash
cp frontend/.env.example frontend/.env
```

| Variable       | Description                          | Default Local Value     |
| -------------- | ------------------------------------ | ----------------------- |
| `VITE_API_URL` | URL backend API yang akan dikonsumsi | `http://localhost:3000` |

---

## 🔧 Troubleshooting

Berikut beberapa masalah yang mungkin terjadi saat setup lokal dan cara mengatasinya:

- **Error: `bind: address already in use`**
  - **Penyebab:** Port `3000` (Backend), `5432` (PostgreSQL), `6379` (Redis), atau `5173` (Frontend) sudah digunakan oleh aplikasi lain di komputer Anda.
  - **Solusi:** Matikan aplikasi yang menggunakan port tersebut, atau ubah _mapping_ port di file `docker-compose.yml` (misal: `3001:3000`).

- **Bagaimana cara melihat _logs_ secara real-time dari Docker?**
  - Untuk melihat _logs_ backend: `docker compose logs -f backend`
  - Untuk melihat _logs_ frontend: `docker compose logs -f frontend`
  - Untuk melihat _logs_ seluruh servis: `docker compose logs -f`

- **Backend mengalami "Database Connection Error"**
  - Pastikan container database sudah sepenuhnya siap. Anda bisa mencoba me-_restart_ backend dengan cara `docker compose restart backend`.

---

## 🔮 Future Improvements

| Improvement                                    | Benefit                      |
| ---------------------------------------------- | ---------------------------- |
| Redis Sentinel / Cluster                       | High availability for Redis  |
| Horizontal scaling (multiple backend replicas) | Higher throughput            |
| Rate limiting per IP                           | Prevent bot abuse            |
| WebSocket / SSE for stock updates              | Real-time UI without polling |
| Prometheus + Grafana metrics                   | Observability under load     |

---

## 📄 License

MIT
