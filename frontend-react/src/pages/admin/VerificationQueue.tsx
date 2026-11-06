import React, { useEffect, useState } from 'react';
import {
  FileCheck,
  ArrowLeft,
  RefreshCw,
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldCheck,
  X,
  History,
  Eye,
  Check,
  Ban,
  Filter,
  Download,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  User,
  Mail,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { kycService, KycSessionItem } from '../../services/kycService';
import { ApiErrorMessage } from '../../services/api';

const STATUS_FILTERS = [
  { label: 'All Sessions', value: 'ALL' },
  { label: 'Pending Review', value: 'PENDING_ADMIN_REVIEW' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'Awaiting Selfie', value: 'AWAITING_FACE_VERIFICATION' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

const PAGE_SIZE_OPTIONS = [10, 20, 50];

export const VerificationQueue: React.FC = () => {
  const [sessions, setSessions] = useState<KycSessionItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Pagination & Filtering State
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Export State
  const [isExportingCsv, setIsExportingCsv] = useState<boolean>(false);
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);

  // Modal Review State
  const [inspectingSession, setInspectingSession] = useState<KycSessionItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [isSubmittingDecision, setIsSubmittingDecision] = useState<boolean>(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [complianceReviewedConsent, setComplianceReviewedConsent] = useState<boolean>(true);

  const fetchSessions = async (targetPage = page) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      let items: KycSessionItem[] = [];
      let total = 0;
      let pages = 1;
      let currPage = targetPage;

      if (typeof kycService.getAllSessionsAdminPaginated === 'function') {
        const res = await kycService.getAllSessionsAdminPaginated({
          page: targetPage,
          pageSize,
          statusFilter: selectedStatus,
          search: searchQuery,
          dateFrom: dateFrom ? `${dateFrom}T00:00:00` : undefined,
          dateTo: dateTo ? `${dateTo}T23:59:59` : undefined,
          sortBy,
          sortOrder,
        });
        if (res && Array.isArray(res.items)) {
          items = res.items;
          total = res.total ?? res.items.length;
          pages = res.total_pages ?? 1;
          currPage = res.page ?? targetPage;
        } else if (Array.isArray(res)) {
          items = res;
          total = res.length;
          pages = 1;
        }
      }

      // Backward compatibility fallback for tests/environments where only getAllSessionsAdmin is available/mocked
      if (items.length === 0 && typeof kycService.getAllSessionsAdmin === 'function') {
        const legacyRes = await kycService.getAllSessionsAdmin(selectedStatus, searchQuery);
        if (Array.isArray(legacyRes)) {
          items = legacyRes;
          total = legacyRes.length;
          pages = 1;
        }
      }

      setSessions(items);
      setTotalPages(pages);
      setTotalCount(total);
      setPage(currPage);
    } catch (err) {
      const error = err as ApiErrorMessage;
      setErrorMessage(error.message || 'Failed to retrieve administrative verification queue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions(1);
  }, [selectedStatus, pageSize, sortBy, sortOrder]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchSessions(1);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedStatus('ALL');
    setDateFrom('');
    setDateTo('');
    setSortBy('created_at');
    setSortOrder('desc');
    setPage(1);
  };

  const handleExportCsv = async () => {
    setIsExportingCsv(true);
    try {
      const blob = await kycService.exportReportsCsv({
        statusFilter: selectedStatus !== 'ALL' ? selectedStatus : undefined,
        dateFrom: dateFrom ? `${dateFrom}T00:00:00` : undefined,
        dateTo: dateTo ? `${dateTo}T23:59:59` : undefined,
      });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      kycService.downloadBlob(blob, `kyc_queue_export_${timestamp}.csv`);
      setSuccessMessage('Filtered CSV queue report exported successfully.');
    } catch (err) {
      const error = err as ApiErrorMessage;
      setErrorMessage(error.message || 'Failed to export CSV report.');
    } finally {
      setIsExportingCsv(false);
    }
  };

  const handleExportExcel = async () => {
    setIsExportingExcel(true);
    try {
      const blob = await kycService.exportReportsExcel({
        statusFilter: selectedStatus !== 'ALL' ? selectedStatus : undefined,
        dateFrom: dateFrom ? `${dateFrom}T00:00:00` : undefined,
        dateTo: dateTo ? `${dateTo}T23:59:59` : undefined,
      });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      kycService.downloadBlob(blob, `kyc_queue_export_${timestamp}.xlsx`);
      setSuccessMessage('Filtered Excel (.xlsx) queue report exported successfully.');
    } catch (err) {
      const error = err as ApiErrorMessage;
      setErrorMessage(error.message || 'Failed to export Excel report.');
    } finally {
      setIsExportingExcel(false);
    }
  };

  const openReviewModal = async (session: KycSessionItem) => {
    setDecisionError(null);
    setRejectionReason('');
    setComplianceReviewedConsent(true);
    try {
      const full = await kycService.getSessionById(session.id);
      setInspectingSession(full);
    } catch {
      setInspectingSession(session);
    }
  };

  const handleAdminDecision = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!inspectingSession) return;
    setDecisionError(null);

    if (decision === 'REJECTED') {
      const trimmed = rejectionReason.trim();
      if (!trimmed || trimmed.length < 3) {
        setDecisionError('An explanation reason is strictly mandatory when rejecting a KYC session (at least 3 characters required).');
        return;
      }
    }

    setIsSubmittingDecision(true);
    try {
      const updated = await kycService.adminReviewSession(
        inspectingSession.id,
        decision,
        rejectionReason.trim() || undefined
      );
      setSuccessMessage(
        `Session ${updated.id.slice(0, 8)}... successfully ${decision.toLowerCase()}!`
      );
      setInspectingSession(updated);
      await fetchSessions(page);
    } catch (err) {
      const error = err as ApiErrorMessage;
      setDecisionError(error.message || `Failed to record administrative ${decision.toLowerCase()} decision.`);
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  const getWorkflowBadge = (session: KycSessionItem) => {
    const wf = session.workflow_status || session.status;
    switch (wf) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
            APPROVED
          </span>
        );
      case 'PENDING_ADMIN_REVIEW':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="w-3 h-3 mr-1 text-amber-600" />
            PENDING REVIEW
          </span>
        );
      case 'FACE_MATCHED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200">
            <CheckCircle2 className="w-3 h-3 mr-1 text-purple-600" />
            FACE MATCHED
          </span>
        );
      case 'AWAITING_FACE_VERIFICATION':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200">
            <Clock className="w-3 h-3 mr-1 text-blue-600" />
            AWAITING SELFIE
          </span>
        );
      case 'REJECTED':
      case 'OCR_FAILED':
      case 'FACE_MISMATCHED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-red-100 text-red-800 border border-red-200">
            <XCircle className="w-3 h-3 mr-1 text-red-600" />
            {wf}
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-300">
            <Ban className="w-3 h-3 mr-1 text-slate-500" />
            CANCELLED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-800">
            {wf}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              KYC Compliance Verification Queue
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
              Admin Restricted
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Server-side paginated verification queue: inspect OCR extractions, compare facial biometrics, and audit decisions
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            isLoading={isExportingCsv}
            leftIcon={<Download className="w-3.5 h-3.5" />}
          >
            Export CSV
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            isLoading={isExportingExcel}
            leftIcon={<Download className="w-3.5 h-3.5" />}
          >
            Export Excel
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchSessions(page)}
            isLoading={loading}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>

          <Link to="/admin">
            <Button variant="outline" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />}>
              Overview
            </Button>
          </Link>
        </div>
      </div>

      {errorMessage && (
        <Alert
          type="error"
          title="Queue Retrieval Error"
          message={errorMessage}
          onClose={() => setErrorMessage(null)}
        />
      )}

      {successMessage && (
        <Alert
          type="success"
          title="Compliance Action Completed"
          message={successMessage}
          onClose={() => setSuccessMessage(null)}
        />
      )}

      {/* Filter and Search Bar */}
      <Card padding="sm" className="space-y-4">
        {/* Status Filter Tabs */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-xs">
          <span className="text-slate-400 font-semibold uppercase tracking-wider text-[11px] mr-1 flex items-center">
            <Filter className="w-3 h-3 mr-1" /> Status:
          </span>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setSelectedStatus(f.value)}
              className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors ${
                selectedStatus === f.value
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Date Range, Search & Sort Controls */}
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-3 border-t border-slate-100 text-xs">
          {/* Search Input */}
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search name, masked ID, or session UUID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Date From */}
          <div className="md:col-span-2 flex items-center space-x-1.5">
            <span className="text-slate-500 font-medium whitespace-nowrap">From:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-2 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Date To */}
          <div className="md:col-span-2 flex items-center space-x-1.5">
            <span className="text-slate-500 font-medium whitespace-nowrap">To:</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-2 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Sort By & Order */}
          <div className="md:col-span-3 flex items-center space-x-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="flex-1 px-2 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="created_at">Sort: Submitted Date</option>
              <option value="status">Sort: Status</option>
              <option value="extracted_name">Sort: Extracted Name</option>
            </select>

            <button
              type="button"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              title={`Sorting ${sortOrder.toUpperCase()}`}
              className="p-2 border border-slate-300 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
            </button>

            <Button variant="primary" size="sm" type="submit">
              Apply
            </Button>

            {(searchQuery || dateFrom || dateTo || selectedStatus !== 'ALL') && (
              <Button variant="ghost" size="sm" type="button" onClick={handleClearFilters}>
                Clear
              </Button>
            )}
          </div>
        </form>
      </Card>

      {/* Sessions Table */}
      <Card padding="none" className="overflow-hidden">
        {loading && sessions.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <LoadingSpinner size="lg" color="text-blue-600" />
            <p className="text-sm text-slate-600">Querying verification records from PostgreSQL...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <FileCheck className="w-10 h-10 text-slate-300 mx-auto" />
            <h4 className="text-base font-semibold text-slate-800">No verification sessions found</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {searchQuery || selectedStatus !== 'ALL' || dateFrom || dateTo
                ? 'No session records matched your selected filter or date criteria.'
                : 'No document verification requests have been submitted yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3.5 px-4 sm:px-6">Doc Type</th>
                  <th className="py-3.5 px-4 sm:px-6">Masked Identifier</th>
                  <th className="py-3.5 px-4 sm:px-6">Applicant Name</th>
                  <th className="py-3.5 px-4 sm:px-6">Workflow Status</th>
                  <th className="py-3.5 px-4 sm:px-6">Face Match</th>
                  <th className="py-3.5 px-4 sm:px-6">OCR Confidence</th>
                  <th className="py-3.5 px-4 sm:px-6">Submitted At</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sessions.map((item) => {
                  const dateStr = item.created_at
                    ? new Date(item.created_at).toLocaleString()
                    : 'N/A';
                  const displayName = item.customer_name || item.extracted_name || 'N/A';

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-4 sm:px-6 font-semibold text-slate-900">
                        {item.document_type}
                      </td>

                      <td className="py-4 px-4 sm:px-6 font-mono text-xs font-semibold text-slate-800">
                        {item.document_number_masked || 'Not Detected'}
                      </td>

                      <td className="py-4 px-4 sm:px-6">
                        <div className="font-medium text-slate-800">{displayName}</div>
                        {item.customer_email && (
                          <div className="text-[11px] text-slate-400">{item.customer_email}</div>
                        )}
                      </td>

                      <td className="py-4 px-4 sm:px-6">
                        {getWorkflowBadge(item)}
                      </td>

                      <td className="py-4 px-4 sm:px-6">
                        {item.face_verified ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
                            {item.face_match_score !== null && item.face_match_score !== undefined
                              ? `${item.face_match_score}%`
                              : 'MATCH'}
                          </span>
                        ) : item.face_match_status === 'NO_MATCH' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">
                            <XCircle className="w-3 h-3 mr-1 text-red-600" />
                            {item.face_match_score !== null && item.face_match_score !== undefined
                              ? `${item.face_match_score}%`
                              : 'MISMATCH'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                            <Clock className="w-3 h-3 mr-1 text-slate-400" />
                            Pending
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-4 sm:px-6 text-xs text-slate-600 font-medium">
                        {item.ocr_confidence !== null
                          ? `${Math.round(item.ocr_confidence * 100)}%`
                          : 'N/A'}
                      </td>

                      <td className="py-4 px-4 sm:px-6 text-xs text-slate-500 whitespace-nowrap">
                        <div className="flex items-center space-x-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{dateStr}</span>
                        </div>
                      </td>

                      <td className="py-4 px-4 sm:px-6 text-right">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => openReviewModal(item)}
                          leftIcon={<Eye className="w-3.5 h-3.5" />}
                        >
                          Review Application
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Server-Side Pagination Bar */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center space-x-3">
            <span>
              Showing <span className="font-semibold text-slate-900">{sessions.length > 0 ? (page - 1) * pageSize + 1 : 0}</span> to{' '}
              <span className="font-semibold text-slate-900">{Math.min(page * pageSize, totalCount)}</span> of{' '}
              <span className="font-semibold text-slate-900">{totalCount}</span> entries
            </span>

            <div className="flex items-center space-x-1.5">
              <span>Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="px-2 py-1 rounded border border-slate-300 bg-white font-medium focus:outline-none"
              >
                {PAGE_SIZE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="mr-1">
              Page <span className="font-semibold">{page}</span> of <span className="font-semibold">{totalPages}</span>
            </span>

            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => {
                const prev = Math.max(page - 1, 1);
                fetchSessions(prev);
              }}
              leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
            >
              Prev
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => {
                const next = Math.min(page + 1, totalPages);
                fetchSessions(next);
              }}
              rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      {/* Admin Review & Decision Modal */}
      {inspectingSession && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Compliance Application Review
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    ID: {inspectingSession.id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInspectingSession(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {decisionError && (
              <Alert
                type="error"
                title="Review Decision Blocked"
                message={decisionError}
                onClose={() => setDecisionError(null)}
              />
            )}

            {/* Applicant Profile Information */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-slate-500 text-[11px]">Customer Account:</span>
                  <p className="font-bold text-slate-900">
                    {inspectingSession.customer_name || 'N/A'}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-slate-200 text-slate-700 rounded-lg">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-slate-500 text-[11px]">Customer Email:</span>
                  <p className="font-semibold text-slate-800">
                    {inspectingSession.customer_email || 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            {/* Applicant & Document Dossier */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <p className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                  Document Extraction (EasyOCR)
                </p>
                <div className="space-y-1">
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Document Type:</span>
                    <span className="font-semibold text-slate-900">{inspectingSession.document_type}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Masked ID:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {inspectingSession.document_number_masked || 'None'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Extracted Name:</span>
                    <span className="font-semibold text-slate-900">{inspectingSession.extracted_name || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Date of Birth:</span>
                    <span className="font-semibold text-slate-900">{inspectingSession.extracted_dob || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Extracted Gender:</span>
                    <span className="font-semibold text-slate-900">{inspectingSession.extracted_gender || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">OCR Confidence:</span>
                    <span className="font-bold text-blue-600">
                      {inspectingSession.ocr_confidence !== null
                        ? `${Math.round(inspectingSession.ocr_confidence * 100)}%`
                        : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <p className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                  Biometric Verification (FaceNet)
                </p>
                <div className="space-y-1">
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Match Status:</span>
                    <span className="font-bold text-slate-900">
                      {inspectingSession.face_match_status || 'NOT PERFORMED'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Similarity Score:</span>
                    <span className="font-bold text-emerald-700">
                      {inspectingSession.face_match_score !== null && inspectingSession.face_match_score !== undefined
                        ? `${inspectingSession.face_match_score}% (Threshold: 60% / 0.40 distance)`
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Biometric Consent:</span>
                    <span className="font-semibold text-slate-800">
                      {inspectingSession.biometric_consent ? 'Explicitly Granted' : 'Not Granted'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Workflow Status:</span>
                    <span>{getWorkflowBadge(inspectingSession)}</span>
                  </div>
                  {inspectingSession.admin_reviewer_name && (
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Prior Reviewer:</span>
                      <span className="font-medium text-slate-800">
                        {inspectingSession.admin_reviewer_name}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Liveness Disclaimer Callout */}
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
              <p className="font-semibold flex items-center">
                <AlertCircle className="w-4 h-4 mr-1.5 text-amber-600 flex-shrink-0" />
                Liveness Disclaimer (UNASSESSED):
              </p>
              <p className="text-amber-800 leading-relaxed">
                Standard webcam video does not perform active physical 3D anti-spoofing. Facial similarity comparison and OCR extraction results are analytical aids and do NOT constitute legal proof of identity. As Administrator, verify document authenticity, inspect photo clarity, and review audit history before approving verified status.
              </p>
            </div>

            {/* Audit Log Chronology */}
            <div>
              <div className="flex items-center space-x-1.5 mb-2">
                <History className="w-4 h-4 text-slate-500" />
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Immutable Audit Trail History
                </h4>
              </div>
              {inspectingSession.audit_logs && inspectingSession.audit_logs.length > 0 ? (
                <div className="space-y-1.5 max-h-36 overflow-y-auto text-xs">
                  {inspectingSession.audit_logs.map((log) => (
                    <div
                      key={log.id}
                      className="p-2 rounded bg-slate-50 border border-slate-200 flex items-center justify-between"
                    >
                      <span className="font-mono font-semibold text-slate-800">{log.action}</span>
                      <span className="text-slate-500 text-[11px]">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No audit records recorded.</p>
              )}
            </div>

            {/* Review Decision Form */}
            {inspectingSession.workflow_status === 'APPROVED' ? (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 space-y-1">
                <p className="font-bold flex items-center">
                  <CheckCircle2 className="w-4 h-4 mr-1.5 text-emerald-600" />
                  Finalized: APPROVED
                </p>
                <p className="text-emerald-700">
                  This application has been officially verified by compliance. Customer account is marked active and verified.
                </p>
              </div>
            ) : inspectingSession.workflow_status === 'REJECTED' ? (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 space-y-1">
                <p className="font-bold flex items-center">
                  <XCircle className="w-4 h-4 mr-1.5 text-red-600" />
                  Finalized: REJECTED
                </p>
                <p className="text-red-700">
                  Reason: {inspectingSession.rejection_reason || inspectingSession.failure_reason || 'Rejected by Admin'}
                </p>
              </div>
            ) : inspectingSession.workflow_status === 'CANCELLED' ? (
              <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-700 space-y-1">
                <p className="font-bold flex items-center">
                  <Ban className="w-4 h-4 mr-1.5 text-slate-500" />
                  Finalized: CANCELLED
                </p>
                <p className="text-slate-600">
                  This session was cancelled and cannot be reviewed or modified.
                </p>
              </div>
            ) : (
              <div className="space-y-4 pt-2 border-t border-slate-100">
                {/* Compliance Confirmation Checkbox */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-start space-x-2.5">
                  <input
                    type="checkbox"
                    id="compliance-reviewed"
                    checked={complianceReviewedConsent}
                    onChange={(e) => setComplianceReviewedConsent(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="compliance-reviewed" className="text-xs text-slate-700 cursor-pointer select-none">
                    <span className="font-semibold text-slate-900">Compliance Confirmation:</span> I confirm that I have reviewed the OCR extraction accuracy, inspected the biometric similarity indicators, and verified document plausibility.
                  </label>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Rejection Explanation Reason <span className="text-red-500">* (Mandatory if Rejecting, min 3 chars)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="e.g. Document photo is obscured; cardholder name does not match user account..."
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center justify-end space-x-3">
                  <Button
                    variant="outline"
                    size="md"
                    onClick={() => handleAdminDecision('REJECTED')}
                    isLoading={isSubmittingDecision}
                    className="text-red-600 border-red-300 hover:bg-red-50"
                    leftIcon={<XCircle className="w-4 h-4" />}
                  >
                    Reject Application
                  </Button>

                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => handleAdminDecision('APPROVED')}
                    isLoading={isSubmittingDecision}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    leftIcon={<Check className="w-4 h-4" />}
                  >
                    Approve Application
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
