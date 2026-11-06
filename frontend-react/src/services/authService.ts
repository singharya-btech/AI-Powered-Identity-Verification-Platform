import { api, AuthResponse, UserProfile, setAuthToken } from './api';

export interface RegisterPayload {
  full_name: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export const authService = {
  /**
   * Register a new Customer account.
   */
  async register(payload: RegisterPayload): Promise<UserProfile> {
    const response = await api.post<UserProfile>('/api/v1/auth/register', payload);
    return response.data;
  },

  /**
   * Authenticate user credentials and return signed JWT + profile.
   */
  async login(payload: LoginPayload): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/api/v1/auth/login', payload);
    const authData = response.data;
    // Store token strictly in-memory
    setAuthToken(authData.access_token);
    return authData;
  },

  /**
   * Fetch current authenticated user's profile from live database.
   */
  async getCurrentUser(): Promise<UserProfile> {
    const response = await api.get<UserProfile>('/api/v1/auth/me');
    return response.data;
  },

  /**
   * Fetch system users (ADMIN only).
   */
  async getAdminUsers(): Promise<UserProfile[]> {
    const response = await api.get<UserProfile[]>('/api/v1/auth/admin/users');
    return response.data;
  },

  /**
   * Terminate user session in-memory.
   */
  logout(): void {
    setAuthToken(null);
  },
};

