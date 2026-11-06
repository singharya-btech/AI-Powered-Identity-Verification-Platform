import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  FileText,
  CreditCard,
  ArrowLeft,
  RefreshCw,
  ShieldCheck,
  X,
  Clock,
  Sparkles,
  ArrowRight,
  Send,
  Ban,
} from 'lucide-react';
import { kycService, DocumentOcrResult, FaceVerificationResult, KycSessionItem } from '../../services/kycService';
import { ApiErrorMessage } from '../../services/api';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';
import { FaceVerificationCamera } from '../../components/kyc/FaceVerificationCamera';

type DocumentType = 'PAN' | 'AADHAAR';
type FlowStep = 'document_upload' | 'face_verification' | 'review_and_submit' | 'submitted';

export const VerificationFlow: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<FlowStep>('document_upload');
  const [documentType, setDocumentType] = useState<DocumentType>('PAN');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [ocrResult, setOcrResult] = useState<DocumentOcrResult | null>(null);
  const [faceResult, setFaceResult] = useState<FaceVerificationResult | null>(null);
  const [submittedSession, setSubmittedSession] = useState<KycSessionItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (file: File) => {
    setErrorMessage(null);
    setOcrResult(null);
    setFaceResult(null);
    setSubmittedSession(null);

    // Validate size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Selected image exceeds the 5MB file size limit.');
      return;
    }

    // Validate type
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      setErrorMessage('Only JPG and PNG document images are supported.');
      return;
    }

    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setOcrResult(null);
    setFaceResult(null);
    setSubmittedSession(null);
    setErrorMessage(null);
    setSuccessMessage(null);
    setUploadProgress(0);
    setCurrentStep('document_upload');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmitDocument = async () => {
    if (!selectedFile) {
      setErrorMessage('Please select a document image to proceed.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setUploadProgress(10);

    try {
      const result = await kycService.uploadDocument(
        documentType,
        selectedFile,
        (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 90) / progressEvent.total);
            setUploadProgress(percent);
          }
        }
      );
      setUploadProgress(100);
      setOcrResult(result);
    } catch (err) {
      const error = err as ApiErrorMessage;
      setErrorMessage(error.message || 'Failed to process document image.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFaceVerificationComplete = (result: FaceVerificationResult) => {
    setFaceResult(result);
    setCurrentStep('review_and_submit');
  };

  const handleSubmitForReview = async () => {
    if (!ocrResult) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const updated = await kycService.submitForReview(ocrResult.session_id);
      setSubmittedSession(updated);
      setCurrentStep('submitted');
      setSuccessMessage('Your KYC application has been successfully submitted for Administrator Compliance Review.');
    } catch (err) {
      const error = err as ApiErrorMessage;
      setErrorMessage(error.message || 'Failed to submit application for administrative review.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelSession = async () => {
    if (!ocrResult) return;
    if (!window.confirm('Are you sure you want to cancel this verification session? This cannot be undone.')) {
      return;
    }

    setIsCancelling(true);
    setErrorMessage(null);

    try {
      const updated = await kycService.cancelSession(ocrResult.session_id, 'Cancelled by applicant');
      setSubmittedSession(updated);
      setCurrentStep('submitted');
      setSuccessMessage('This KYC verification session has been cancelled.');
    } catch (err) {
      const error = err as ApiErrorMessage;
      setErrorMessage(error.message || 'Failed to cancel verification session.');
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              AI Identity Verification
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
              End-to-End Workflow
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Local OpenCV document OCR, DeepFace biometric comparison, and compliance review
          </p>
        </div>

        <Link to="/customer">
          <Button variant="outline" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />}>
            Back to Dashboard
          </Button>
        </Link>
      </div>

      {/* Multi-Step Progress Indicator */}
      <div className="grid grid-cols-4 gap-2 text-center text-xs font-semibold">
        <div
          className={`p-2.5 rounded-xl border flex items-center justify-center space-x-1.5 ${
            currentStep === 'document_upload' && !ocrResult
              ? 'bg-blue-50 border-blue-500 text-blue-700'
              : ocrResult
              ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
              : 'bg-slate-50 border-slate-200 text-slate-400'
          }`}
        >
          {ocrResult ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center">1</span>
          )}
          <span className="truncate">1. Document OCR</span>
        </div>

        <div
          className={`p-2.5 rounded-xl border flex items-center justify-center space-x-1.5 ${
            currentStep === 'face_verification'
              ? 'bg-blue-50 border-blue-500 text-blue-700'
              : faceResult
              ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
              : 'bg-slate-50 border-slate-200 text-slate-400'
          }`}
        >
          {faceResult ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <span className="w-4 h-4 rounded-full bg-slate-300 text-slate-700 text-[10px] flex items-center justify-center">2</span>
          )}
          <span className="truncate">2. Face Biometrics</span>
        </div>

        <div
          className={`p-2.5 rounded-xl border flex items-center justify-center space-x-1.5 ${
            currentStep === 'review_and_submit'
              ? 'bg-blue-50 border-blue-500 text-blue-700'
              : submittedSession
              ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
              : 'bg-slate-50 border-slate-200 text-slate-400'
          }`}
        >
          <span className="w-4 h-4 rounded-full bg-slate-300 text-slate-700 text-[10px] flex items-center justify-center">3</span>
          <span className="truncate">3. Review & Submit</span>
        </div>

        <div
          className={`p-2.5 rounded-xl border flex items-center justify-center space-x-1.5 ${
            currentStep === 'submitted'
              ? submittedSession?.workflow_status === 'APPROVED'
                ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                : submittedSession?.workflow_status === 'CANCELLED'
                ? 'bg-slate-100 border-slate-300 text-slate-700'
                : 'bg-amber-50 border-amber-500 text-amber-700'
              : 'bg-slate-50 border-slate-200 text-slate-400'
          }`}
        >
          <span className="w-4 h-4 rounded-full bg-slate-300 text-slate-700 text-[10px] flex items-center justify-center">4</span>
          <span className="truncate">4. Decision</span>
        </div>
      </div>

      {errorMessage && (
        <Alert
          type="error"
          title="Verification Notice"
          message={errorMessage}
          onClose={() => setErrorMessage(null)}
        />
      )}

      {successMessage && (
        <Alert
          type="success"
          title="Status Update"
          message={successMessage}
          onClose={() => setSuccessMessage(null)}
        />
      )}

      {/* STEP 4: Submitted / Final Status State */}
      {currentStep === 'submitted' && submittedSession && (
        <div className="space-y-6">
          <Card className={`border-t-4 ${
            submittedSession.workflow_status === 'APPROVED'
              ? 'border-t-emerald-500'
              : submittedSession.workflow_status === 'CANCELLED'
              ? 'border-t-slate-400'
              : 'border-t-amber-500'
          }`}>
            <div className="text-center py-6 space-y-4">
              <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center ${
                submittedSession.workflow_status === 'APPROVED'
                  ? 'bg-emerald-100 text-emerald-600'
                  : submittedSession.workflow_status === 'CANCELLED'
                  ? 'bg-slate-100 text-slate-600'
                  : 'bg-amber-100 text-amber-600'
              }`}>
                {submittedSession.workflow_status === 'APPROVED' ? (
                  <ShieldCheck className="w-9 h-9" />
                ) : submittedSession.workflow_status === 'CANCELLED' ? (
                  <Ban className="w-9 h-9" />
                ) : (
                  <Clock className="w-9 h-9" />
                )}
              </div>

              <div className="space-y-1">
                <h2 className="text-2xl font-bold text-slate-900">
                  {submittedSession.workflow_status === 'APPROVED'
                    ? 'KYC Verification Approved!'
                    : submittedSession.workflow_status === 'CANCELLED'
                    ? 'Session Cancelled'
                    : 'Application Submitted for Compliance Review'}
                </h2>
                <p className="text-sm text-slate-600 max-w-lg mx-auto">
                  {submittedSession.workflow_status === 'APPROVED'
                    ? 'Your identity has been officially approved and verified by compliance administration.'
                    : submittedSession.workflow_status === 'CANCELLED'
                    ? 'This session has been terminated. You can start a new verification whenever you are ready.'
                    : 'Your document extraction and biometric face match have been queued for compliance administrator approval. Only official admin decision grants verified identity status.'}
                </p>
              </div>

              {/* Status Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl mx-auto pt-4 text-left">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-xs text-slate-500 font-medium">Session ID</p>
                  <p className="text-xs font-mono font-semibold text-slate-800 mt-0.5 truncate" title={submittedSession.id}>
                    {submittedSession.id}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-xs text-slate-500 font-medium">Workflow Status</p>
                  <p className="text-xs font-bold font-mono text-amber-700 mt-0.5">
                    {submittedSession.workflow_status}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-xs text-slate-500 font-medium">Review Status</p>
                  <p className="text-xs font-bold text-slate-800 mt-0.5">
                    {submittedSession.admin_review_status || 'PENDING'}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
                <Button
                  variant="outline"
                  size="md"
                  onClick={handleClearFile}
                  leftIcon={<RefreshCw className="w-4 h-4" />}
                >
                  Verify Another Document
                </Button>
                <Link to="/customer">
                  <Button variant="primary" size="md" leftIcon={<ShieldCheck className="w-4 h-4" />}>
                    Return to Customer Dashboard
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* STEP 3: Review Dossier & Submit for Admin Review */}
      {currentStep === 'review_and_submit' && ocrResult && (
        <div className="space-y-6">
          <Card className="border-t-4 border-t-blue-600">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-slate-100 gap-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Step 3 of 4: Dossier Review
                </span>
                <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                  Review Application & Submit for Final Approval
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  Verify your document details and biometric comparison before submitting to compliance review.
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 block font-mono">Session ID</span>
                <span className="text-xs font-bold font-mono text-slate-700">
                  {ocrResult.session_id.slice(0, 13)}...
                </span>
              </div>
            </div>

            {/* Dossier Grid */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Document Overview */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    1. Identity Document ({ocrResult.document_type})
                  </p>
                  <span className="text-xs font-semibold text-emerald-600">
                    Confidence: {Math.round(ocrResult.confidence_score * 100)}%
                  </span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Masked Number:</span>
                    <span className="font-mono font-bold text-slate-900">{ocrResult.document_number_masked}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Extracted Name:</span>
                    <span className="font-semibold text-slate-900">{ocrResult.extracted_name || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Date of Birth:</span>
                    <span className="font-semibold text-slate-900">{ocrResult.extracted_dob || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Face Biometric Overview */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    2. Facial Biometrics (FaceNet)
                  </p>
                  <span className={`text-xs font-bold ${faceResult?.is_match ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {faceResult?.similarity_score ? `${faceResult.similarity_score}% Match` : 'Awaiting'}
                  </span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Biometric Match:</span>
                    <span className="font-bold text-slate-900">
                      {faceResult?.is_match ? 'MATCH CONFIRMED' : 'NO MATCH'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Cosine Distance:</span>
                    <span className="font-mono text-slate-700">
                      {faceResult?.distance} (Threshold: {faceResult?.threshold})
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Liveness Status:</span>
                    <span className="font-semibold text-amber-700 font-mono">UNASSESSED</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Liveness & Privacy Disclaimer */}
            <div className="mt-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
              <p className="font-semibold flex items-center">
                <AlertCircle className="w-4 h-4 mr-1.5 text-amber-600 flex-shrink-0" />
                Anti-Spoofing & Compliance Notice:
              </p>
              <p className="text-amber-800 leading-relaxed">
                Liveness anti-spoofing is <span className="font-bold">UNASSESSED</span>: standard webcam video cannot distinguish printed portraits from living subjects. To protect integrity, official verification is granted solely after Administrator compliance review.
              </p>
            </div>

            {/* Submission Actions */}
            <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <Button
                variant="outline"
                size="md"
                onClick={handleCancelSession}
                isLoading={isCancelling}
                leftIcon={<Ban className="w-4 h-4 text-red-600" />}
              >
                Cancel Session
              </Button>

              <div className="flex items-center space-x-3">
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => setCurrentStep('face_verification')}
                  leftIcon={<RefreshCw className="w-4 h-4" />}
                >
                  Retake Selfie
                </Button>

                <Button
                  variant="primary"
                  size="md"
                  onClick={handleSubmitForReview}
                  isLoading={isSubmitting}
                  rightIcon={<Send className="w-4 h-4" />}
                >
                  Submit for Compliance Review
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* STEP 2: Biometric Face Verification (Webcam Capture) */}
      {currentStep === 'face_verification' && ocrResult && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentStep('document_upload')}
              leftIcon={<ArrowLeft className="w-4 h-4" />}
            >
              Back to Document Review
            </Button>
            <span className="text-xs text-slate-500 font-mono">
              Session: {ocrResult.session_id.slice(0, 8)}...
            </span>
          </div>

          <FaceVerificationCamera
            sessionId={ocrResult.session_id}
            onVerificationComplete={handleFaceVerificationComplete}
          />
        </div>
      )}

      {/* STEP 1: Document Upload & Review */}
      {currentStep === 'document_upload' && (
        <>
          {ocrResult ? (
            /* Structured Extraction Review Card */
            <div className="space-y-6">
              <Card className="border-t-4 border-t-blue-600">
                {/* Verdict Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-6 border-b border-slate-100">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Step 1 Complete: Document OCR
                    </span>
                    <div className="flex items-center space-x-2">
                      <h2 className="text-xl font-bold text-slate-900">
                        {ocrResult.document_type} Extraction Result
                      </h2>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                          ocrResult.status === 'APPROVED'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : ocrResult.status === 'PENDING_REVIEW'
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-red-100 text-red-800 border border-red-200'
                        }`}
                      >
                        {ocrResult.status}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs text-slate-500 block">OCR Confidence</span>
                    <span className="text-lg font-bold text-blue-600">
                      {Math.round(ocrResult.confidence_score * 100)}%
                    </span>
                  </div>
                </div>

                {/* Validation Findings */}
                {ocrResult.validation_messages.length > 0 && (
                  <div className="mt-4 p-3.5 bg-amber-50 rounded-lg border border-amber-200 space-y-1 text-xs text-amber-900">
                    <p className="font-semibold flex items-center">
                      <AlertCircle className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
                      Format & Facial Verification Findings:
                    </p>
                    <ul className="list-disc list-inside space-y-0.5 pl-1 text-amber-800">
                      {ocrResult.validation_messages.map((msg, i) => (
                        <li key={i}>{msg}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Structured Fields Grid */}
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                    <p className="text-xs font-medium text-slate-500">Masked Document Number</p>
                    <p className="text-base font-bold font-mono text-slate-900 mt-1">
                      {ocrResult.document_number_masked || 'Not Detected'}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Raw document sequence masked per privacy guidelines
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                    <p className="text-xs font-medium text-slate-500">Extracted Name</p>
                    <p className="text-base font-bold text-slate-900 mt-1">
                      {ocrResult.extracted_name || 'Not Detected'}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Cardholder name parsed from document</p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                    <p className="text-xs font-medium text-slate-500">Date / Year of Birth</p>
                    <p className="text-base font-bold text-slate-900 mt-1">
                      {ocrResult.extracted_dob || 'Not Detected'}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Parsed birth date record</p>
                  </div>

                  {ocrResult.document_type === 'AADHAAR' ? (
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                      <p className="text-xs font-medium text-slate-500">Extracted Gender</p>
                      <p className="text-base font-bold text-slate-900 mt-1">
                        {ocrResult.extracted_gender || 'Not Specified'}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Gender indicator</p>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                      <p className="text-xs font-medium text-slate-500">Father&apos;s Name</p>
                      <p className="text-base font-bold text-slate-900 mt-1">
                        {ocrResult.extracted_fields?.fathers_name ? String(ocrResult.extracted_fields.fathers_name) : 'Not Detected'}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Secondary identifier</p>
                    </div>
                  )}
                </div>

                {/* Session Audit Metadata */}
                <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-slate-500 gap-2">
                  <span className="font-mono">Session ID: {ocrResult.session_id}</span>
                  <span className="flex items-center">
                    <Clock className="w-3.5 h-3.5 mr-1 text-slate-400" />
                    Processed at: {new Date(ocrResult.created_at).toLocaleTimeString()}
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <Button
                    variant="outline"
                    size="md"
                    onClick={handleClearFile}
                    leftIcon={<RefreshCw className="w-4 h-4" />}
                  >
                    Verify Another Document
                  </Button>

                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => setCurrentStep('face_verification')}
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                  >
                    Proceed to Face Verification (Step 2)
                  </Button>
                </div>
              </Card>
            </div>
          ) : (
            /* Upload & Processing Form */
            <div className="space-y-6">
              {/* Document Type Selection */}
              <Card>
                <h2 className="text-base font-bold text-slate-900 mb-1">
                  Step 1: Select Document Type
                </h2>
                <p className="text-xs text-slate-500 mb-4">
                  Choose the identity card format you are uploading for local text parsing
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div
                    onClick={() => {
                      setDocumentType('PAN');
                      handleClearFile();
                    }}
                    className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex items-start space-x-3 ${
                      documentType === 'PAN'
                        ? 'border-blue-600 bg-blue-50/40 text-blue-900'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div
                      className={`p-2 rounded-lg ${
                        documentType === 'PAN' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <CreditCard className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold">PAN Card</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Permanent Account Number (10 alphanumeric characters)
                      </p>
                    </div>
                  </div>

                  <div
                    onClick={() => {
                      setDocumentType('AADHAAR');
                      handleClearFile();
                    }}
                    className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex items-start space-x-3 ${
                      documentType === 'AADHAAR'
                        ? 'border-blue-600 bg-blue-50/40 text-blue-900'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div
                      className={`p-2 rounded-lg ${
                        documentType === 'AADHAAR' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold">Aadhaar Card</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Unique Identification Card (12-digit sequence)
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Upload Drop Zone Card */}
              <Card>
                <h2 className="text-base font-bold text-slate-900 mb-1">
                  Upload Document Photo
                </h2>
                <p className="text-xs text-slate-500 mb-4">
                  Please upload a clear, flat, uncropped photo (.jpg, .png, max 5MB)
                </p>

                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
                    isDragging
                      ? 'border-blue-500 bg-blue-50/60'
                      : 'border-slate-300 hover:border-blue-400 bg-slate-50/50'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/jpg"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileChange(e.target.files[0]);
                      }
                    }}
                  />

                  <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 mx-auto flex items-center justify-center mb-3">
                    <Upload className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800">
                    Click to upload or drag and drop your document
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Supports JPG and PNG up to 5MB. Skew correction & text parsing happen locally.
                  </p>
                </div>

                {/* Selected File Preview */}
                {selectedFile && previewUrl && (
                  <div className="mt-5 p-4 rounded-xl bg-slate-100/80 border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center space-x-3 min-w-0">
                      <img
                        src={previewUrl}
                        alt="Document Preview"
                        className="w-16 h-12 object-cover rounded-lg border border-slate-300 flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {selectedFile.name}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • {selectedFile.type}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClearFile();
                        }}
                        leftIcon={<X className="w-4 h-4" />}
                      >
                        Remove
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSubmitDocument();
                        }}
                        isLoading={isProcessing}
                        leftIcon={<Sparkles className="w-4 h-4" />}
                      >
                        Process Document OCR
                      </Button>
                    </div>
                  </div>
                )}

                {/* Processing Progress Bar */}
                {isProcessing && (
                  <div className="mt-5 space-y-2">
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>Analyzing contours, correcting skew & running EasyOCR...</span>
                      <span className="font-semibold">{uploadProgress}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className="h-full bg-blue-600 transition-all duration-300 rounded-full"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
};
