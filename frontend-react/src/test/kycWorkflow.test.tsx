import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { VerificationQueue } from '../pages/admin/VerificationQueue';
import { kycService, KycSessionItem } from '../services/kycService';

vi.mock('../services/kycService', () => ({
  kycService: {
    getAllSessionsAdmin: vi.fn(),
    getSessionById: vi.fn(),
    adminReviewSession: vi.fn(),
    submitForReview: vi.fn(),
    cancelSession: vi.fn(),
  },
}));

describe('KYC End-to-End Workflow & Administrator Review Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockSessions: KycSessionItem[] = [
    {
      id: 'session-uuid-1111',
      user_id: 'user-uuid-1',
      document_type: 'PAN',
      status: 'PENDING_REVIEW',
      workflow_status: 'PENDING_ADMIN_REVIEW',
      admin_review_status: 'PENDING',
      document_number_masked: 'ABCDE****F',
      extracted_name: 'John Doe',
      extracted_dob: '1990-01-01',
      extracted_gender: null,
      ocr_confidence: 0.95,
      failure_reason: null,
      face_match_score: 92.5,
      face_match_status: 'MATCH',
      face_verified: true,
      biometric_consent: true,
      audit_logs: [
        {
          id: 'log-1',
          action: 'DOCUMENT_OCR_PROCESSED',
          resource_type: 'kyc_session',
          timestamp: '2026-11-04T12:00:00Z',
        },
        {
          id: 'log-2',
          action: 'BIOMETRIC_FACE_VERIFICATION',
          resource_type: 'kyc_session',
          timestamp: '2026-11-04T12:05:00Z',
        },
        {
          id: 'log-3',
          action: 'KYC_SUBMITTED_FOR_REVIEW',
          resource_type: 'kyc_session',
          timestamp: '2026-11-04T12:06:00Z',
        },
      ],
      created_at: '2026-11-04T12:00:00Z',
      updated_at: '2026-11-04T12:06:00Z',
    },
    {
      id: 'session-uuid-2222',
      user_id: 'user-uuid-2',
      document_type: 'AADHAAR',
      status: 'APPROVED',
      workflow_status: 'APPROVED',
      admin_review_status: 'APPROVED',
      document_number_masked: 'XXXX-XXXX-9999',
      extracted_name: 'Jane Smith',
      extracted_dob: '1995-05-15',
      extracted_gender: 'FEMALE',
      ocr_confidence: 0.89,
      failure_reason: null,
      face_match_score: 88.0,
      face_match_status: 'MATCH',
      face_verified: true,
      biometric_consent: true,
      audit_logs: [],
      created_at: '2026-11-04T10:00:00Z',
      updated_at: '2026-11-04T10:15:00Z',
    },
  ];

  it('renders sessions in admin verification queue', async () => {
    vi.mocked(kycService.getAllSessionsAdmin).mockResolvedValueOnce(mockSessions);

    render(
      <MemoryRouter>
        <VerificationQueue />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('ABCDE****F')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('XXXX-XXXX-9999')).toBeInTheDocument();
    });
  });

  it('filters sessions by status when filter tab is clicked', async () => {
    vi.mocked(kycService.getAllSessionsAdmin).mockResolvedValue(mockSessions);

    render(
      <MemoryRouter>
        <VerificationQueue />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const pendingTab = screen.getByRole('button', { name: /pending review/i });
    fireEvent.click(pendingTab);

    await waitFor(() => {
      expect(kycService.getAllSessionsAdmin).toHaveBeenCalledWith('PENDING_ADMIN_REVIEW', '');
    });
  });

  it('opens review modal with dossier, face score, liveness notice, and audit trail', async () => {
    vi.mocked(kycService.getAllSessionsAdmin).mockResolvedValueOnce(mockSessions);
    vi.mocked(kycService.getSessionById).mockResolvedValueOnce(mockSessions[0]);

    render(
      <MemoryRouter>
        <VerificationQueue />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const reviewButtons = screen.getAllByRole('button', { name: /review application/i });
    fireEvent.click(reviewButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Compliance Application Review')).toBeInTheDocument();
      expect(screen.getAllByText('92.5%').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Liveness Disclaimer \(UNASSESSED\)/i)).toBeInTheDocument();
      expect(screen.getByText('DOCUMENT_OCR_PROCESSED')).toBeInTheDocument();
      expect(screen.getByText('BIOMETRIC_FACE_VERIFICATION')).toBeInTheDocument();
      expect(screen.getByText('KYC_SUBMITTED_FOR_REVIEW')).toBeInTheDocument();
    });
  });

  it('approves session upon administrator confirmation', async () => {
    vi.mocked(kycService.getAllSessionsAdmin).mockResolvedValue(mockSessions);
    vi.mocked(kycService.getSessionById).mockResolvedValueOnce(mockSessions[0]);

    const approvedSession: KycSessionItem = {
      ...mockSessions[0],
      workflow_status: 'APPROVED',
      admin_review_status: 'APPROVED',
      status: 'APPROVED',
    };
    vi.mocked(kycService.adminReviewSession).mockResolvedValueOnce(approvedSession);

    render(
      <MemoryRouter>
        <VerificationQueue />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const reviewButtons = screen.getAllByRole('button', { name: /review application/i });
    fireEvent.click(reviewButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /approve application/i })).toBeInTheDocument();
    });

    const approveBtn = screen.getByRole('button', { name: /approve application/i });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(kycService.adminReviewSession).toHaveBeenCalledWith(
        'session-uuid-1111',
        'APPROVED',
        undefined
      );
      expect(screen.getByText(/successfully approved/i)).toBeInTheDocument();
    });
  });

  it('rejecting without reason displays mandatory error alert', async () => {
    vi.mocked(kycService.getAllSessionsAdmin).mockResolvedValueOnce(mockSessions);
    vi.mocked(kycService.getSessionById).mockResolvedValueOnce(mockSessions[0]);

    render(
      <MemoryRouter>
        <VerificationQueue />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const reviewButtons = screen.getAllByRole('button', { name: /review application/i });
    fireEvent.click(reviewButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reject application/i })).toBeInTheDocument();
    });

    const rejectBtn = screen.getByRole('button', { name: /reject application/i });
    fireEvent.click(rejectBtn);

    expect(screen.getByText(/explanation reason is strictly mandatory/i)).toBeInTheDocument();
    expect(kycService.adminReviewSession).not.toHaveBeenCalled();
  });

  it('rejects session when valid reason is provided', async () => {
    vi.mocked(kycService.getAllSessionsAdmin).mockResolvedValue(mockSessions);
    vi.mocked(kycService.getSessionById).mockResolvedValueOnce(mockSessions[0]);

    const rejectedSession: KycSessionItem = {
      ...mockSessions[0],
      workflow_status: 'REJECTED',
      admin_review_status: 'REJECTED',
      rejection_reason: 'Card photo has severe glare and cardholder name does not match.',
    };
    vi.mocked(kycService.adminReviewSession).mockResolvedValueOnce(rejectedSession);

    render(
      <MemoryRouter>
        <VerificationQueue />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const reviewButtons = screen.getAllByRole('button', { name: /review application/i });
    fireEvent.click(reviewButtons[0]);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/document photo is obscured/i)).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/document photo is obscured/i);
    fireEvent.change(textarea, {
      target: { value: 'Card photo has severe glare and cardholder name does not match.' },
    });

    const rejectBtn = screen.getByRole('button', { name: /reject application/i });
    fireEvent.click(rejectBtn);

    await waitFor(() => {
      expect(kycService.adminReviewSession).toHaveBeenCalledWith(
        'session-uuid-1111',
        'REJECTED',
        'Card photo has severe glare and cardholder name does not match.'
      );
      expect(screen.getByText(/successfully rejected/i)).toBeInTheDocument();
    });
  });
});
