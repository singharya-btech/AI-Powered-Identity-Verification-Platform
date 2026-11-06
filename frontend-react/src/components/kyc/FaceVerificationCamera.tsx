import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Info,
  Sparkles,
  CameraOff,
} from 'lucide-react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Alert } from '../common/Alert';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { kycService, FaceVerificationResult } from '../../services/kycService';
import { ApiErrorMessage } from '../../services/api';

interface FaceVerificationCameraProps {
  sessionId: string;
  onVerificationComplete?: (result: FaceVerificationResult) => void;
  onRetakeRequested?: () => void;
}

export const FaceVerificationCamera: React.FC<FaceVerificationCameraProps> = ({
  sessionId,
  onVerificationComplete,
  onRetakeRequested,
}) => {
  const [consentGiven, setConsentGiven] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);

  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verificationResult, setVerificationResult] = useState<FaceVerificationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Stop camera tracks cleanly
  const stopCameraStream = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
  }, []);

  // Clean up stream on unmount
  useEffect(() => {
    return () => {
      stopCameraStream();
      if (capturedPreviewUrl) {
        URL.revokeObjectURL(capturedPreviewUrl);
      }
    };
  }, [stopCameraStream, capturedPreviewUrl]);

  // Start webcam stream
  const startCamera = async () => {
    setCameraError(null);
    setErrorMessage(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera access is not supported by your browser environment.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsStreaming(true);
    } catch (err) {
      const error = err as Error;
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setCameraError('Camera permission was denied. Please allow camera permissions in your browser to proceed.');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setCameraError('No webcam or video capture device was detected on your device.');
      } else {
        setCameraError(`Unable to start camera stream: ${error.message || 'Unknown error'}`);
      }
      setIsStreaming(false);
    }
  };

  // Capture current video frame into a Blob
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setErrorMessage('Failed to capture snapshot from webcam.');
          return;
        }
        if (capturedPreviewUrl) {
          URL.revokeObjectURL(capturedPreviewUrl);
        }
        const previewUrl = URL.createObjectURL(blob);
        setCapturedBlob(blob);
        setCapturedPreviewUrl(previewUrl);
        stopCameraStream();
      },
      'image/jpeg',
      0.92
    );
  };

  // Retake photo
  const handleRetake = () => {
    if (capturedPreviewUrl) {
      URL.revokeObjectURL(capturedPreviewUrl);
      setCapturedPreviewUrl(null);
    }
    setCapturedBlob(null);
    setVerificationResult(null);
    setErrorMessage(null);
    if (onRetakeRequested) {
      onRetakeRequested();
    }
    startCamera();
  };

  // Submit captured selfie for verification
  const handleSubmitSelfie = async () => {
    if (!capturedBlob) {
      setErrorMessage('Please capture a live selfie photograph first.');
      return;
    }
    if (!consentGiven) {
      setErrorMessage('You must grant explicit biometric consent to proceed with verification.');
      return;
    }

    setIsVerifying(true);
    setErrorMessage(null);

    try {
      const result = await kycService.verifyFace(sessionId, capturedBlob, consentGiven);
      setVerificationResult(result);
      if (onVerificationComplete) {
        onVerificationComplete(result);
      }
    } catch (err) {
      const error = err as ApiErrorMessage;
      setErrorMessage(error.message || 'Face verification service encountered an error.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Biometric Consent Box */}
      <Card className="bg-slate-50 border border-slate-200">
        <div className="flex items-start space-x-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-2 flex-1 text-xs text-slate-600">
            <h3 className="text-sm font-bold text-slate-900">Biometric Facial Verification Consent</h3>
            <p className="leading-relaxed">
              To complete your identity verification, we will compare a live webcam selfie against the portrait
              photograph on your identity document using local AI facial recognition (FaceNet).
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-500 pl-1">
              <li>Processing runs completely locally without external cloud biometric transfer.</li>
              <li>Zero raw facial images or biometric embeddings are stored permanently in the database.</li>
              <li>Temporary face comparison files are immediately erased upon completion.</li>
            </ul>

            <label className="flex items-center space-x-2.5 pt-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={consentGiven}
                onChange={(e) => {
                  setConsentGiven(e.target.checked);
                  if (e.target.checked && !isStreaming && !capturedBlob) {
                    startCamera();
                  }
                }}
                disabled={isVerifying || !!verificationResult}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 transition"
              />
              <span className="text-xs font-semibold text-slate-800">
                I hereby grant consent to capture and process my selfie solely for identity matching.
              </span>
            </label>
          </div>
        </div>
      </Card>

      {/* Camera / Verification Error Alerts */}
      {cameraError && (
        <Alert
          type="error"
          title="Camera Access Error"
          message={cameraError}
          onClose={() => setCameraError(null)}
        />
      )}

      {errorMessage && (
        <Alert
          type="error"
          title="Verification Notice"
          message={errorMessage}
          onClose={() => setErrorMessage(null)}
        />
      )}

      {/* Main Verification Card */}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">Live Webcam Selfie Capture</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ensure good lighting, look directly into the camera, and keep your face inside the frame
              </p>
            </div>
            {isStreaming && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse mr-1.5" />
                Live Camera
              </span>
            )}
          </div>

          {/* Viewport: Video Preview OR Captured Image OR Placeholder */}
          <div className="relative mx-auto w-full max-w-md aspect-[4/3] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center">
            {/* Live Video Stream */}
            <video
              ref={videoRef}
              playsInline
              muted
              className={`w-full h-full object-cover transform scale-x-[-1] ${
                isStreaming && !capturedPreviewUrl ? 'block' : 'hidden'
              }`}
            />

            {/* Hidden canvas used for rasterization */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Oval Face Guide Overlay during live streaming */}
            {isStreaming && !capturedPreviewUrl && (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                <div className="w-48 h-64 border-2 border-dashed border-white/60 rounded-[50%] shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                <span className="mt-3 px-3 py-1 rounded-full bg-black/60 text-white/90 text-xs font-medium tracking-wide">
                  Position your face in the oval
                </span>
              </div>
            )}

            {/* Captured Preview Image */}
            {capturedPreviewUrl && (
              <div className="relative w-full h-full">
                <img
                  src={capturedPreviewUrl}
                  alt="Captured Selfie"
                  className="w-full h-full object-cover transform scale-x-[-1]"
                />
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/60 text-white text-xs font-medium flex items-center">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                  Selfie Snapshot Captured
                </div>
              </div>
            )}

            {/* Placeholder when camera not active and no photo taken */}
            {!isStreaming && !capturedPreviewUrl && (
              <div className="text-center p-6 space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 mx-auto flex items-center justify-center">
                  <CameraOff className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-200">Camera is Inactive</p>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto">
                    Check the consent agreement above, then click start camera to begin live facial capture
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={startCamera}
                  disabled={!consentGiven}
                  leftIcon={<Camera className="w-4 h-4" />}
                >
                  Start Webcam
                </Button>
              </div>
            )}
          </div>

          {/* Camera Controls */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {isStreaming && !capturedPreviewUrl && (
              <Button
                variant="primary"
                size="md"
                onClick={capturePhoto}
                leftIcon={<Camera className="w-4 h-4" />}
              >
                Capture Photo
              </Button>
            )}

            {capturedPreviewUrl && !verificationResult && (
              <>
                <Button
                  variant="outline"
                  size="md"
                  onClick={handleRetake}
                  disabled={isVerifying}
                  leftIcon={<RefreshCw className="w-4 h-4" />}
                >
                  Retake Photo
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleSubmitSelfie}
                  isLoading={isVerifying}
                  leftIcon={<Sparkles className="w-4 h-4" />}
                >
                  Verify Face Match
                </Button>
              </>
            )}
          </div>

          {/* Processing Spinner */}
          {isVerifying && (
            <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 flex items-center justify-center space-x-3 text-xs text-blue-900">
              <LoadingSpinner size="sm" className="text-blue-600" />
              <span>Analyzing FaceNet 128D embeddings and computing cosine similarity locally...</span>
            </div>
          )}

          {/* Verification Verdict Display */}
          {verificationResult && (
            <div className="mt-6 pt-6 border-t border-slate-100 space-y-4">
              <div
                className={`p-5 rounded-xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${
                  verificationResult.is_match
                    ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                    : 'bg-red-50/80 border-red-200 text-red-950'
                }`}
              >
                <div className="flex items-start space-x-3.5">
                  {verificationResult.is_match ? (
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0">
                      <ShieldAlert className="w-6 h-6" />
                    </div>
                  )}

                  <div className="space-y-0.5">
                    <h3 className="text-base font-bold">
                      {verificationResult.is_match
                        ? 'Facial Identity Verified'
                        : 'Facial Verification Mismatch'}
                    </h3>
                    <p className="text-xs text-slate-600">
                      {verificationResult.is_match
                        ? 'The captured selfie matches the portrait on your identity document.'
                        : 'The selfie similarity score does not satisfy the matching threshold.'}
                    </p>
                  </div>
                </div>

                <div className="text-right sm:border-l sm:border-slate-200 sm:pl-6">
                  <span className="text-xs text-slate-500 block">Similarity Score</span>
                  <span
                    className={`text-2xl font-bold font-mono ${
                      verificationResult.is_match ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {verificationResult.similarity_score !== null
                      ? `${verificationResult.similarity_score}%`
                      : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Progress Bar of Match */}
              {verificationResult.similarity_score !== null && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Similarity Percentage</span>
                    <span className="font-mono">
                      Distance: {verificationResult.distance ?? 'N/A'} (Threshold: {verificationResult.threshold})
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-500 ${
                        verificationResult.is_match ? 'bg-emerald-600' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(verificationResult.similarity_score, 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Findings & Limitations */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <p className="font-semibold text-slate-800 flex items-center">
                  <AlertCircle className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                  Biometric Engine Audit Findings:
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-600 pl-1">
                  {verificationResult.validation_messages.map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>

                {/* Honest Liveness Limitation Disclosure */}
                <div className="mt-2 pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-700">
                    Liveness Status:{' '}
                    <span className="uppercase text-amber-700 font-bold bg-amber-100 px-2 py-0.5 rounded">
                      {verificationResult.liveness_status}
                    </span>
                  </span>
                  <span>FaceNet Local Verification</span>
                </div>
              </div>

              {/* Retry button if failed */}
              {!verificationResult.is_match && (
                <div className="pt-2 flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRetake}
                    leftIcon={<RefreshCw className="w-4 h-4" />}
                  >
                    Try Again with Another Selfie
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

