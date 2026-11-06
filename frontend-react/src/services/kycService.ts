import { AxiosProgressEvent } from 'axios';
import { api } from './api';

export interface DocumentOcrResult {
  session_id: string;
  document_type: 'PAN' | 'AADHAAR';
  status: 'APPROVED' | 'PENDING_REVIEW' | 'REJECTED' | 'FAILED';
  document_number_masked: string | null;
  extracted_name: string | null;
  extracted_dob: string | null;
  extracted_gender: string | null;
  extracted_fields: {
    document_type?: string;
    document_number_masked?: string | null;
    name?: string | null;
    dob?: string | null;
    gender?: string | null;
    fathers_name?: string | null;
    [key: string]: unknown;
  };
  is_format_valid: boolean;
  confidence_score: number;
  validation_messages: string[];
  created_at: string;
}

export interface AuditLogItem {
  id: string;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  timestamp: string;
}

export interface AdminAnalytics {
  total_customers: number;
  total_applications: number;
  approved_applications: number;
  rejected_applications: number;
  cancelled_applications: number;
  pending_review_applications: number;
  face_matches: number;
  face_mismatches: number;
  submitted_today: number;
  submitted_this_week: number;
}

export interface PaginatedSessionsResponse {
  items: KycSessionItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface KycSessionItem {
  id: string;
  user_id: string;
  customer_name?: string | null;
  customer_email?: string | null;
  admin_reviewer_name?: string | null;
  document_type: 'PAN' | 'AADHAAR';
  status: string;
  workflow_status?: string | null;
  admin_review_status?: string | null;
  admin_reviewed_by?: string | null;
  admin_reviewed_at?: string | null;
  rejection_reason?: string | null;
  document_number_masked: string | null;
  extracted_name: string | null;
  extracted_dob: string | null;
  extracted_gender: string | null;
  ocr_confidence: number | null;
  failure_reason: string | null;
  face_match_score?: number | null;
  face_match_status?: string | null;
  face_verified?: boolean;
  biometric_consent?: boolean;
  audit_logs?: AuditLogItem[];
  created_at: string;
  updated_at: string;
}

export interface FaceVerificationResult {
  session_id: string;
  status: string;
  face_detected_document: boolean;
  face_detected_selfie: boolean;
  similarity_score: number | null;
  distance: number | null;
  threshold: number;
  is_match: boolean;
  liveness_status: string;
  validation_messages: string[];
  timestamp: string;
}

export const kycService = {
  /**
   * Upload document image for local OpenCV preprocessing and EasyOCR text extraction.
   */
  async uploadDocument(
    documentType: 'PAN' | 'AADHAAR',
    file: File,
    onUploadProgress?: (progressEvent: AxiosProgressEvent) => void
  ): Promise<DocumentOcrResult> {
    const formData = new FormData();
    formData.append('document_type', documentType);
    formData.append('file', file);

    const response = await api.post<DocumentOcrResult>(
      '/api/v1/kyc/document/upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress,
      }
    );
    return response.data;
  },

  /**
   * Verify applicant selfie against identity document portrait using local FaceNet.
   */
  async verifyFace(
    sessionId: string,
    selfieFile: Blob | File,
    consent: boolean
  ): Promise<FaceVerificationResult> {
    const formData = new FormData();
    formData.append('selfie', selfieFile, 'selfie.jpg');
    formData.append('consent', String(consent));

    const response = await api.post<FaceVerificationResult>(
      `/api/v1/kyc/sessions/${sessionId}/verify-face`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  /**
   * Submit an in-progress or completed verification session for Administrator Review.
   */
  async submitForReview(sessionId: string): Promise<KycSessionItem> {
    const response = await api.post<KycSessionItem>(
      `/api/v1/kyc/sessions/${sessionId}/submit`
    );
    return response.data;
  },

  /**
   * Cancel an active KYC session.
   */
  async cancelSession(sessionId: string, reason?: string): Promise<KycSessionItem> {
    const response = await api.post<KycSessionItem>(
      `/api/v1/kyc/sessions/${sessionId}/cancel`,
      { reason: reason || 'Cancelled by applicant' }
    );
    return response.data;
  },

  /**
   * Admin-only: Execute review decision (APPROVED or REJECTED with mandatory reason).
   */
  async adminReviewSession(
    sessionId: string,
    decision: 'APPROVED' | 'REJECTED',
    reason?: string
  ): Promise<KycSessionItem> {
    const response = await api.post<KycSessionItem>(
      `/api/v1/kyc/admin/sessions/${sessionId}/review`,
      { decision, reason: reason || null }
    );
    return response.data;
  },

  /**
   * Fetch verification sessions for the currently authenticated customer.
   */
  async getMySessions(): Promise<KycSessionItem[]> {
    const response = await api.get<KycSessionItem[]>('/api/v1/kyc/sessions/me');
    return response.data;
  },

  /**
   * Retrieve a specific KYC session by UUID with its complete audit trail.
   */
  async getSessionById(sessionId: string): Promise<KycSessionItem> {
    const response = await api.get<KycSessionItem>(`/api/v1/kyc/sessions/${sessionId}`);
    return response.data;
  },

  /**
   * Admin-only: Fetch all verification sessions across the platform with optional filters.
   */
  async getAllSessionsAdmin(statusFilter?: string, search?: string): Promise<KycSessionItem[]> {
    const params: Record<string, string> = {};
    if (statusFilter && statusFilter !== 'ALL') {
      params.status_filter = statusFilter;
    }
    if (search && search.trim()) {
      params.search = search.trim();
    }
    const response = await api.get<KycSessionItem[]>('/api/v1/kyc/admin/sessions', {
      params,
    });
    return response.data;
  },

  /**
   * Admin-only: Fetch real-time aggregate analytics from PostgreSQL.
   */
  async getAdminAnalytics(): Promise<AdminAnalytics> {
    const response = await api.get<AdminAnalytics>('/api/v1/kyc/admin/analytics');
    return response.data;
  },

  /**
   * Admin-only: Fetch paginated verification sessions with sorting and date range filters.
   */
  async getAllSessionsAdminPaginated(params: {
    page?: number;
    pageSize?: number;
    statusFilter?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedSessionsResponse> {
    const queryParams: Record<string, string | number> = {
      page: params.page ?? 1,
      page_size: params.pageSize ?? 10,
    };
    if (params.statusFilter && params.statusFilter !== 'ALL') {
      queryParams.status_filter = params.statusFilter;
    }
    if (params.dateFrom && params.dateFrom.trim()) {
      queryParams.date_from = params.dateFrom.trim();
    }
    if (params.dateTo && params.dateTo.trim()) {
      queryParams.date_to = params.dateTo.trim();
    }
    if (params.search && params.search.trim()) {
      queryParams.search = params.search.trim();
    }
    if (params.sortBy) {
      queryParams.sort_by = params.sortBy;
    }
    if (params.sortOrder) {
      queryParams.sort_order = params.sortOrder;
    }

    const response = await api.get<PaginatedSessionsResponse>('/api/v1/kyc/admin/sessions', {
      params: queryParams,
    });
    return response.data;
  },

  /**
   * Admin-only: Stream and export verification reports as CSV with formula-injection sanitization.
   */
  async exportReportsCsv(params?: {
    statusFilter?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<Blob> {
    const queryParams: Record<string, string> = {};
    if (params?.statusFilter && params.statusFilter !== 'ALL') {
      queryParams.status_filter = params.statusFilter;
    }
    if (params?.dateFrom && params.dateFrom.trim()) {
      queryParams.date_from = params.dateFrom.trim();
    }
    if (params?.dateTo && params.dateTo.trim()) {
      queryParams.date_to = params.dateTo.trim();
    }

    const response = await api.get('/api/v1/kyc/admin/reports/export/csv', {
      params: queryParams,
      responseType: 'blob',
    });
    return response.data;
  },

  /**
   * Admin-only: Stream and export verification reports as Excel (.xlsx) with styled workbooks.
   */
  async exportReportsExcel(params?: {
    statusFilter?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<Blob> {
    const queryParams: Record<string, string> = {};
    if (params?.statusFilter && params.statusFilter !== 'ALL') {
      queryParams.status_filter = params.statusFilter;
    }
    if (params?.dateFrom && params.dateFrom.trim()) {
      queryParams.date_from = params.dateFrom.trim();
    }
    if (params?.dateTo && params.dateTo.trim()) {
      queryParams.date_to = params.dateTo.trim();
    }

    const response = await api.get('/api/v1/kyc/admin/reports/export/excel', {
      params: queryParams,
      responseType: 'blob',
    });
    return response.data;
  },

  /**
   * Helper utility to trigger client-side download of a binary or text Blob.
   */
  downloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};
