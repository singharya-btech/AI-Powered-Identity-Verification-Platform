# Backend Clean Architecture & PostgreSQL Migration Documentation

## Overview

The backend architecture is structured according to **Clean Architecture** and **Domain-Driven Design (DDD)** principles to transform the E-KYC application into an enterprise-grade AI verification platform.

```
backend/
├── app/
│   ├── __init__.py               # Application package export
│   ├── main.py                   # FastAPI application factory, lifespan, CORS & exception handlers
│   ├── core/
│   │   ├── __init__.py           # Core exports
│   │   ├── config.py             # Pydantic Settings & environment validation
│   │   └── security.py           # Native bcrypt hashing & JWT token handling
│   ├── db/
│   │   ├── __init__.py           # Database package exports
│   │   ├── base.py               # DeclarativeBase with standard naming conventions
│   │   └── session.py            # Engine, connection pooling & get_db dependency
│   ├── models/
│   │   ├── __init__.py           # Models aggregator
│   │   ├── role.py               # Role entity (ADMIN, CUSTOMER)
│   │   ├── user.py               # User entity (UUID, auth, verification state)
│   │   ├── kyc_session.py        # KYC Session tracking entity (Zero PII)
│   │   └── audit_log.py          # Security & compliance audit log
│   ├── schemas/
│   │   ├── __init__.py           # Pydantic schemas aggregator
│   │   ├── user.py               # User registration, login, token schemas
│   │   └── kyc.py                # KYC session input/output schemas
│   ├── api/
│   │   ├── __init__.py
│   │   └── v1/
│   │       ├── __init__.py
│   │       ├── router.py         # API v1 router aggregator
│   │       └── health.py         # Granular application & DB health check
│   └── services/
│       └── __init__.py           # Business logic layer
│
├── legacy/                       # Isolated legacy code (Digio integration)
│   ├── __init__.py
│   ├── digio_client.py
│   ├── digio_store.py
│   └── digio_api.py
│
├── migrations/                   # Alembic database migrations
│   ├── versions/
│   │   └── 0001_initial_schema.py# Initial migration for PostgreSQL
│   ├── env.py                    # Alembic runtime environment
│   └── script.py.mako            # Migration template
│
├── tests/                        # Automated test suite
│   ├── __init__.py
│   ├── conftest.py               # Isolated test database fixtures
│   ├── test_startup_and_health.py# Boot and /health endpoint tests
│   ├── test_database.py          # Connection & session lifecycle tests
│   ├── test_models.py            # Relational constraints & PII checks
│   ├── test_security.py          # Bcrypt hashing & JWT lifecycle tests
│   └── test_migrations.py        # Alembic upgrade/downgrade verification
│
├── alembic.ini                   # Alembic configuration
├── requirements.txt              # Core backend dependencies
└── Dockerfile                    # Container specification
```

---

## Database Design & Data Minimization

The database architecture is designed with **strict data minimization** under UIDAI and Digital Personal Data Protection (DPDP) Act compliance:

- **Zero PII Storage**: The tables (`users`, `roles`, `kyc_sessions`, `audit_logs`) deliberately contain **no** Aadhaar numbers, PAN numbers, biometric embeddings, or raw identity card scans.
- **UUID Primary Keys**: Entity primary keys use UUIDv4 to avoid sequential enumeration vulnerabilities.
- **Relational Integrity**:
  - `User.role_id` -> `roles.id` with `RESTRICT` on delete.
  - `KycSession.user_id` -> `users.id` with `CASCADE` on delete.
  - `AuditLog.user_id` -> `users.id` with `SET NULL` on delete (audit trail preserved).

---

## PostgreSQL Connection Pooling

In `backend/app/db/session.py`, SQLAlchemy 2.x engine is configured with enterprise connection pooling parameters:

- `pool_size=10`: Persistent connections maintained in the pool.
- `max_overflow=20`: Burst connections created during traffic spikes.
- `pool_pre_ping=True`: Tests connections with a heartbeat ping before handing them to requests, preventing stale connection errors.
- `pool_recycle=1800`: Automatically replaces connections every 30 minutes to comply with cloud database idle timeouts.

---

## Health Check Contract

`GET /api/v1/health` provides granular status:

```json
{
  "status": "healthy",
  "database": "connected",
  "version": "1.0.0",
  "environment": "development",
  "timestamp": "2026-11-04T16:55:00.000000Z",
  "database_error": null
}
```

- When the application and database are operational: returns HTTP `200 OK`.
- If the database is disconnected or unreachable: returns HTTP `503 Service Unavailable` with `status: "degraded"` and `database: "disconnected"`.

---

## Migration Workflow

Migrations are managed with Alembic. Database credentials are read dynamically from `DATABASE_URL` and are never hardcoded.

- **Apply all migrations:**
  ```powershell
  alembic upgrade head
  ```

- **Roll back all migrations:**
  ```powershell
  alembic downgrade base
  ```

- **Generate new migration after model changes:**
  ```powershell
  alembic revision --autogenerate -m "description_of_change"
  ```

