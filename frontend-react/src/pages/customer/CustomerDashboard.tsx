import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShieldAlert,
  ShieldCheck,
  FileText,
  CheckCircle,
  Clock,
  ArrowRight,
  Info,
  Calendar,
  Mail,
  User,
  Key,
  RefreshCw,
  X,
  History,
  AlertCircle,
  Ban,
  Send,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { kycService, KycSessionItem } from '../../services/kycService';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';

export const CustomerDashboard: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState<KycSessionItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState<boolean>(true);
  const [selectedSession, setSelectedSession] = useState<KycSessionItem | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchSessions = async () => {
    setLoadingSessions(true);
    try {
      const data = await kycService.getMySessions();
      setSessions(data);
      if (refreshUser) {
        await refreshUser();
      }
    } catch {
      // Fallback silently
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const latestSession = sessions.length > 0 ? sessions[0] : null;
  const isVerified = Boolean(user?.is_verified);

  const formattedJoinDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Recently';

  const handleOpenAuditModal = async (session: KycSessionItem) => {
    try {
      const full = await kycService.getSessionById(session.id);
      setSelectedSession(full);
    } catch {
      setSelectedSession(session);
    }
  };

  const handleSubmitForReview = async (sessionId: string) => {
    setActionLoading(true);
    setFeedbackMessage(null);
    try {
      const updated = await kycService.submitForReview(sessionId);
      setFeedbackMessage({ type: 'success', text: 'Session submitted for Administrator Compliance Review!' });
      setSelectedSession(updated);
      await fetchSessions();
    } catch (err: unknown) {
      const errorMsg = (err as { message?: string }).message || 'Failed to submit session.';
      setFeedbackMessage({ type: 'error', text: errorMsg });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelSession = async (sessionId: string) => {
    if (!window.confirm('Are you sure you want to cancel this verification session?')) return;
    setActionLoading(true);
    setFeedbackMessage(null);
    try {
      const updated = await kycService.cancelSession(sessionId, 'Cancelled by customer from dashboard');
      setFeedbackMessage({ type: 'success', text: 'Verification session has been cancelled.' });
      setSelectedSession(updated);
      await fetchSessions();
    } catch (err: unknown) {
      const errorMsg = (err as { message?: string }).message || 'Failed to cancel session.';
      setFeedbackMessage({ type: 'error', text: errorMsg });
    } finally {
      setActionLoading(false);
    }
  };

  const getWorkflowBadge = (session: KycSessionItem) => {
    const wf = session.workflow_status || session.status;
    switch (wf) {
      case 'APPROVED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
            APPROVED
          </span>
        );
      case 'PENDING_ADMIN_REVIEW':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
            PENDING ADMIN REVIEW
          </span>
        );
      case 'FACE_MATCHED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200">
            FACE MATCHED
          </span>
        );
      case 'AWAITING_FACE_VERIFICATION':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200">
            AWAITING SELFIE
          </span>
        );
      case 'REJECTED':
      case 'OCR_FAILED':
      case 'FACE_MISMATCHED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-800 border border-red-200">
            {wf}
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-300">
            CANCELLED
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-800">
            {wf}
          </span>
        );
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-8">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white/20 text-white tracking-wider uppercase mb-1">
              Customer Portal
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Welcome back, {user?.full_name || 'Customer'}!
            </h1>
            <p className="text-blue-100 text-sm max-w-xl">
              Manage your personal identity verification session, view compliance audit history,
              and start new document verification flows.
            </p>
          </div>
          <div className="flex-shrink-0">
            <Button
              variant="outline"
              size="md"
              onClick={() => navigate('/customer/verify')}
              className="bg-white text-blue-700 hover:bg-blue-50 border-white shadow"
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Start KYC Verification
            </Button>
          </div>
        </div>
      </div>

      {feedbackMessage && (
        <Alert
          type={feedbackMessage.type}
          title={feedbackMessage.type === 'success' ? 'Success' : 'Notice'}
          message={feedbackMessage.text}
          onClose={() => setFeedbackMessage(null)}
        />
      )}

      {/* Status Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Verification Status */}
        <Card className="flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Identity Status
              </span>
              <div
                className={`p-1.5 rounded-lg ${
                  isVerified
                    ? 'bg-emerald-50 text-emerald-600'
                    : latestSession?.workflow_status === 'PENDING_ADMIN_REVIEW'
                    ? 'bg-amber-50 text-amber-600'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {isVerified ? (
                  <ShieldCheck className="w-5 h-5" />
                ) : (
                  <ShieldAlert className="w-5 h-5" />
                )}
              </div>
            </div>
            <h3 className="text-xl font-bold text-slate-900">
              {isVerified
                ? 'Verified Identity'
                : latestSession?.workflow_status === 'PENDING_ADMIN_REVIEW'
                ? 'Under Review'
                : latestSession?.workflow_status === 'REJECTED'
                ? 'Verification Rejected'
                : 'Verification Required'}
            </h3>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              {isVerified
                ? 'Official compliance approval granted. Your account is fully verified.'
                : latestSession?.workflow_status === 'PENDING_ADMIN_REVIEW'
                ? 'Application submitted! A compliance administrator will review your submission shortly.'
                : latestSession?.workflow_status === 'REJECTED'
                ? `Application was not approved: ${latestSession.rejection_reason || latestSession.failure_reason || 'Please submit a new document.'}`
                : 'Identity documents have not been approved yet. Upload your PAN or Aadhaar card to start.'}
            </p>
          </div>
          <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Document On File:</span>
            <span className="font-semibold text-slate-700">
              {latestSession ? `${latestSession.document_type} (${latestSession.document_number_masked || 'Masked'})` : 'None'}
            </span>
          </div>
        </Card>

        {/* Account Status */}
        <Card className="flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Account Status
              </span>
              <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                <CheckCircle className="w-5 h-5" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-slate-900">
              {user?.is_active ? 'Active Account' : 'Suspended'}
            </h3>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              Customer session authenticated with native bcrypt hashing and secure JWT authorization.
            </p>
          </div>
          <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Security Clearance:</span>
            <span className="font-semibold text-emerald-700">Level 1 (Standard)</span>
          </div>
        </Card>

        {/* Privacy Notice */}
        <Card className="flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Data Privacy
              </span>
              <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                <Key className="w-5 h-5" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-slate-900">Zero PII Storage</h3>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              Document text extraction runs locally using EasyOCR and OpenCV. No raw card images or plain identity numbers are saved.
            </p>
          </div>
          <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Compliance:</span>
            <span className="font-semibold text-blue-700">DPDP Act 2023 Principles</span>
          </div>
        </Card>
      </div>

      {/* Main Two Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Verification Action / History */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Local AI Document Verification</h2>
                <p className="text-xs text-slate-500">EasyOCR text extraction & DeepFace facial verification</p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                Active & Ready
              </span>
            </div>

            <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center bg-slate-50/60 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 mx-auto flex items-center justify-center">
                <FileText className="w-7 h-7" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h4 className="text-base font-semibold text-slate-900">
                  {latestSession ? 'Identity Verification In Progress' : 'Ready to Start Verification'}
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Upload your PAN or Aadhaar card for automated local image contour detection,
                  EasyOCR text recognition, and format consistency analysis.
                </p>
              </div>
              <div className="pt-2">
                <Link to="/customer/verify">
                  <Button variant="primary" size="md" rightIcon={<ArrowRight className="w-4 h-4" />}>
                    {latestSession ? 'Review or Start New Verification' : 'Start Document OCR Now'}
                  </Button>
                </Link>
              </div>
            </div>
          </Card>

          {/* Verification History Section */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-slate-900">Verification History</h3>
                <span className="text-xs text-slate-400">({sessions.length} sessions)</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchSessions}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Refresh
              </Button>
            </div>

            {loadingSessions ? (
              <div className="py-8 text-center text-xs text-slate-500">Loading history...</div>
            ) : sessions.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <Clock className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm font-medium text-slate-700">No verification sessions yet</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  When you upload and process an identity document, your audit trail and status
                  will appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {sessions.map((sess) => (
                  <div key={sess.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
                    <div className="flex items-start space-x-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold flex-shrink-0 mt-0.5">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-slate-900">{sess.document_type} Card</span>
                          <span className="font-mono text-slate-600">
                            {sess.document_number_masked || 'Not Detected'}
                          </span>
                        </div>
                        <p className="text-slate-400 text-[11px] mt-0.5">
                          {new Date(sess.created_at).toLocaleString()}
                        </p>
                        {sess.rejection_reason && (
                          <p className="text-red-600 text-[11px] mt-1 flex items-center">
                            <AlertCircle className="w-3 h-3 mr-1 flex-shrink-0" />
                            Reason: {sess.rejection_reason}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                      {sess.face_verified ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                          Face {sess.face_match_score ? `${sess.face_match_score}%` : 'Match'}
                        </span>
                      ) : sess.face_match_status === 'NO_MATCH' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-800">
                          Mismatch
                        </span>
                      ) : null}

                      {getWorkflowBadge(sess)}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenAuditModal(sess)}
                        leftIcon={<History className="w-3.5 h-3.5" />}
                      >
                        Audit Trail
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Profile Sidebar */}
        <div className="space-y-6">
          <Card>
            <h3 className="text-base font-bold text-slate-900 mb-4 pb-3 border-b border-slate-100">
              Account Profile
            </h3>
            <div className="space-y-4 text-xs">
              <div className="flex items-start space-x-3">
                <User className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-slate-500">Full Name</p>
                  <p className="font-semibold text-slate-900 truncate mt-0.5">
                    {user?.full_name}
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Mail className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-slate-500">Email Address</p>
                  <p className="font-semibold text-slate-900 truncate mt-0.5">
                    {user?.email}
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Calendar className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-slate-500">Member Since</p>
                  <p className="font-semibold text-slate-900 mt-0.5">
                    {formattedJoinDate}
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Key className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-slate-500">Account ID (UUID)</p>
                  <p className="font-mono text-[11px] text-slate-600 truncate mt-0.5">
                    {user?.id}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Help & Support Card */}
          <Card className="bg-slate-50 border border-slate-200">
            <div className="flex items-start space-x-3">
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-semibold text-slate-900">Need Assistance?</p>
                <p className="text-slate-600 leading-relaxed">
                  Ensure document scans are flat, clear, and well-lit. Reflection glare or heavy shadows
                  can hinder local OCR text recognition.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Audit Trail & Session Detail Modal */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <History className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-bold text-slate-900">
                  Session Audit Trail
                </h3>
              </div>
              <button
                onClick={() => setSelectedSession(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Session Metadata Summary */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Session ID:</span>
                <span className="font-mono font-bold text-slate-800">{selectedSession.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Document Type:</span>
                <span className="font-semibold text-slate-800">{selectedSession.document_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Masked ID:</span>
                <span className="font-mono font-bold text-slate-800">{selectedSession.document_number_masked || 'None'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Workflow Status:</span>
                <span>{getWorkflowBadge(selectedSession)}</span>
              </div>
              {selectedSession.rejection_reason && (
                <div className="pt-2 border-t border-slate-200 text-red-700">
                  <span className="font-bold">Rejection Reason: </span>
                  {selectedSession.rejection_reason}
                </div>
              )}
            </div>

            {/* Audit Log Chronology */}
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Tamper-Evident Audit Events
              </h4>
              {selectedSession.audit_logs && selectedSession.audit_logs.length > 0 ? (
                <div className="space-y-2 text-xs">
                  {selectedSession.audit_logs.map((log) => (
                    <div
                      key={log.id}
                      className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-semibold text-slate-800 font-mono">{log.action}</p>
                        <p className="text-[11px] text-slate-400">Resource: {log.resource_type}</p>
                      </div>
                      <span className="text-[11px] text-slate-500">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No audit records recorded yet.</p>
              )}
            </div>

            {/* Actions for in-progress session */}
            {['AWAITING_FACE_VERIFICATION', 'FACE_MATCHED', 'OCR_COMPLETED'].includes(
              selectedSession.workflow_status || selectedSession.status
            ) && (
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCancelSession(selectedSession.id)}
                  isLoading={actionLoading}
                  leftIcon={<Ban className="w-3.5 h-3.5 text-red-600" />}
                >
                  Cancel Session
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleSubmitForReview(selectedSession.id)}
                  isLoading={actionLoading}
                  rightIcon={<Send className="w-3.5 h-3.5" />}
                >
                  Submit for Review
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
