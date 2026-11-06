import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Register } from '../pages/Register';
import { Login } from '../pages/Login';
import * as AuthHook from '../hooks/useAuth';

vi.mock('../hooks/useAuth');

describe('Registration & Login Page Components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates password complexity and mismatched passwords on registration', async () => {
    const mockRegister = vi.fn();
    vi.spyOn(AuthHook, 'useAuth').mockReturnValue({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      register: mockRegister,
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    );

    const nameInput = screen.getByLabelText(/full name/i);
    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInputs = screen.getAllByLabelText(/password/i);
    const submitBtn = screen.getByRole('button', { name: /register account/i });

    // Enter weak password
    fireEvent.change(nameInput, { target: { value: 'Jane Doe' } });
    fireEvent.change(emailInput, { target: { value: 'jane@example.com' } });
    fireEvent.change(passwordInputs[0], { target: { value: 'weak' } });
    fireEvent.change(passwordInputs[1], { target: { value: 'mismatch' } });

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/password does not meet the complexity requirements/i)).toBeInTheDocument();
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });

    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('submits valid registration payload strictly adhering to Customer schema', async () => {
    const mockRegister = vi.fn().mockResolvedValue({
      id: 'uuid-999',
      full_name: 'Jane Doe',
      email: 'jane@example.com',
      is_active: true,
      is_verified: false,
      role: { id: 2, name: 'CUSTOMER', description: null },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    vi.spyOn(AuthHook, 'useAuth').mockReturnValue({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      register: mockRegister,
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    );

    const nameInput = screen.getByLabelText(/full name/i);
    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInputs = screen.getAllByLabelText(/password/i);
    const submitBtn = screen.getByRole('button', { name: /register account/i });

    fireEvent.change(nameInput, { target: { value: 'Jane Doe' } });
    fireEvent.change(emailInput, { target: { value: 'jane@example.com' } });
    fireEvent.change(passwordInputs[0], { target: { value: 'Strong#Password2026' } });
    fireEvent.change(passwordInputs[1], { target: { value: 'Strong#Password2026' } });

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith({
        full_name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'Strong#Password2026',
      });
    });
  });

  it('displays rate limiting (HTTP 429) lock notice on login', async () => {
    const mockLogin = vi.fn().mockRejectedValue({
      status: 429,
      retryAfter: 30,
      message: 'Too many attempts. Rate limit exceeded.',
    });

    vi.spyOn(AuthHook, 'useAuth').mockReturnValue({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      login: mockLogin,
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByPlaceholderText(/enter your account password/i);
    const submitBtn = screen.getByRole('button', { name: /sign in/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'Wrong#123' } });

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/security rate limiter active/i)).toBeInTheDocument();
      expect(screen.getByText(/Security Lockout Active/i)).toBeInTheDocument();
    });
  });
});
