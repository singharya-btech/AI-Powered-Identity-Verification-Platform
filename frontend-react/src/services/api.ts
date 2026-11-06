import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL !== undefined
    ? import.meta.env.VITE_API_BASE_URL
    : import.meta.env.PROD
    ? ''
    : 'http://127.0.0.1:8000';

export interface UserRole {
  id: number;
  name: 'ADMIN' | 'CUSTOMER';
  description: string | null;
}

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  is_verified: boolean;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: UserProfile;
}

export interface ApiErrorMessage {
  message: string;
  status?: number;
  retryAfter?: number;
}

// In-memory token storage (Zero persistent browser storage)
let inMemoryAccessToken: string | null = null;
let unauthorizedCallback: (() => void) | null = null;

export const setAuthToken = (token: string | null): void => {
  inMemoryAccessToken = token;
};

export const getAuthToken = (): string | null => {
  return inMemoryAccessToken;
};

export const registerUnauthorizedHandler = (cb: () => void): void => {
  unauthorizedCallback = cb;
};

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Request Interceptor: Attach in-memory JWT token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (inMemoryAccessToken && config.headers) {
      config.headers.Authorization = `Bearer ${inMemoryAccessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Format errors and handle 401/429
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ detail?: unknown; error?: string; status_code?: number }>) => {
    const status = error.response?.status;
    let message = 'An unexpected error occurred. Please try again.';
    let retryAfter: number | undefined;

    // Parse Retry-After header if present
    const retryHeader = error.response?.headers?.['retry-after'];
    if (retryHeader) {
      const parsed = parseInt(retryHeader, 10);
      if (!isNaN(parsed)) {
        retryAfter = parsed;
      }
    }

    if (!error.response) {
      message = 'Cannot connect to backend server. Please verify the API is running.';
    } else if (status === 401) {
      message = typeof error.response.data?.detail === 'string'
        ? error.response.data.detail
        : 'Session expired or invalid credentials. Please sign in again.';
      setAuthToken(null);
      if (unauthorizedCallback) {
        unauthorizedCallback();
      }
    } else if (status === 403) {
      message = typeof error.response.data?.detail === 'string'
        ? error.response.data.detail
        : 'Access forbidden. You do not have permission to view this resource.';
    } else if (status === 429) {
      const detailStr = typeof error.response.data?.detail === 'string'
        ? error.response.data.detail
        : '';
      message = detailStr || (retryAfter
        ? `Too many attempts. Please try again in ${retryAfter} seconds.`
        : 'Too many attempts. Rate limit exceeded.');
    } else if (status === 422) {
      // Pydantic validation error format: detail is an array of errors
      const detail = error.response.data?.detail;
      if (Array.isArray(detail) && detail.length > 0) {
        message = detail.map((err: { msg?: string; loc?: string[] }) => err.msg || 'Invalid field').join('; ');
      } else {
        message = 'Validation error: Please check your input fields.';
      }
    } else if (status && status >= 500) {
      message = 'An internal server error occurred. Our engineers have been alerted.';
    } else if (error.response.data?.detail && typeof error.response.data.detail === 'string') {
      message = error.response.data.detail;
    } else if (error.response.data?.error && typeof error.response.data.error === 'string') {
      message = error.response.data.error;
    }

    const customError: ApiErrorMessage = {
      message,
      status,
      retryAfter,
    };

    return Promise.reject(customError);
  }
);

