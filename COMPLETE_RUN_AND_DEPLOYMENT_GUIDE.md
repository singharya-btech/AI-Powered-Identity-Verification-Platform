# Complete Run & Deployment Guide: AI-Powered E-KYC Platform

This guide provides the complete, end-to-end instructions for running the **AI-Powered E-KYC Identity Verification Platform** manually on your local machine and deploying the exact same codebase to a production server.

---

## 1. Project Architecture & Codebase Map

The project is built as a modular microservices architecture designed to operate **100% offline** with zero external cloud API dependencies, zero recurring API billing, and complete biometric data privacy.

```
AI-Powered E-KYC Identity Verification Platform
├── backend/                       # Python FastAPI Backend
│   ├── app/
│   │   ├── api/v1/                # REST API routes (auth, kyc, health)
│   │   ├── core/                  # Configuration, JWT security, Prometheus metrics
│   │   ├── db/                    # SQLAlchemy engine & session factory
│   │   ├── models/                # SQLAlchemy database models (User, Role, KycSession, AuditLog)
│   │   ├── schemas/               # Pydantic request/response schemas
│   │   └── services/              # Business logic (OCR, FaceNet, Workflow, Reporting)
│   ├── migrations/                # Alembic database migration scripts (versions 0001 - 0005)
│   ├── scripts/                   # Management scripts (create_admin.py)
│   ├── tests/                     # Automated pytest suite (86 tests)
│   └── config.yaml                # Computer vision and threshold settings
├── frontend-react/                # React 18 + Vite + TypeScript Frontend
│   ├── src/
│   │   ├── components/            # UI components (Camera, Queue, Navbar, ProtectedRoute)
│   │   ├── context/               # AuthContext (JWT memory storage, role state)
│   │   ├── pages/                 # Customer & Admin pages (Login, Register, Dashboard, Verification)
│   │   └── services/              # Axios API client (dynamic dev/production endpoint switching)
│   ├── nginx.conf                 # Production Nginx reverse proxy configuration
│   └── package.json               # Frontend dependencies and test scripts
├── data/                          # Models and intermediate data
│   ├── models/                    # Haar Cascade face detection XML models
│   └── .deepface/                 # Cached FaceNet biometric neural network weights
├── k8s/                           # Kubernetes Kustomize manifests (Backend, Frontend, DB, Ingress)
├── monitoring/                    # Prometheus scrape configs & Grafana dashboards
├── Dockerfile.backend             # Multi-stage Python 3.11 production container
├── Dockerfile.frontend            # Multi-stage React 18 + Nginx container
├── docker-compose.yml             # Docker Compose orchestration specification
├── .env.example                   # Local development environment template
└── .env.production.example        # Production server environment template
```

---

## 2. Where & What You Need to Change Manually

All application configuration is driven through the `.env` file in the project root. You do not need to modify application source code to switch between local development and production server deployment.

### Summary of Manual Settings

| Configuration Key | Local Bare-Metal Run | Local Docker Compose Run | Production Server Deployment | Description |
| :--- | :--- | :--- | :--- | :--- |
| `APP_ENV` | `development` | `development` | `production` | Runtime mode. Disables debug traces in production. |
| `DEBUG` | `false` | `false` | `false` | Verbose SQLAlchemy and framework logging. |
| `ENABLE_DOCS` | `true` | `true` | `false` (or `true`) | Enables `/docs` Swagger UI and `/redoc`. Set `false` for public servers. |
| `ADMIN_EMAIL` | `admin@ekyc-platform.com` | `admin@ekyc-platform.com` | `admin@yourdomain.com` | Platform admin email. Auto-provisioned on boot. |
| `ADMIN_PASSWORD` | `Admin@Secure2026!` | `Admin@Secure2026!` | Strong custom password | Admin password. Auto-synchronized with database on boot. |
| `ADMIN_FULL_NAME` | `System Administrator` | `System Administrator` | `Platform Administrator` | Display name of the administrator. |
| `POSTGRES_USER` | `postgres` | `postgres` | `postgres` (or custom) | PostgreSQL username. |
| `POSTGRES_PASSWORD` | `postgres` | `postgres` | Strong random password | PostgreSQL database password. |
| `POSTGRES_DB` | `ekyc_db` | `ekyc_db` | `ekyc_db` | PostgreSQL database name. |
| `POSTGRES_PORT` | `5432` | `5432` | `5432` | Host port for PostgreSQL database. |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/ekyc_db` | `postgresql://postgres:postgres@db:5432/ekyc_db` | `postgresql://<user>:<pass>@db:5432/<db>` | Database connection string. Note: Use `localhost` for bare-metal, `db` for Docker Compose. |
| `JWT_SECRET_KEY` | Any 32+ char key | Any 32+ char key | Generate with `openssl rand -hex 32` | Cryptographic secret for signing JWT tokens. |
| `FRONTEND_PORT` | `5173` (Vite dev) | `80` | `80` (or `443`) | Ingress port exposed by Nginx in Docker. |
| `CORS_ORIGINS` | `["http://localhost:5173", "http://127.0.0.1:5173"]` | `["http://localhost", "http://localhost:80"]` | `["https://ekyc.yourdomain.com", "http://<server-ip>"]` | Allowed CORS origins for browsers connecting to API. |

---

## 3. Step-by-Step Manual (Bare-Metal) Local Execution

Follow these steps if you want to run the FastAPI backend and Vite frontend directly on your local machine.

### Prerequisites

- **Python**: Python 3.11, 3.12, or 3.13 installed.
- **Node.js**: Node.js v18 or v20+ with npm installed.
- **PostgreSQL**: Either a local PostgreSQL 15+ installation OR run PostgreSQL using Docker.

---

### Step 1: Start PostgreSQL Database

If you have Docker Desktop installed, start only the PostgreSQL container with one command:

```powershell
docker compose up -d db
```

*Verification*: Verify the database container is healthy:
```powershell
docker compose ps db
```

*(Optional) If using standalone local PostgreSQL without Docker*: Ensure PostgreSQL is running on port 5432 and create the database:
```sql
CREATE DATABASE ekyc_db;
```

---

### Step 2: Configure Local `.env`

Copy `.env.example` to `.env` (or verify existing `.env`):

```powershell
Copy-Item .env.example .env
```

Ensure the database URL in `.env` points to `localhost`:
```ini
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ekyc_db
```

---

### Step 3: Set Up Python Virtual Environment & Dependencies

In the project root directory:

```powershell
# 1. Create virtual environment (if not already created)
python -m venv .venv

# 2. Activate virtual environment
.venv\Scripts\Activate.ps1

# 3. Upgrade pip and install dependencies
pip install --upgrade pip
pip install -r requirements.txt
```

---

### Step 4: Run Database Migrations

Apply the Alembic schema migrations to build all required tables (`roles`, `users`, `kyc_sessions`, `audit_logs`):

```powershell
alembic upgrade head
```

*Output should conclude with:*
```
INFO  [alembic.runtime.migration] Running upgrade -> 0001_initial_schema
INFO  [alembic.runtime.migration] Running upgrade 0001 -> 0002_add_kyc_ocr_fields
INFO  [alembic.runtime.migration] Running upgrade 0002 -> 0003_add_face_verification_fields
INFO  [alembic.runtime.migration] Running upgrade 0003 -> 0004_add_kyc_workflow_fields
INFO  [alembic.runtime.migration] Running upgrade 0004 -> 0005_add_performance_indexes
```

---

### Step 5: (Optional) Synchronize Platform Administrator

The platform administrator account is automatically provisioned and synchronized on backend startup using the values from `.env`. You can also trigger this manually at any time:

```powershell
python -m backend.scripts.create_admin
```

---

### Step 6: Start FastAPI Backend

Run the backend server using the runner script:

```powershell
python run_backend.py
```

*Alternatively, run Uvicorn directly:*
```powershell
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

---

### Step 7: Verify Backend & Swagger API Documentation

Open your web browser and navigate to:

- **Interactive API Swagger UI**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **ReDoc Documentation**: [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)
- **Health Check Endpoint**: [http://127.0.0.1:8000/api/v1/health](http://127.0.0.1:8000/api/v1/health)
- **Prometheus Telemetry**: [http://127.0.0.1:8000/metrics](http://127.0.0.1:8000/metrics)

---

### Step 8: Set Up and Start React Frontend

Open a **new PowerShell terminal**:

```powershell
# Navigate to frontend directory
cd frontend-react

# Install NPM dependencies
npm install

# Start Vite development server
npm run dev
```

*Alternatively, from the project root:*
```powershell
python run_frontend.py
```

---

### Step 9: Access the Web Application

Open your browser to:
[http://127.0.0.1:5173](http://127.0.0.1:5173)

---

## 4. Step-by-Step Local Docker Compose Run (1-Command Full Stack)

To run the complete production-identical containerized stack locally:

### Step 1: Start Full Stack

In the project root:

```powershell
docker compose up --build -d
```

### What Happens Automatically:
1. `db`: PostgreSQL 15 starts and verifies healthy state.
2. `migrate`: Alembic container executes `alembic upgrade head` and exits successfully with code 0.
3. `backend`: FastAPI starts on `backend:8000`, initializes local AI weights, provisions the administrator from `.env`, and reports healthy.
4. `frontend`: Compiles optimized React production bundle and launches Nginx reverse proxy on port 80.

### Step 2: Check Container Health

```powershell
docker compose ps
```

All services will show status `Up` (healthy).

### Step 3: Access Containerized Application

- **Frontend Application**: [http://localhost](http://localhost)
- **Swagger Documentation**: [http://localhost/docs](http://localhost/docs)
- **API Health Endpoint**: [http://localhost/health](http://localhost/health)
- **Metrics Endpoint**: [http://localhost:8000/metrics](http://localhost:8000/metrics) (or internal network)

To stop the containers:
```powershell
docker compose down
```

---

## 5. End-to-End User Verification & Admin Review Journey

### Scenario A: Customer Journey (Applicant KYC Submission)

1. **Registration**:
   - Go to [http://localhost/register](http://localhost/register) (or `http://127.0.0.1:5173/register`).
   - Register a customer account (e.g. `john.doe@example.com`, Password: `Customer#2026Pass`).
2. **Login**:
   - Log in with the registered credentials.
   - Redirected automatically to the Customer KYC Dashboard.
3. **Document Upload**:
   - Select document type: **PAN Card** or **Aadhaar Card**.
   - Upload an identity document image (`.jpg`, `.jpeg`, `.png`).
   - The backend runs OpenCV image normalization (contrast, deskew) and EasyOCR text extraction.
   - Extracted details (Document Number, Full Name, Date of Birth) are displayed with confidence scores for review.
4. **Biometric Face Verification**:
   - Accept the explicit Biometric Consent agreement.
   - Enable your webcam and click **Capture Selfie**.
   - The backend detects facial bounding boxes and compares the selfie against the document photo using DeepFace FaceNet cosine similarity.
   - Match Score and Status (`MATCH` / `NO_MATCH`) are calculated and recorded.
5. **Submit Application**:
   - Click **Submit Application for Verification**.
   - Session status changes to `PENDING_ADMIN_REVIEW`.

---

### Scenario B: Compliance Administrator Journey (Review & Reporting)

1. **Admin Login**:
   - Log in with `.env` administrator credentials:
     - **Email**: `admin@ekyc-platform.com` (or your configured email)
     - **Password**: `Admin@Secure2026!` (or your configured password)
   - Redirected automatically to the **Admin Compliance Portal**.
2. **Analytics Dashboard**:
   - View live PostgreSQL computed metrics: Total Applications, Approved, Rejected, Pending, Face Match Rates, and Today's Volume.
3. **Verification Queue**:
   - Filter applications by status (`ALL`, `PENDING_ADMIN_REVIEW`, `APPROVED`, `REJECTED`).
   - Use server-side search by applicant name or session ID.
   - Filter by date range.
4. **Application Review Modal**:
   - Click **Review Application** on any pending record.
   - Inspect the verification dossier:
     - Extracted identity fields.
     - Document face vs live selfie comparison preview.
     - FaceNet similarity score (Threshold <= 0.40).
     - Audit trail of previous actions.
5. **Decision & Audit**:
   - **Approve**: Confirms approval and updates user verification status to `is_verified = True`.
   - **Reject**: Enforces a mandatory meaningful explanation (minimum 5 characters) for regulatory compliance.
   - Every action automatically generates an immutable `AuditLog` entry.
6. **Regulatory Export**:
   - Click **Export CSV** or **Export Excel (.xlsx)**.
   - Downloads sanitized, formula-injection-protected reports with zero raw biometric embeddings or plaintext PII leakage.

---

## 6. Step-by-Step Production Server Deployment (Linux VPS / Cloud)

Deploying the exact same codebase to a remote Ubuntu / Debian server takes under 10 minutes.

### Server Requirements
- **OS**: Ubuntu 22.04 LTS / 24.04 LTS or Debian 12
- **Hardware**: Minimum 4 GB RAM, 2 vCPUs, 20 GB SSD
- **Software**: Docker Engine and Docker Compose Plugin installed

---

### Step 1: Install Docker on the Server

```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Docker prerequisites
sudo apt install -y curl git ufw ca-certificates gnupg

# Install Docker official repository
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Allow non-root docker execution
sudo usermod -aG docker $USER
newgrp docker
```

---

### Step 2: Clone the Project from GitLab

```bash
git clone http://<your-gitlab-ip-or-domain>:8929/root/ekyc-platform.git /opt/ekyc-platform
cd /opt/ekyc-platform
```

---

### Step 3: Configure Production `.env`

Copy the production template:

```bash
cp .env.production.example .env
nano .env
```

**Set the following mandatory production variables:**
1. Generate random secrets:
   ```bash
   openssl rand -hex 32
   ```
   Set `JWT_SECRET_KEY` to this generated value.
2. Set a strong database password:
   ```ini
   POSTGRES_PASSWORD=YourStrongDatabasePassword2026!
   DATABASE_URL=postgresql://postgres:YourStrongDatabasePassword2026!@db:5432/ekyc_db
   ```
3. Set your production administrator email and password:
   ```ini
   ADMIN_EMAIL=security-admin@yourdomain.com
   ADMIN_PASSWORD=ProductionAdmin#Password2026!
   ```
4. Set CORS and Ingress:
   ```ini
   CORS_ORIGINS=["https://ekyc.yourdomain.com", "http://your-server-ip"]
   ENABLE_DOCS=false
   APP_ENV=production
   ```

---

### Step 4: Build and Launch with Docker Compose

```bash
docker compose up --build -d
```

Verify status:
```bash
docker compose ps
docker compose logs -f backend
```

---

### Step 5: Configure Production SSL / HTTPS (Certbot & Nginx)

To secure client camera streams with TLS/SSL:

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain SSL Certificate (if pointing domain to server)
sudo certbot --nginx -d ekyc.yourdomain.com
```

---

### Step 6: Configure Server Firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

---

## 7. Testing & Verification Commands

| Scope | Command | Description |
| :--- | :--- | :--- |
| **Backend Unit & Integration Tests** | `pytest backend/tests/ -v` | Runs complete 86-test suite covering auth, OCR, face matching, workflows, and database. |
| **Frontend Unit & Component Tests** | `npm --prefix frontend-react test` | Runs Vitest suite covering forms, camera, auth context, dashboard, and review modals. |
| **Frontend Production Build** | `npm --prefix frontend-react run build` | Compiles and validates TypeScript types and generates optimized bundle. |
| **Live Database Health** | `curl -f http://127.0.0.1:8000/api/v1/health` | Verifies runtime status and live PostgreSQL connectivity. |
| **Metrics Telemetry** | `curl -s http://127.0.0.1:8000/metrics` | Dumps Prometheus telemetry for Grafana scraping. |

