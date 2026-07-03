# ⚡ High-Throughput Flash Sale System by Andhika Ragil Kesuma

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Fastify](https://img.shields.io/badge/Fastify-000000?style=for-the-badge&logo=fastify&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![BullMQ](https://img.shields.io/badge/BullMQ-FF6B35?style=for-the-badge&logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)

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

```mermaid
flowchart TB
    subgraph Client["CLIENT BROWSER"]
        UI["React + Vite (port 5173)"]
    end

    subgraph Backend["BACKEND SERVER"]
        API["Fastify + TypeScript (port 3000)"]
        
        subgraph Logic["Purchase Flow"]
            V["1. Validate input (Zod)"]
            W["2. Check sale window"]
            L["3. Atomic Redis Lua Script"]
            Q["4. BullMQ Queue"]
            
            V --> W --> L --> Q
        end
        API --> Logic
    end

    subgraph Infrastructure["INFRASTRUCTURE"]
        Redis[("REDIS\n(Cache & Queue)")]
        DB[("POSTGRESQL\n(Source of Truth)")]
    end

    UI -- "HTTP REST" --> API
    L -- "Check & Update" --> Redis
    Q -- "Async Insert (with retry)" --> DB
```

### Flow Diagram: Purchase Request

```mermaid
sequenceDiagram
    actor User
    participant API as Fastify API
    participant Redis as Redis (Lua Script)
    participant BullMQ
    participant DB as PostgreSQL

    User->>API: POST /purchase
    alt Invalid input or Sale not active
        API-->>User: 400 Bad Request / Not active
    else Valid Request
        API->>Redis: Execute Lua Script (userId, productId)
        Note over Redis: Atomic Check & Update
        alt Already bought
            Redis-->>API: Result = -1
            API-->>User: 400 Already purchased
        else Stock empty
            Redis-->>API: Result = -2
            API-->>User: 400 Sold out
        else Success
            Redis-->>API: Result = 1 (DECR stock, SADD user)
            API-->>User: 201 Success
            API->>BullMQ: Enqueue Job
            BullMQ->>DB: Async Insert (with retry)
        end
    end
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
| **Health Checks**      | Docker Healthcheck      | Sequential startup guarantees — no race conditions  |

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

### 6. PostgreSQL as the Durable Source of Truth

While Redis handles all hot-path operations with sub-millisecond latency, **PostgreSQL serves as the authoritative, permanent record** of every successful purchase.

**Why PostgreSQL specifically?**

- **ACID Guarantees**: Every purchase record written to PostgreSQL is fully atomic, consistent, isolated, and durable. Even in the event of a server crash mid-write, the database will never be left in a corrupted or partial state.
- **System of Record**: Redis is an in-memory store — its data is ephemeral and can be lost or invalidated (e.g., on restart or eviction). PostgreSQL persists data to disk, making it the single source of truth for audit trails, reconciliation, and system recovery.
- **Self-Healing on Boot**: When the server restarts, it reads from PostgreSQL to reconstruct the Redis state (`buyers` SET and stock counter). This is only possible because PostgreSQL reliably holds the complete, correct purchase history.
- **Complementary Architecture**: Redis handles *speed* (concurrency, atomic ops), PostgreSQL handles *durability* (persistence, integrity). Neither replaces the other — together they form a write-behind cache pattern that is both fast and safe.
- **Type-Safe Access via Prisma**: Prisma ORM provides auto-generated, TypeScript-typed database clients from the schema, eliminating an entire class of runtime errors caused by mismatched types or raw SQL mistakes.

---

## 📁 Project Structure

```text
bkpi-flash-sale-project/
├── docker-compose.yml          # Orchestrates all services (with healthchecks)
├── k6-script.js                # K6 Load testing script
├── README.md
├── .gitignore
│
├── backend/
│   ├── .dockerignore           # Excludes node_modules from Docker build context
│   ├── Dockerfile
│   ├── src/
│   │   ├── __tests__/          # Modular unit testing (Vitest)
│   │   ├── config/             # Zod Env config, Prisma client
│   │   ├── controllers/        # Route logic & Error mapping
│   │   ├── domain/             # Core interfaces (Repositories, Services)
│   │   ├── infrastructure/     # BullMQ, Redis implementations
│   │   ├── routes/             # flashSaleRoutes (incl. GET /health)
│   │   └── services/           # Business logic (FlashSaleService)
│
└── frontend/
    ├── .dockerignore           # Excludes node_modules from Docker build context
    ├── .env
    └── src/
        ├── __tests__/          # Separated unit test files (Vitest)
        ├── components/         # Atomic UI components
        ├── hooks/              # Custom React hooks
        ├── types/              # TypeScript interfaces
        └── App.tsx             # Root Layout
```

---

## 🚀 Getting Started

### Prerequisites

- [Docker](https://www.docker.com/get-started) & Docker Compose
- [Node.js](https://nodejs.org/) v24+ (for running tests outside Docker)

### Option A: Run with Docker Compose (Recommended)

This starts **all services** (PostgreSQL, Redis, Backend, Frontend) in one command.

```bash
# Clone the repository
git clone <your-repo-url>
cd bkpi-flash-sale-project

# Start all services in detached mode
docker compose up -d --build
```

> **Note:** Services start in a guaranteed sequential order enforced by Docker healthchecks:
> `PostgreSQL` → `Redis` → `Backend` → `Frontend`
> The frontend will only be accessible once the backend is fully ready.

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

### `GET /health`

Returns the health status of the backend server. Used internally by Docker Compose healthchecks to determine when the backend is ready to accept requests.

**Response `200`:**

```json
{
  "status": "ok"
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

### Using Docker Compose (Recommended)

K6 is already integrated into the `docker-compose.yml` under the `loadtest` profile.

1. Start your application services first:
   ```bash
   docker compose up -d
   ```
2. Run the load test using the provided `k6-script.js`:
   ```bash
   docker compose run --rm k6
   ```

_(This command spawns a temporary K6 container that executes the stress test and cleans itself up automatically when finished)._

### Using k6 Locally

If you prefer to run it outside of Docker and have [k6](https://k6.io/docs/get-started/installation/) installed locally, you can execute:

```bash
k6 run k6-script.js
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

Below is the list of key environment variables (`.env`) used in this project along with their default values for local development:

### Backend (`backend/.env`)

| Variable       | Description                    | Default Local Value                                                      |
| -------------- | ------------------------------ | ------------------------------------------------------------------------ |
| `DATABASE_URL` | PostgreSQL database connection | `postgresql://postgres:password@localhost:5432/flash_sale?schema=public` |
| `REDIS_URL`    | Redis server connection        | `redis://localhost:6379`                                                 |
| `PORT`         | Backend server port            | `3000`                                                                   |

### Frontend (`frontend/.env`)

Copy the `.env.example` file to `.env` before running the frontend:

```bash
cp frontend/.env.example frontend/.env
```

| Variable       | Description                          | Default Local Value     |
| -------------- | ------------------------------------ | ----------------------- |
| `VITE_API_URL` | Backend API URL to be consumed       | `http://localhost:3000` |

---

## 🔧 Troubleshooting

Here are some common issues that might occur during local setup and how to resolve them:

- **`http://localhost:5173` shows "This page isn't working" right after startup**
  - **Cause:** Previously, `depends_on` in Docker Compose only waited for the container to *start*, not for the service inside it to be *ready*. This caused a race condition where the frontend started before the backend finished initializing.
  - **Fix (already applied):** Docker healthchecks are now configured on all services. The startup order is strictly enforced:
    `PostgreSQL (healthy)` → `Redis (healthy)` → `Backend (healthy via GET /health)` → `Frontend (starts)`
  - If you still see this on a fresh clone, ensure you are using the latest `docker-compose.yml`.

- **Build fails with `invalid file request node_modules/.bin/acorn`**
  - **Cause:** Missing `.dockerignore` file causes Docker to attempt transferring Windows `node_modules` (including broken symlinks in `.bin/`) into the Linux build context.
  - **Fix (already applied):** `.dockerignore` files are included in both `backend/` and `frontend/` to exclude `node_modules` from the Docker build context. `npm install` runs inside the container on a clean Linux environment.

- **Error: `bind: address already in use`**
  - **Cause:** Port `3000` (Backend), `5432` (PostgreSQL), `6379` (Redis), or `5173` (Frontend) is already in use by another application on your computer.
  - **Solution:** Stop the application using that port, or change the port mapping in the `docker-compose.yml` file (e.g., `3001:3000`).

- **How to view real-time logs from Docker?**
  - To view backend logs: `docker compose logs -f backend`
  - To view frontend logs: `docker compose logs -f frontend`
  - To view logs for all services: `docker compose logs -f`

- **Backend experiences "Database Connection Error"**
  - Ensure the database container is fully ready. You can try restarting the backend by running `docker compose restart backend`.

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
