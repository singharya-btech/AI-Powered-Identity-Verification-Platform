import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { authService } from '../services/authService';
import { getAuthToken } from '../services/api';

vi.mock('../services/authService', () => ({
  authService: {
    login: vi.fn(),
    register: vi.fn(),
    getCurrentUser: vi.fn(),
    logout: vi.fn(),
  },
}));

const TestComponent: React.FC = () => {
  const { user, isAuthenticated, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="auth-status">{isAuthenticated ? 'authenticated' : 'unauthenticated'}</span>
      <span data-testid="user-role">{user?.role?.name || 'none'}</span>
      <button
        onClick={() =>
          login({ email: 'user@example.com', password: 'Password#123' })
        }
      >
        Sign In
      </button>
      <button onClick={() => logout()}>Sign Out</button>
    </div>
  );
};

describe('AuthContext & In-Memory Token Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with unauthenticated state and zero tokens in storage', () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
    expect(screen.getByTestId('user-role')).toHaveTextContent('none');
    expect(getAuthToken()).toBeNull();
  });

  it('updates state on successful login without writing to localStorage or sessionStorage', async () => {
    const mockUser = {
      id: 'uuid-123',
      full_name: 'Test Customer',
      email: 'customer@example.com',
      is_active: true,
      is_verified: false,
      role: { id: 2, name: 'CUSTOMER' as const, description: null },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    vi.mocked(authService.login).mockResolvedValueOnce({
      access_token: 'jwt.in-memory.token',
      token_type: 'bearer',
      expires_in: 3600,
      user: mockUser,
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    const loginBtn = screen.getByText('Sign In');
    await act(async () => {
      loginBtn.click();
    });

    expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('user-role')).toHaveTextContent('CUSTOMER');
    // Token is in-memory
    expect(localStorage.getItem('token')).toBeNull();
    expect(sessionStorage.getItem('token')).toBeNull();
  });

  it('clears credentials completely on logout', async () => {
    const mockUser = {
      id: 'uuid-123',
      full_name: 'Test Customer',
      email: 'customer@example.com',
      is_active: true,
      is_verified: false,
      role: { id: 2, name: 'CUSTOMER' as const, description: null },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    vi.mocked(authService.login).mockResolvedValueOnce({
      access_token: 'jwt.in-memory.token',
      token_type: 'bearer',
      expires_in: 3600,
      user: mockUser,
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await act(async () => {
      screen.getByText('Sign In').click();
    });
    expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');

    await act(async () => {
      screen.getByText('Sign Out').click();
    });
    expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
    expect(screen.getByTestId('user-role')).toHaveTextContent('none');
    expect(getAuthToken()).toBeNull();
  });
});

