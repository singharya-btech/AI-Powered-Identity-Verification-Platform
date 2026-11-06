import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminDashboard } from '../pages/admin/AdminDashboard';
import { VerificationQueue } from '../pages/admin/VerificationQueue';
import { kycService, AdminAnalytics, PaginatedSessionsResponse, KycSessionItem } from '../services/kycService';
import { authService } from '../services/authService';
import { UserProfile } from '../services/api';

vi.mock('../services/kycService', () => ({
  kycService: {
    getAdminAnalytics: vi.fn(),
    getAllSessionsAdminPaginated: vi.fn(),
    getAllSessionsAdmin: vi.fn(),
    getSessionById: vi.fn(),
    adminReviewSession: vi.fn(),
    exportReportsCsv: vi.fn(),
    exportReportsExcel: vi.fn(),
    downloadBlob: vi.fn(),
  },
}));

vi.mock('../services/authService', () => ({
  authService: {
    getAdminUsers: vi.fn(),
  },
}));

describe('Task 07: Admin Dashboard Analytics & Hardened Compliance Review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockUsers: UserProfile[] = [
    {
      id: 'admin-id-1',
      email: 'admin@ekyc.local',
      full_name: 'Compliance Officer',
      role: { id: 1, name: 'ADMIN', description: 'Admin' },
      is_active: true,
      is_verified: true,
      created_at: '2026-11-04T00:00:00Z',
      updated_at: '2026-11-04T00:00:00Z',
    },
    {
      id: 'cust-id-1',
      email: 'customer1@test.local',
      full_name: 'Jane Doe',
      role: { id: 2, name: 'CUSTOMER', description: 'Customer' },
      is_active: true,
      is_verified: false,
      created_at: '2026-11-04T01:00:00Z',
      updated_at: '2026-11-04T01:00:00Z',
    },
  ];

  const mockAnalytics: AdminAnalytics = {
    total_customers: 24,
    total_applications: 30,
    approved_applications: 18,
    rejected_applications: 4,
    cancelled_applications: 2,
    pending_review_applications: 6,
    face_matches: 20,
    face_mismatches: 2,
    submitted_today: 5,
    submitted_this_week: 14,
  };

  const mockKycItems: KycSessionItem[] = [
    {
      id: 'session-7777-aaaa',
      user_id: 'cust-id-1',
      customer_name: 'Jane Doe',
      customer_email: 'customer1@test.local',
      document_type: 'PAN',
      status: 'PENDING_REVIEW',
      workflow_status: 'PENDING_ADMIN_REVIEW',
      admin_review_status: 'PENDING',
      document_number_masked: 'ABCDE****G',
      extracted_name: 'Jane Doe',
      extracted_dob: '1992-05-15',
      extracted_gender: 'Female',
      ocr_confidence: 0.94,
      failure_reason: null,
      face_match_score: 91.0,
      face_match_status: 'MATCH',
      face_verified: true,
      biometric_consent: true,
      audit_logs: [
        {
          id: 'log-101',
          action: 'APPLICATION_CREATED',
          resource_type: 'kyc_session',
          timestamp: '2026-11-04T10:00:00Z',
        },
        {
          id: 'log-102',
          action: 'BIOMETRIC_FACE_VERIFICATION',
          resource_type: 'kyc_session',
          timestamp: '2026-11-04T10:05:00Z',
        },
      ],
      created_at: '2026-11-04T10:00:00Z',
      updated_at: '2026-11-04T10:05:00Z',
    },
  ];

  const mockPaginatedResponse: PaginatedSessionsResponse = {
    items: mockKycItems,
    total: 1,
    page: 1,
    page_size: 10,
    total_pages: 1,
  };

  it('renders AdminDashboard with real PostgreSQL analytics and distribution', async () => {
    vi.mocked(authService.getAdminUsers).mockResolvedValue(mockUsers);
    vi.mocked(kycService.getAdminAnalytics).mockResolvedValue(mockAnalytics);

    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    // Verify analytics cards are populated with PostgreSQL figures
    await waitFor(() => {
      expect(screen.getByText('24')).toBeInTheDocument(); // total_customers
      expect(screen.getByText('30')).toBeInTheDocument(); // total_applications
      expect(screen.getAllByText('6').length).toBeGreaterThanOrEqual(1);  // pending_review_applications
      expect(screen.getAllByText('18').length).toBeGreaterThanOrEqual(1); // approved_applications
      expect(screen.getAllByText('4').length).toBeGreaterThanOrEqual(1);  // rejected_applications
      expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);  // cancelled_applications
    });

    // Check FaceNet telemetry
    expect(screen.getByText('20 / 22')).toBeInTheDocument(); // face_matches / total comparisons
    expect(screen.getByText('5')).toBeInTheDocument(); // submitted_today
    expect(screen.getAllByText(/14 this week/i).length).toBeGreaterThanOrEqual(1);
  });

  it('triggers CSV and Excel export from AdminDashboard', async () => {
    vi.mocked(authService.getAdminUsers).mockResolvedValue(mockUsers);
    vi.mocked(kycService.getAdminAnalytics).mockResolvedValue(mockAnalytics);
    const mockBlob = new Blob(['sample-data'], { type: 'text/csv' });
    vi.mocked(kycService.exportReportsCsv).mockResolvedValue(mockBlob);
    vi.mocked(kycService.exportReportsExcel).mockResolvedValue(mockBlob);

    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Administrator Compliance Console')).toBeInTheDocument();
    });

    // Click Export CSV
    const csvBtn = screen.getAllByRole('button', { name: /export csv/i })[0];
    fireEvent.click(csvBtn);

    await waitFor(() => {
      expect(kycService.exportReportsCsv).toHaveBeenCalled();
      expect(kycService.downloadBlob).toHaveBeenCalled();
    });

    // Click Export Excel
    const excelBtn = screen.getAllByRole('button', { name: /export excel/i })[0];
    fireEvent.click(excelBtn);

    await waitFor(() => {
      expect(kycService.exportReportsExcel).toHaveBeenCalled();
    });
  });

  it('VerificationQueue supports server-side pagination, search, and date filters', async () => {
    vi.mocked(kycService.getAllSessionsAdminPaginated).mockResolvedValue(mockPaginatedResponse);

    render(
      <MemoryRouter>
        <VerificationQueue />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(kycService.getAllSessionsAdminPaginated).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          pageSize: 10,
          statusFilter: 'ALL',
        })
      );
      expect(screen.getByText('ABCDE****G')).toBeInTheDocument();
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });

    // Enter search query and submit
    const searchInput = screen.getByPlaceholderText(/search name, masked id/i);
    fireEvent.change(searchInput, { target: { value: 'Jane' } });

    const applyButton = screen.getByRole('button', { name: /apply/i });
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(kycService.getAllSessionsAdminPaginated).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'Jane',
        })
      );
    });
  });

  it('VerificationQueue triggers export with current filter parameters', async () => {
    vi.mocked(kycService.getAllSessionsAdminPaginated).mockResolvedValue(mockPaginatedResponse);
    const mockBlob = new Blob(['csv content'], { type: 'text/csv' });
    vi.mocked(kycService.exportReportsCsv).mockResolvedValue(mockBlob);

    render(
      <MemoryRouter>
        <VerificationQueue />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('ABCDE****G')).toBeInTheDocument();
    });

    const exportCsvBtn = screen.getByRole('button', { name: /export csv/i });
    fireEvent.click(exportCsvBtn);

    await waitFor(() => {
      expect(kycService.exportReportsCsv).toHaveBeenCalledWith(
        expect.objectContaining({
          statusFilter: undefined,
        })
      );
      expect(kycService.downloadBlob).toHaveBeenCalled();
    });
  });

  it('Review modal shows dossier, liveness disclaimer (UNASSESSED), and enforces valid rejection reason', async () => {
    vi.mocked(kycService.getAllSessionsAdminPaginated).mockResolvedValue(mockPaginatedResponse);
    vi.mocked(kycService.getSessionById).mockResolvedValue(mockKycItems[0]);

    render(
      <MemoryRouter>
        <VerificationQueue />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });

    // Open Review Application modal
    const reviewButtons = screen.getAllByRole('button', { name: /review application/i });
    fireEvent.click(reviewButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Compliance Application Review')).toBeInTheDocument();
      expect(screen.getByText(/Liveness Disclaimer \(UNASSESSED\)/i)).toBeInTheDocument();
      expect(screen.getByText(/does not perform active physical 3d anti-spoofing/i)).toBeInTheDocument();
      expect(screen.getAllByText(/customer1@test\.local/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/91% \(Threshold: 60% \/ 0\.40 distance\)/i)).toBeInTheDocument();
      expect(screen.getByText('APPLICATION_CREATED')).toBeInTheDocument();
    });

    // Attempt rejection without explanation reason
    const rejectBtn = screen.getByRole('button', { name: /reject application/i });
    fireEvent.click(rejectBtn);

    await waitFor(() => {
      expect(screen.getByText(/explanation reason is strictly mandatory/i)).toBeInTheDocument();
      expect(kycService.adminReviewSession).not.toHaveBeenCalled();
    });
  });
});
