# Docker & Docker Compose Deployment Guide

This directory details the containerization architecture, multi-stage Dockerfiles, and orchestration workflows for the **AI-Powered E-KYC Identity Verification Platform**.

---

## 1. Container Architecture Overview

The platform uses a production-hardened microservices architecture orchestrated via Docker Compose:

```mermaid
flowchart TD
    subgraph Host["Host Machine / Ingress"]
        Browser["User Browser / Client"]
        DevHost["Developer Host Machine"]
    end

    subgraph DockerCompose["Docker Compose (ekyc-network)"]
        subgraph IngressLayer["Edge & Ingress (Port 80)"]
            Frontend["frontend (Nginx 1.27 Alpine)\n- Multi-stage build\n- Reverse proxy /api/ -> backend:8000\n- Reverse proxy /docs -> backend:8000\n- Healthcheck: /healthz"]
        end

        subgraph AppLayer["Application Layer (Internal Port 8000)"]
            Backend["backend (Python 3.11-slim FastAPI)\n- Non-root user: appuser (UID 10001)\n- Local EasyOCR & DeepFace FaceNet\n- Healthcheck: /api/v1/health\n- Uvicorn 2 workers"]
        end

        subgraph DBLayer["Data Layer (Port 5432)"]
            DB["db (PostgreSQL 15 Alpine)\n- Persistent storage\n- Healthcheck: pg_isready\n- Exposed to host for dev"]
            Migrate["migrate (Alembic One-Shot)\n- Runs 'alembic upgrade head'\n- Exits with 0 after completion"]
        end

        subgraph NamedVolumes["Named Persistent Docker Volumes"]
            VolDB[("ekyc-db-data\nPostgreSQL Relational DB")]
            VolAI[("ekyc-ai-models-cache\nEasyOCR Model Weights")]
            VolLogs[("ekyc-backend-logs\nApplication Logs")]
        end
    end

    Browser -->|HTTP Port 80| Frontend
    DevHost -.->|Port 5432 (Optional Dev Access)| DB
    Frontend -->|Internal HTTP Proxy| Backend
    Migrate -->|DDL Migration on boot| DB
    Backend -->|SQLAlchemy Connection Pool| DB
    DB --- VolDB
    Backend --- VolAI
    Backend --- VolLogs
```

---

## 2. Service Specifications

| Service | Image / Base | Internal Port | Host Port | Health Check | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`db`** | `postgres:15-alpine` | `5432` | `5432` | `pg_isready -U postgres -d ekyc_db` | Relational identity store with persistent storage volume. |
| **`migrate`** | `Dockerfile.backend` | N/A (CLI) | N/A | Exits `0` on success | One-shot Alembic migration container. Runs `alembic upgrade head` after `db` is healthy. |
| **`backend`** | `Dockerfile.backend` | `8000` | N/A (Internal) | `curl -f http://127.0.0.1:8000/api/v1/health` | FastAPI ASGI engine, local EasyOCR, OpenCV, and DeepFace FaceNet. Runs under unprivileged UID 10001. |
| **`frontend`** | `Dockerfile.frontend` | `80` | `80` (or `${FRONTEND_PORT}`) | `wget --spider http://127.0.0.1:80/healthz` | Multi-stage React 18 production bundle served via Nginx reverse proxy. |

---

## 3. Multi-Stage Dockerfiles Deep Dive

### A. Backend Container (`Dockerfile.backend`)
- **Base Image:** `python:3.11-slim` (optimized footprint, ~650 MB vs 1.8 GB full image).
- **System Dependencies:** `libgl1`, `libglib2.0-0`, `libgomp1`, `curl`, `gcc`, `libpq-dev`.
- **Security:** Creates dedicated unprivileged non-root user `appuser:appgroup` (`UID 10001`). No root execution in production.
- **Pre-cached AI Models:** FaceNet model weights (`data/.deepface/`) and Haar Cascade classifiers (`data/models/`) are copied into the container to enable 100% offline startup without external internet access.
- **Layer Caching:** `requirements.txt` is installed prior to copying source code to maximize Docker layer cache reuse.

### B. Frontend Container (`Dockerfile.frontend`)
- **Stage 1 (Builder):** `node:20-alpine` installs dependencies via `npm ci` and runs `npm run build` with TypeScript static compilation.
- **Stage 2 (Production Server):** `nginx:1.27-alpine-slim` receives the compiled `/app/dist` static files and custom `nginx.conf`.
- **Reverse Proxy Routing:**
  - `location /`: Serves React SPA static assets with cache-busting headers and SPA HTML5 fallback (`try_files $uri $uri/ /index.html`).
  - `location /api/`: Proxies requests directly to `http://backend:8000` with 180-second timeout for computer vision inference.
  - `location ~* ^/(docs|redoc|openapi\.json|health)`: Proxies Swagger documentation and health checks directly to the backend.
  - `location /healthz`: Dedicated lightweight Nginx health probe returning HTTP 200.

---

## 4. Quickstart Commands

### 1. Launch the Complete Stack
From the project root:

```bash
docker compose up --build -d
```

### 2. Verify Container Health
```bash
docker compose ps
```
All containers should display `Up (healthy)`.

### 3. View Real-Time Logs
```bash
# Follow backend logs (including AI model loading and inference)
docker compose logs -f backend

# Follow migration runner logs
docker compose logs migrate

# Follow Nginx proxy access logs
docker compose logs -f frontend
```

### 4. Hybrid Development Mode (DB Only)
If you wish to develop locally with Python and Node while running PostgreSQL inside Docker:

```bash
# Start only the database container
docker compose up -d db

# Verify port 5432 is accessible from localhost
docker compose ps db
```

Now you can run `python run_backend.py` and `npm run dev` in `frontend-react/` on your host machine.

### 5. Execute Database Migrations Manually
```bash
docker compose run --rm migrate alembic upgrade head
```

### 6. Stop and Clean Up
```bash
# Stop containers gracefully
docker compose down

# Stop containers and remove persistent volumes (WARNING: Deletes database data)
docker compose down -v
```

---

## 5. Persistent Named Volumes

| Volume Name | Target Container Path | Purpose |
| :--- | :--- | :--- |
| **`ekyc-db-data`** | `/var/lib/postgresql/data` | Preserves PostgreSQL tables, records, users, and audit logs across container restarts. |
| **`ekyc-ai-models-cache`** | `/home/appuser/.EasyOCR` | Stores downloaded EasyOCR detector and recognition neural network weights. |
| **`ekyc-backend-logs`** | `/app/logs` | Stores persistent application logs for auditing and troubleshooting. |

---

## 6. Production Hardening & Resource Allocation

When deploying Docker Compose to a production server, add resource limits to `docker-compose.yml` under each service:

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 3072M
        reservations:
          cpus: '0.5'
          memory: 1024M
```

