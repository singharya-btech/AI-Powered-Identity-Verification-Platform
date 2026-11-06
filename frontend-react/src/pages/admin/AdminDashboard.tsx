import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  UserCheck,
  Activity,
  ArrowRight,
  RefreshCw,
  FileCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  Download,
  ScanFace,
  Percent,
} from 'lucide-react';
import { authService } from '../../services/authService';
import { kycService, AdminAnalytics } from '../../services/kycService';
import { UserProfile, ApiErrorMessage } from '../../services/api';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';

export const AdminDashboard: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExportingCsv, setIsExportingCsv] = useState<boolean>(false);
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [usersData, analyticsData] = await Promise.all([
        authService.getAdminUsers(),
        kycService.getAdminAnalytics(),
      ]);
      setUsers(usersData);
      setAnalytics(analyticsData);
    } catch (err) {
      const error = err as ApiErrorMessage;
      setErrorMessage(error.message || 'Unable to retrieve administrative statistics from PostgreSQL.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleExportCsv = async () => {
    setIsExportingCsv(true);
    setExportNotice(null);
    try {
      const blob = await kycService.exportReportsCsv();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      kycService.downloadBlob(blob, `kyc_audit_report_${timestamp}.csv`);
      setExportNotice('CSV compliance report exported successfully.');
    } catch (err) {
      const error = err as ApiErrorMessage;
      setErrorMessage(error.message || 'Failed to export CSV report.');
    } finally {
      setIsExportingCsv(false);
    }
  };

  const handleExportExcel = async () => {
    setIsExportingExcel(true);
    setExportNotice(null);
    try {
      const blob = await kycService.exportReportsExcel();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      kycService.downloadBlob(blob, `kyc_compliance_report_${timestamp}.xlsx`);
      setExportNotice('Excel (.xlsx) compliance workbook exported successfully.');
    } catch (err) {
      const error = err as ApiErrorMessage;
      setErrorMessage(error.message || 'Failed to export Excel report.');
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Safe metrics fallbacks
  const totalUsers = users.length;
  const adminCount = users.filter((u) => u.role?.name === 'ADMIN').length;
  const activeCount = users.filter((u) => u.is_active).length;

  const totalApps = analytics?.total_applications ?? 0;
  const approvedApps = analytics?.approved_applications ?? 0;
  const rejectedApps = analytics?.rejected_applications ?? 0;
  const pendingApps = analytics?.pending_review_applications ?? 0;
  const cancelledApps = analytics?.cancelled_applications ?? 0;
  const totalCustomers = analytics?.total_customers ?? users.filter((u) => u.role?.name === 'CUSTOMER').length;
  const faceMatches = analytics?.face_matches ?? 0;
  const faceMismatches = analytics?.face_mismatches ?? 0;
  const submittedToday = analytics?.submitted_today ?? 0;
  const submittedThisWeek = analytics?.submitted_this_week ?? 0;

  // Percentage calculations
  const approvalRate = totalApps > 0 ? Math.round((approvedApps / totalApps) * 100) : 0;
  const rejectionRate = totalApps > 0 ? Math.round((rejectedApps / totalApps) * 100) : 0;
  const pendingRate = totalApps > 0 ? Math.round((pendingApps / totalApps) * 100) : 0;
  const totalFaceComparisons = faceMatches + faceMismatches;
  const faceMatchRate = totalFaceComparisons > 0 ? Math.round((faceMatches / totalFaceComparisons) * 100) : 0;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Administrator Compliance Console
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
              Admin Access
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Real-time compliance analytics, audit metrics and verification controls backed by PostgreSQL
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            isLoading={isLoading}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh Telemetry
          </Button>

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

          <Link to="/admin/verifications">
            <Button
              variant="primary"
              size="sm"
              rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
            >
              Verification Queue
            </Button>
          </Link>
        </div>
      </div>

      {exportNotice && (
        <Alert
          type="success"
          title="Export Ready"
          message={exportNotice}
          onClose={() => setExportNotice(null)}
        />
      )}

      {errorMessage && (
        <Alert
          type="error"
          title="Administrative Sync Error"
          message={errorMessage}
          onClose={() => setErrorMessage(null)}
        />
      )}

      {/* Primary KPI Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Registered Customers
              </p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">
                {isLoading ? <LoadingSpinner size="sm" /> : totalCustomers}
              </h3>
            </div>
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <UserCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 flex justify-between">
            <span>{totalUsers} total system users</span>
            <span className="font-medium text-slate-700">{activeCount} active</span>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total KYC Applications
              </p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">
                {isLoading ? <LoadingSpinner size="sm" /> : totalApps}
              </h3>
            </div>
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <FileCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 flex justify-between">
            <span>{submittedToday} today</span>
            <span className="font-semibold text-slate-700">{submittedThisWeek} this week</span>
          </div>
        </Card>

        <Card className={pendingApps > 0 ? 'ring-2 ring-amber-400 bg-amber-50/20' : ''}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                Pending Compliance Review
              </p>
              <h3 className="text-2xl font-bold text-amber-900 mt-1">
                {isLoading ? <LoadingSpinner size="sm" /> : pendingApps}
              </h3>
            </div>
            <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-amber-200/60 text-xs text-amber-800 flex justify-between items-center">
            <span>Awaiting compliance officer</span>
            <Link to="/admin/verifications" className="font-bold underline hover:text-amber-900">
              Review Now →
            </Link>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                Approved Verifications
              </p>
              <h3 className="text-2xl font-bold text-emerald-900 mt-1">
                {isLoading ? <LoadingSpinner size="sm" /> : approvedApps}
              </h3>
            </div>
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 flex justify-between">
            <span>Approval Rate</span>
            <span className="font-bold text-emerald-700">{approvalRate}%</span>
          </div>
        </Card>
      </div>

      {/* Secondary Metrics: Rejections, Cancellations, Biometrics, and Activity */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-red-600">
                Rejected Applications
              </p>
              <h3 className="text-2xl font-bold text-red-900 mt-1">
                {isLoading ? <LoadingSpinner size="sm" /> : rejectedApps}
              </h3>
            </div>
            <div className="p-2.5 bg-red-50 text-red-600 rounded-xl">
              <XCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 flex justify-between">
            <span>Rejection Rate</span>
            <span className="font-semibold text-red-700">{rejectionRate}%</span>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Cancelled Applications
              </p>
              <h3 className="text-2xl font-bold text-slate-800 mt-1">
                {isLoading ? <LoadingSpinner size="sm" /> : cancelledApps}
              </h3>
            </div>
            <div className="p-2.5 bg-slate-100 text-slate-600 rounded-xl">
              <Ban className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
            Abandoned or cancelled by applicant
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-purple-600">
                FaceNet Biometrics
              </p>
              <h3 className="text-2xl font-bold text-purple-900 mt-1">
                {isLoading ? <LoadingSpinner size="sm" /> : `${faceMatches} / ${totalFaceComparisons}`}
              </h3>
            </div>
            <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
              <ScanFace className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 flex justify-between">
            <span>Biometric Match Rate</span>
            <span className="font-bold text-purple-700">{faceMatchRate}%</span>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Staff / Administrators
              </p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">
                {isLoading ? <LoadingSpinner size="sm" /> : adminCount}
              </h3>
            </div>
            <div className="p-2.5 bg-slate-100 text-slate-700 rounded-xl">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
            Provisioned compliance officers
          </div>
        </Card>
      </div>

      {/* Analytics Breakdown & Queue Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Status Breakdown & Recent Activity */}
        <div className="lg:col-span-2 space-y-6">
          {/* Status Breakdown Bar Card */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Verification Lifecycle Distribution
                </h2>
                <p className="text-xs text-slate-500">
                  PostgreSQL-backed application state breakdown
                </p>
              </div>
              <div className="flex items-center space-x-1 text-xs text-slate-500">
                <Percent className="w-3.5 h-3.5" />
                <span>Total: {totalApps}</span>
              </div>
            </div>

            {totalApps === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No KYC applications have been recorded yet in PostgreSQL.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Visual Progress Bar */}
                <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                  <div
                    style={{ width: `${(approvedApps / totalApps) * 100}%` }}
                    className="bg-emerald-500 transition-all duration-500"
                    title={`Approved: ${approvedApps}`}
                  />
                  <div
                    style={{ width: `${(pendingApps / totalApps) * 100}%` }}
                    className="bg-amber-400 transition-all duration-500"
                    title={`Pending Review: ${pendingApps}`}
                  />
                  <div
                    style={{ width: `${(rejectedApps / totalApps) * 100}%` }}
                    className="bg-red-500 transition-all duration-500"
                    title={`Rejected: ${rejectedApps}`}
                  />
                  <div
                    style={{ width: `${(cancelledApps / totalApps) * 100}%` }}
                    className="bg-slate-400 transition-all duration-500"
                    title={`Cancelled: ${cancelledApps}`}
                  />
                </div>

                {/* Legend and Counts */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2">
                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-100">
                    <div className="flex items-center space-x-1.5 text-emerald-800 font-bold">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <span>Approved</span>
                    </div>
                    <p className="text-lg font-extrabold text-emerald-900 mt-1">{approvedApps}</p>
                    <p className="text-[11px] text-emerald-700">{approvalRate}% of applications</p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-100">
                    <div className="flex items-center space-x-1.5 text-amber-800 font-bold">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <span>Pending</span>
                    </div>
                    <p className="text-lg font-extrabold text-amber-900 mt-1">{pendingApps}</p>
                    <p className="text-[11px] text-amber-700">{pendingRate}% of applications</p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-red-50 border border-red-100">
                    <div className="flex items-center space-x-1.5 text-red-800 font-bold">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                      <span>Rejected</span>
                    </div>
                    <p className="text-lg font-extrabold text-red-900 mt-1">{rejectedApps}</p>
                    <p className="text-[11px] text-red-700">{rejectionRate}% of applications</p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex items-center space-x-1.5 text-slate-700 font-bold">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                      <span>Cancelled</span>
                    </div>
                    <p className="text-lg font-extrabold text-slate-800 mt-1">{cancelledApps}</p>
                    <p className="text-[11px] text-slate-600">
                      {totalApps > 0 ? Math.round((cancelledApps / totalApps) * 100) : 0}% of total
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Biometric Verification Telemetry Card */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <ScanFace className="w-5 h-5 text-purple-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Biometric Facial Verification Telemetry
                </h3>
              </div>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-purple-100 text-purple-800">
                Local FaceNet 512D
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-3 rounded-xl bg-purple-50 border border-purple-100">
                <span className="text-purple-700 font-semibold">Face Matches</span>
                <p className="text-xl font-bold text-purple-900 mt-1">{faceMatches}</p>
                <p className="text-[11px] text-purple-600 mt-0.5">Cosine distance &lt; 0.40</p>
              </div>

              <div className="p-3 rounded-xl bg-red-50 border border-red-100">
                <span className="text-red-700 font-semibold">Face Mismatches</span>
                <p className="text-xl font-bold text-red-900 mt-1">{faceMismatches}</p>
                <p className="text-[11px] text-red-600 mt-0.5">Cosine distance &ge; 0.40</p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-600 font-semibold">Submissions Today</span>
                <div className="flex items-baseline space-x-1 mt-1">
                  <p className="text-xl font-bold text-slate-900">{submittedToday}</p>
                  <span className="text-slate-500 text-[11px]">({submittedThisWeek} this week)</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">UTC calendar window</p>
              </div>
            </div>
          </Card>

          {/* Recent Accounts Preview */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-900">Recently Registered Accounts</h2>
              <Link to="/admin/users" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                Manage all accounts →
              </Link>
            </div>

            {users.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No user accounts found in the database.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {users.slice(0, 5).map((u) => (
                  <div key={u.id} className="py-3 flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-700">
                        {u.full_name?.charAt(0) || 'U'}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{u.full_name}</p>
                        <p className="text-slate-500">{u.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {u.is_verified && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                          Verified
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          u.role?.name === 'ADMIN'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {u.role?.name}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right 1 Col: Quick Compliance Review Actions & System Info */}
        <div className="space-y-6">
          {/* Quick Review Navigation Card */}
          <Card className="border-l-4 border-l-blue-600">
            <h3 className="text-base font-bold text-slate-900 mb-2">Compliance Verification</h3>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Examine OCR extractions, check masked identifiers, inspect FaceNet comparison distances,
              and approve or reject customer applications.
            </p>
            <div className="space-y-2.5">
              <Link to="/admin/verifications" className="block">
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full justify-center"
                  rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                >
                  Open Verification Queue ({pendingApps} pending)
                </Button>
              </Link>
            </div>
          </Card>

          {/* Quick Reports Card */}
          <Card>
            <div className="flex items-center space-x-2 mb-3">
              <Download className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">Compliance Audit Reports</h3>
            </div>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Export comprehensive verification records with masked PII and spreadsheet formula injection defenses (CWE-1236).
            </p>
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                isLoading={isExportingCsv}
                className="w-full justify-center"
                leftIcon={<Download className="w-3.5 h-3.5" />}
              >
                Download CSV Report (.csv)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                isLoading={isExportingExcel}
                className="w-full justify-center"
                leftIcon={<Download className="w-3.5 h-3.5" />}
              >
                Download Excel Report (.xlsx)
              </Button>
            </div>
          </Card>

          {/* System & Architecture Telemetry */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">System Telemetry</h3>
              <Activity className="w-4 h-4 text-emerald-600" />
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-600">Database Engine</span>
                <span className="font-semibold text-emerald-700">PostgreSQL (Indexed)</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-600">OCR Model</span>
                <span className="font-semibold text-blue-700">EasyOCR + OpenCV</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-600">Biometric Model</span>
                <span className="font-semibold text-purple-700">FaceNet 512D Local</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-600">Audit Trail</span>
                <span className="font-semibold text-slate-800">Append-Only Immutability</span>
              </div>
            </div>
          </Card>

          {/* Administrator Security Notice */}
          <Card className="bg-slate-50 border border-slate-200">
            <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider mb-2">
              Compliance Officer Notice
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Biometric similarity scores and OCR extractions serve as verification aids. As Administrator,
              confirm document legitimacy and inspect audit chronology before approving accounts.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
};
