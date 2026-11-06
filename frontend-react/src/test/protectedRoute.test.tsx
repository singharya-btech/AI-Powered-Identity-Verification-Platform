import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '../routes/ProtectedRoute';
import * as AuthHook from '../hooks/useAuth';

vi.mock('../hooks/useAuth');

describe('ProtectedRoute RBAC Enforcement', () => {
  it('redirects unauthenticated visitor to /login', () => {
    vi.spyOn(AuthHook, 'useAuth').mockReturnValue({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/customer']}>
        <Routes>
          <Route path="/login" element={<div>Login Page Screen</div>} />
          <Route
            path="/customer"
            element={
              <ProtectedRoute allowedRoles={['CUSTOMER']}>
                <div>Secret Customer Dashboard</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText('Secret Customer Dashboard')).not.toBeInTheDocument();
    expect(screen.getByText('Login Page Screen')).toBeInTheDocument();
  });

  it('blocks CUSTOMER user from accessing ADMIN protected route', () => {
    vi.spyOn(AuthHook, 'useAuth').mockReturnValue({
      user: {
        id: 'cust-uuid',
        full_name: 'Customer User',
        email: 'cust@example.com',
        is_active: true,
        is_verified: false,
        role: { id: 2, name: 'CUSTOMER', description: null },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      token: 'valid.customer.token',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/customer" element={<div>Customer Dashboard Fallback</div>} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <div>Restricted Admin Console</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText('Restricted Admin Console')).not.toBeInTheDocument();
    expect(screen.getByText('Customer Dashboard Fallback')).toBeInTheDocument();
  });

  it('allows ADMIN user to access ADMIN protected route', () => {
    vi.spyOn(AuthHook, 'useAuth').mockReturnValue({
      user: {
        id: 'admin-uuid',
        full_name: 'System Admin',
        email: 'admin@ekyc.local',
        is_active: true,
        is_verified: true,
        role: { id: 1, name: 'ADMIN', description: null },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      token: 'valid.admin.token',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <div>Restricted Admin Console</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Restricted Admin Console')).toBeInTheDocument();
  });
});
