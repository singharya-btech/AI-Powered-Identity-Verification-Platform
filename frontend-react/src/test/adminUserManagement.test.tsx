import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserManagement } from '../pages/admin/UserManagement';
import { authService } from '../services/authService';

vi.mock('../services/authService', () => ({
  authService: {
    getAdminUsers: vi.fn(),
  },
}));

describe('Admin UserManagement Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders users fetched from live backend endpoint', async () => {
    const mockUsers = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        full_name: 'Administrator Alice',
        email: 'alice@admin.local',
        is_active: true,
        is_verified: true,
        role: { id: 1, name: 'ADMIN' as const, description: 'Admin' },
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        full_name: 'Customer Bob',
        email: 'bob@customer.com',
        is_active: true,
        is_verified: false,
        role: { id: 2, name: 'CUSTOMER' as const, description: 'Customer' },
        created_at: '2026-01-02T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      },
    ];

    vi.mocked(authService.getAdminUsers).mockResolvedValueOnce(mockUsers);

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Administrator Alice')).toBeInTheDocument();
      expect(screen.getByText('alice@admin.local')).toBeInTheDocument();
      expect(screen.getByText('Customer Bob')).toBeInTheDocument();
      expect(screen.getByText('bob@customer.com')).toBeInTheDocument();
    });

    // Test search filter
    const searchInput = screen.getByPlaceholderText(/search by full name, email, or role/i);
    fireEvent.change(searchInput, { target: { value: 'Alice' } });

    expect(screen.getByText('Administrator Alice')).toBeInTheDocument();
    expect(screen.queryByText('Customer Bob')).not.toBeInTheDocument();
  });

  it('displays empty state when zero users match search query', async () => {
    vi.mocked(authService.getAdminUsers).mockResolvedValueOnce([
      {
        id: '11111111-1111-1111-1111-111111111111',
        full_name: 'Administrator Alice',
        email: 'alice@admin.local',
        is_active: true,
        is_verified: true,
        role: { id: 1, name: 'ADMIN' as const, description: 'Admin' },
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Administrator Alice')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search by full name, email, or role/i);
    fireEvent.change(searchInput, { target: { value: 'NonexistentName' } });

    expect(screen.getByText('No users found')).toBeInTheDocument();
    expect(screen.getByText(/no user records matched your search query criteria/i)).toBeInTheDocument();
  });
});
