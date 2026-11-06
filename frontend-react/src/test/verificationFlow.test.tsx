import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { VerificationFlow } from '../pages/customer/VerificationFlow';
import { kycService } from '../services/kycService';

vi.mock('../services/kycService', () => ({
  kycService: {
    uploadDocument: vi.fn(),
  },
}));

describe('VerificationFlow Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders document selection options for PAN and Aadhaar', () => {
    render(
      <MemoryRouter>
        <VerificationFlow />
      </MemoryRouter>
    );

    expect(screen.getByText('PAN Card')).toBeInTheDocument();
    expect(screen.getByText('Aadhaar Card')).toBeInTheDocument();
    expect(screen.getByText(/Click to upload or drag and drop your document/i)).toBeInTheDocument();
  });

  it('switches document type selection when clicked', () => {
    render(
      <MemoryRouter>
        <VerificationFlow />
      </MemoryRouter>
    );

    const aadhaarCard = screen.getByText('Aadhaar Card').closest('div');
    if (aadhaarCard) {
      fireEvent.click(aadhaarCard);
    }
    expect(screen.getByText('Unique Identification Card (12-digit sequence)')).toBeInTheDocument();
  });

  it('rejects files exceeding 5MB client-side', () => {
    render(
      <MemoryRouter>
        <VerificationFlow />
      </MemoryRouter>
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const oversizedFile = new File(['a'.repeat(6 * 1024 * 1024)], 'large.jpg', {
      type: 'image/jpeg',
    });

    Object.defineProperty(fileInput, 'files', {
      value: [oversizedFile],
    });
    fireEvent.change(fileInput);

    expect(screen.getByText(/exceeds the 5mb file size limit/i)).toBeInTheDocument();
  });

  it('rejects unsupported file MIME types client-side', () => {
    render(
      <MemoryRouter>
        <VerificationFlow />
      </MemoryRouter>
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const textFile = new File(['hello world'], 'doc.txt', {
      type: 'text/plain',
    });

    Object.defineProperty(fileInput, 'files', {
      value: [textFile],
    });
    fireEvent.change(fileInput);

    expect(screen.getByText(/only jpg and png document images are supported/i)).toBeInTheDocument();
  });

  it('submits valid image and displays structured OCR extraction results', async () => {
    const mockResult = {
      session_id: '12345678-1234-1234-1234-123456789abc',
      document_type: 'PAN' as const,
      status: 'APPROVED' as const,
      document_number_masked: 'ABCDE****F',
      extracted_name: 'ROHIT SHARMA',
      extracted_dob: '1987-04-30',
      extracted_gender: null,
      extracted_fields: {
        fathers_name: 'GURUNATH SHARMA',
      },
      is_format_valid: true,
      confidence_score: 0.94,
      validation_messages: [],
      created_at: new Date().toISOString(),
    };

    vi.mocked(kycService.uploadDocument).mockResolvedValueOnce(mockResult);

    // Mock URL.createObjectURL
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/dummy');
    global.URL.revokeObjectURL = vi.fn();

    render(
      <MemoryRouter>
        <VerificationFlow />
      </MemoryRouter>
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const validFile = new File(['image bytes'], 'pan.jpg', {
      type: 'image/jpeg',
    });

    Object.defineProperty(fileInput, 'files', {
      value: [validFile],
    });
    fireEvent.change(fileInput);

    expect(screen.getByText('pan.jpg')).toBeInTheDocument();

    const processBtn = screen.getByRole('button', { name: /process document ocr/i });
    fireEvent.click(processBtn);

    await waitFor(() => {
      expect(kycService.uploadDocument).toHaveBeenCalledWith('PAN', validFile, expect.any(Function));
      expect(screen.getByText('ABCDE****F')).toBeInTheDocument();
      expect(screen.getByText('ROHIT SHARMA')).toBeInTheDocument();
      expect(screen.getByText('1987-04-30')).toBeInTheDocument();
      expect(screen.getByText('APPROVED')).toBeInTheDocument();
      expect(screen.getByText('94%')).toBeInTheDocument();
    });

    // Test "Verify Another Document" button resets view
    const retryBtn = screen.getByRole('button', { name: /verify another document/i });
    fireEvent.click(retryBtn);

    expect(screen.getByText(/Click to upload or drag and drop your document/i)).toBeInTheDocument();
  });
});
