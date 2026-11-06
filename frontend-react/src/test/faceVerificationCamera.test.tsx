import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FaceVerificationCamera } from '../components/kyc/FaceVerificationCamera';
import { kycService, FaceVerificationResult } from '../services/kycService';

describe('FaceVerificationCamera Component', () => {
  const dummySessionId = '11111111-2222-3333-4444-555555555555';

  beforeEach(() => {
    vi.restoreAllMocks();

    // Mock HTMLMediaElement.prototype.play
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);

    // Mock HTMLCanvasElement.prototype.getContext
    window.HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      drawImage: vi.fn(),
    });

    // Mock HTMLCanvasElement.prototype.toBlob
    window.HTMLCanvasElement.prototype.toBlob = vi.fn((callback: (b: Blob | null) => void) => {
      callback(new Blob(['fake-image-data'], { type: 'image/jpeg' }));
    });

    // Mock URL.createObjectURL and revokeObjectURL
    window.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/dummy-selfie-url');
    window.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders biometric consent explanation and requires checkbox selection', () => {
    render(<FaceVerificationCamera sessionId={dummySessionId} />);

    expect(screen.getByText(/Biometric Facial Verification Consent/i)).toBeInTheDocument();
    expect(
      screen.getByText(/I hereby grant consent to capture and process my selfie solely for identity matching/i)
    ).toBeInTheDocument();

    const consentCheckbox = screen.getByRole('checkbox');
    expect(consentCheckbox).not.toBeChecked();

    // Start Webcam button is disabled until consent is granted
    const startCamBtn = screen.getByRole('button', { name: /start webcam/i });
    expect(startCamBtn).toBeDisabled();
  });

  it('displays user-friendly error when camera permissions are denied', async () => {
    // Mock getUserMedia rejecting with NotAllowedError
    const mockGetUserMedia = vi.fn().mockRejectedValue({
      name: 'NotAllowedError',
      message: 'Permission denied',
    });

    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: mockGetUserMedia },
      writable: true,
      configurable: true,
    });

    render(<FaceVerificationCamera sessionId={dummySessionId} />);

    // Grant consent which triggers camera start
    const consentCheckbox = screen.getByRole('checkbox');
    fireEvent.click(consentCheckbox);

    await waitFor(() => {
      expect(screen.getByText(/Camera permission was denied/i)).toBeInTheDocument();
    });
  });

  it('captures selfie photo, renders retake and verify buttons, and submits verification', async () => {
    const mockStop = vi.fn();
    const mockStream = {
      getTracks: () => [{ stop: mockStop }],
    } as unknown as MediaStream;

    const mockGetUserMedia = vi.fn().mockResolvedValue(mockStream);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: mockGetUserMedia },
      writable: true,
      configurable: true,
    });

    const mockVerificationResult: FaceVerificationResult = {
      session_id: dummySessionId,
      status: 'APPROVED',
      face_detected_document: true,
      face_detected_selfie: true,
      similarity_score: 91.5,
      distance: 0.09,
      threshold: 0.40,
      is_match: true,
      liveness_status: 'UNASSESSED',
      validation_messages: [
        'Single human face identified.',
        'Facial similarity verified successfully.',
        'Liveness anti-spoofing not assessed: standard camera capture does not detect physical prints or screen replay.',
      ],
      timestamp: new Date().toISOString(),
    };

    vi.spyOn(kycService, 'verifyFace').mockResolvedValue(mockVerificationResult);
    const onComplete = vi.fn();

    render(
      <FaceVerificationCamera
        sessionId={dummySessionId}
        onVerificationComplete={onComplete}
      />
    );

    // Grant consent
    const consentCheckbox = screen.getByRole('checkbox');
    fireEvent.click(consentCheckbox);

    // Wait for Capture Photo button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /capture photo/i })).toBeInTheDocument();
    });

    // Capture photo
    const captureBtn = screen.getByRole('button', { name: /capture photo/i });
    fireEvent.click(captureBtn);

    // Verify retake and verify buttons appear
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retake photo/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /verify face match/i })).toBeInTheDocument();
    });

    // Click Verify Face Match
    const verifyBtn = screen.getByRole('button', { name: /verify face match/i });
    fireEvent.click(verifyBtn);

    // Assert verdict rendered
    await waitFor(() => {
      expect(screen.getByText(/Facial Identity Verified/i)).toBeInTheDocument();
      expect(screen.getByText(/91.5%/i)).toBeInTheDocument();
      expect(screen.getByText(/UNASSESSED/i)).toBeInTheDocument();
    });

    expect(onComplete).toHaveBeenCalledWith(mockVerificationResult);
  });

  it('renders mismatch verdict and try again button when similarity is below threshold', async () => {
    const mockStop = vi.fn();
    const mockStream = {
      getTracks: () => [{ stop: mockStop }],
    } as unknown as MediaStream;

    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
      writable: true,
      configurable: true,
    });

    const mockMismatchResult: FaceVerificationResult = {
      session_id: dummySessionId,
      status: 'REJECTED',
      face_detected_document: true,
      face_detected_selfie: true,
      similarity_score: 32.0,
      distance: 0.68,
      threshold: 0.40,
      is_match: false,
      liveness_status: 'UNASSESSED',
      validation_messages: ['Face mismatch: similarity score is below required threshold.'],
      timestamp: new Date().toISOString(),
    };

    vi.spyOn(kycService, 'verifyFace').mockResolvedValue(mockMismatchResult);

    render(<FaceVerificationCamera sessionId={dummySessionId} />);

    fireEvent.click(screen.getByRole('checkbox'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /capture photo/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /capture photo/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /verify face match/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /verify face match/i }));

    await waitFor(() => {
      expect(screen.getByText(/Facial Verification Mismatch/i)).toBeInTheDocument();
      expect(screen.getByText(/32%/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /try again with another selfie/i })).toBeInTheDocument();
    });
  });
});
