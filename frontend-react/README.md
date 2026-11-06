# VeriFace AI — Modern React Frontend

The official React frontend for the AI-Powered E-KYC Identity Verification Platform. Built with React 18, Vite, TypeScript, Tailwind CSS, React Router v6, Axios, and Lucide React icons.

---

## 1. Technology Stack

- **Framework:** React 18 + Vite 5
- **Language:** TypeScript 5
- **Styling:** Tailwind CSS 3
- **Routing:** React Router DOM v6
- **HTTP Client:** Axios with custom interceptors
- **Icons:** Lucide React
- **State Management:** React Context API (`AuthContext`)
- **Testing:** Vitest 2 + React Testing Library + jsdom

---

## 2. Project Architecture

```
frontend-react/
├── public/                        # Static assets (shield.svg, favicon)
├── src/
│   ├── components/
│   │   ├── common/                # Reusable UI components
│   │   │   ├── Alert.tsx          # Status notifications (success, error, warning, info)
│   │   │   ├── Button.tsx         # Styled button with loading state & icons
│   │   │   ├── Card.tsx           # Rounded surface with subtle shadow
│   │   │   ├── Footer.tsx         # Compliance & transparency disclosures
│   │   │   ├── Input.tsx          # Form inputs with password visibility toggle
│   │   │   ├── LoadingSpinner.tsx # Responsive loading indicator
│   │   │   └── Navbar.tsx         # Responsive navbar with dynamic session actions
│   │   └── layout/
│   │       ├── DashboardLayout.tsx# Admin/Customer responsive sidebar shell
│   │       └── MainLayout.tsx     # Public page wrapper with Navbar and Footer
│   ├── context/
│   │   └── AuthContext.tsx        # In-memory authentication state provider
│   ├── hooks/
│   │   └── useAuth.ts             # Auth hook consumer
│   ├── pages/
│   │   ├── admin/
│   │   │   ├── AdminDashboard.tsx # Overview statistics from live database
│   │   │   ├── SystemHealth.tsx   # Live telemetry from /api/v1/health
│   │   │   ├── UserManagement.tsx # Real user table via /api/v1/auth/admin/users
│   │   │   └── VerificationQueue.tsx # Honest queue placeholder for Task 04
│   │   ├── customer/
│   │   │   ├── CustomerDashboard.tsx # Profile, status & verification pipeline
│   │   │   └── VerificationFlow.tsx  # Interactive capture view for Task 04
│   │   ├── Home.tsx               # Landing page with complete platform disclosures
│   │   ├── Login.tsx              # Authenticate, handle 401 & 429 rate limit timer
│   │   └── Register.tsx           # Customer sign up with complexity validation
│   ├── routes/
│   │   ├── AppRoutes.tsx          # Application route definitions
│   │   └── ProtectedRoute.tsx     # Client-side RBAC & session guard
│   ├── services/
│   │   ├── api.ts                 # Axios instance with in-memory token interceptor
│   │   └── authService.ts         # Authentication API requests
│   ├── test/                      # Vitest & Testing Library test suites (11 tests)
│   ├── App.tsx                    # Root application component
│   ├── main.tsx                   # DOM entrypoint
│   └── index.css                  # Tailwind directives and typography
├── .env                           # Local environment variables
├── .env.example                   # Environment configuration template
├── package.json                   # Dependencies and scripts
├── tsconfig.json                  # TypeScript compiler settings
├── tailwind.config.js             # Tailwind design system settings
└── vite.config.ts                 # Vite bundler & Vitest test runner configuration
```

---

## 3. Environment Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Environment variables:

```ini
# Backend API Base URL (FastAPI backend)
VITE_API_BASE_URL=http://127.0.0.1:8000
```

---

## 4. Installation & Development

### Install Dependencies:

```bash
npm install
```

### Start Development Server:

```bash
npm run dev
```

The Vite dev server starts at `http://127.0.0.1:5173`.

### Run TypeScript Linting:

```bash
npm run lint
```

### Run Automated Tests:

```bash
npm test
```

### Production Build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

---

## 5. Backend Connection & CORS

The React application connects to the FastAPI backend running on port `8000`.

- Backend CORS is pre-configured in `backend/app/core/config.py` to allow requests originating from:
  - `http://localhost:5173`
  - `http://127.0.0.1:5173`
  - `http://localhost:3000`
- If hosting on a custom domain or staging port, update `CORS_ORIGINS` in the backend `.env`.

---

## 6. Authentication & Security Architecture

### In-Memory Token Management
In compliance with Task 03 security instructions:
- JWT tokens are **never** stored in `localStorage` or `sessionStorage` (preventing persistent token theft via Cross-Site Scripting).
- Access tokens are retained exclusively in-memory inside `src/services/api.ts` and `AuthContext`.
- **Note on Refresh:** Refreshing the browser page clears in-memory state and requires signing in again during this phase. A secure HttpOnly refresh cookie mechanism can be introduced in a future task.

### Anti-Brute-Force Rate Limiting (HTTP 429)
- On 5 failed login attempts within 15 minutes, the backend responds with HTTP 429 and a `Retry-After: <seconds>` header.
- The `Login` component catches this response and automatically starts a live countdown timer, disabling subsequent attempts until the lockout period elapses.

### Role-Based Access Control (RBAC)
- Public registration (`/register`) automatically creates a `CUSTOMER` account and suppresses any role injection fields.
- Administrator accounts are provisioned via the backend CLI (`python run_backend.py --create-admin`).
- `ProtectedRoute` inspects the user's verified database role:
  - Customers attempting to navigate to `/admin/*` are automatically redirected to `/customer`.
  - Unauthenticated visitors attempting to view `/customer/*` or `/admin/*` are redirected to `/login`.
  - The backend endpoints independently enforce role authorizations as the final authority.

---

## 7. Available Pages & Routes

| Route | Access | Component | Purpose |
|---|---|---|---|
| `/` | Public | `Home.tsx` | Platform landing page with OCR/biometrics transparency notice |
| `/login` | Public | `Login.tsx` | Account login with rate-limiting countdown and role redirect |
| `/register` | Public | `Register.tsx` | Customer registration with real-time complexity validation |
| `/customer` | Customer | `CustomerDashboard.tsx` | Profile summary, KYC status card, and verification session history |
| `/customer/verify` | Customer | `VerificationFlow.tsx` | Local AI document image upload, EasyOCR extraction, and masked review |
| `/admin` | Admin | `AdminDashboard.tsx` | Telemetry overview calculated from real registered users |
| `/admin/users` | Admin | `UserManagement.tsx` | Real user table populated from `GET /api/v1/auth/admin/users` |
| `/admin/verifications` | Admin | `VerificationQueue.tsx` | Real-time audit queue of all platform verification sessions via `GET /api/v1/kyc/admin/sessions` |
| `/admin/system` | Admin | `SystemHealth.tsx` | Real-time database and service health probe |

