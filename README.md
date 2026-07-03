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

```
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
│  │  Handlers   │    │  1. Validate input (Zod)         │    │
│  │             │    │  2. Check sale window            │    │
│  │  /status    │    │  3. Atomic Redis Lua Script      │    │
│  │  /purchase  │    │     ├─ Check duplicate user      │    │
│  │  /purchase/ │    │     ├─ Check remaining stock     │    │
│  │   :userId   │    │     └─ Decrement stock + add user│    │
│  └─────────────┘    │  4. Fire-and-forget → PostgreSQL │    │
│                     └──────────────────────────────────┘    │
└───────────┬─────────────────────────┬───────────────────────┘
            │                         │
            ▼                         ▼
┌───────────────────┐     ┌───────────────────────┐
│      REDIS        │     │      POSTGRESQL       │
│  (Cache & Atomic) │     │   (Source of Truth)   │
│                   │     │                       │
│  stock:<id>  →    │     │  products table       │
│    integer count  │     │  purchases table      │
│                   │     │  (unique constraint:  │
│  buyers:<id> →    │     │   user_id+product_id) │
│    SET of userIds │     │                       │
└───────────────────┘     └───────────────────────┘
```

### Flow Diagram: Purchase Request

```
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
                    └─── Fire & Forget ──▶ PostgreSQL upsert
                         (non-blocking)
```

---

## 🛠 Tech Stack

| Layer                  | Technology              | Reason                                              |
| ---------------------- | ----------------------- | --------------------------------------------------- |
| **Backend**            | Fastify + TypeScript    | High-performance HTTP server, low overhead          |
| **Frontend**           | React + Vite            | Fast dev experience, component-based UI             |
| **Database**           | PostgreSQL              | Durable source of truth with ACID guarantees        |
| **Cache / Atomic Ops** | Redis                   | Sub-millisecond latency for hot-path operations     |
| **ORM**                | Prisma                  | Type-safe DB access, easy migrations                |
| **Validation**         | Zod                     | Runtime schema validation with TypeScript inference |
| **Logging**            | Pino                    | Structured, high-performance JSON logging           |
| **Testing**            | Vitest                  | Fast unit/integration testing                       |
| **Stress Testing**     | k6                      | Scriptable load testing tool                        |
| **Containerization**   | Docker + Docker Compose | Reproducible local environment                      |

---

## 🧠 Design Choices & Trade-offs

### 1. Redis Lua Script for Atomic Operations

The core purchase logic runs inside a single **Redis Lua Script** that atomically:

1. Checks if the user is already in the `buyers` SET
2. Checks if remaining stock > 0
3. Decrements stock and adds the user to the buyers SET

**Why?** Redis guarantees that Lua scripts execute atomically — no two scripts can interleave. This completely eliminates race conditions and overselling without needing distributed locks.

**Trade-off:** Redis data is in-memory and can be lost on crash. Mitigated by the self-healing mechanism on startup (see below).

---

### 2. Fire-and-Forget PostgreSQL Write

After a successful Redis operation, the purchase is written to PostgreSQL **asynchronously** (fire-and-forget). The API responds with `201 Success` immediately without waiting for the DB write.

**Why?** This keeps API latency extremely low under high load. The Redis SET is the authority for "who bought what" during the sale.

**Trade-off:** In theory, a DB write could fail silently. Mitigated by:

- Error logging on failure
- The DB has a `UNIQUE(user_id, product_id)` constraint as a safety net
- Self-healing on restart syncs DB state back to Redis

---

### 3. Self-Healing State on Startup

When the server boots, it reads all existing purchases from PostgreSQL and re-populates:

- `stock:<productId>` in Redis (calculated as `INITIAL_STOCK - purchase_count`)
- `buyers:<productId>` SET in Redis (all existing buyer user IDs)

**Why?** If Redis is restarted and loses data, the system recovers its state from the database, ensuring correctness without manual intervention.

---

### 4. No Message Queue in the Critical Path

A message queue (e.g., BullMQ, RabbitMQ) was **intentionally excluded** from the purchase flow.

**Why?** The core requirements — preventing overselling and enforcing one-purchase-per-user — are fully satisfied by Redis atomic operations. Adding a queue would introduce operational complexity without meaningful benefit for the current scope.

**When to add it:** If the system grows to require email notifications, audit logging, analytics, or third-party integrations, BullMQ would be the right addition for those async workloads.

---

## 📁 Project Structure

```
bkpi-flash-sale-project/
├── docker-compose.yml          # Orchestrates all services
├── README.md
├── .gitignore
│
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   └── schema.prisma       # DB models: Product, Purchase
│   └── src/
│       └── index.ts            # Fastify server, routes, Redis logic
│
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        └── App.tsx             # React UI: status, buy, verify
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
cd backend
npm test
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

## 🔮 Future Improvements

| Improvement                                    | Benefit                               |
| ---------------------------------------------- | ------------------------------------- |
| BullMQ job queue                               | Async email notifications, audit logs |
| Redis Sentinel / Cluster                       | High availability for Redis           |
| Horizontal scaling (multiple backend replicas) | Higher throughput                     |
| Rate limiting per IP                           | Prevent bot abuse                     |
| WebSocket / SSE for stock updates              | Real-time UI without polling          |
| Prometheus + Grafana metrics                   | Observability under load              |

---

## 📄 License

MIT
