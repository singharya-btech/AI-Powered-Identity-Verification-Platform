import React, { useEffect, useState } from 'react';
import {
  Users,
  Search,
  RefreshCw,
  ShieldCheck,
  CheckCircle,
  XCircle,
  Mail,
  Calendar,
} from 'lucide-react';
import { authService } from '../../services/authService';
import { UserProfile, ApiErrorMessage } from '../../services/api';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchUsers = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await authService.getAdminUsers();
      setUsers(data);
    } catch (err) {
      const error = err as ApiErrorMessage;
      setErrorMessage(error.message || 'Failed to retrieve system user directory.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase().trim();
    return (
      u.full_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role?.name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              User Management
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
              Admin Restricted
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Live database records from <code className="text-slate-800 font-mono">GET /api/v1/auth/admin/users</code>
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchUsers}
            isLoading={isLoading}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh Directory
          </Button>
        </div>
      </div>

      {errorMessage && (
        <Alert
          type="error"
          title="Directory Fetch Error"
          message={errorMessage}
          onClose={() => setErrorMessage(null)}
        />
      )}

      {/* Filter Bar */}
      <Card padding="sm">
        <div className="flex items-center space-x-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by full name, email, or role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="text-xs text-slate-500 font-medium whitespace-nowrap">
            Showing {filteredUsers.length} of {users.length} registered users
          </div>
        </div>
      </Card>

      {/* Users Table */}
      <Card padding="none" className="overflow-hidden">
        {isLoading && users.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <LoadingSpinner size="lg" color="text-blue-600" />
            <p className="text-sm text-slate-600">Querying PostgreSQL user registry...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <Users className="w-10 h-10 text-slate-300 mx-auto" />
            <h4 className="text-base font-semibold text-slate-800">No users found</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {searchQuery
                ? 'No user records matched your search query criteria.'
                : 'No registered accounts exist in the database yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3.5 px-4 sm:px-6">User / Identity</th>
                  <th className="py-3.5 px-4 sm:px-6">Assigned Role</th>
                  <th className="py-3.5 px-4 sm:px-6">Account Status</th>
                  <th className="py-3.5 px-4 sm:px-6">KYC Verified</th>
                  <th className="py-3.5 px-4 sm:px-6">Registered At</th>
                  <th className="py-3.5 px-4 sm:px-6">User ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredUsers.map((item) => {
                  const isAdmin = item.role?.name === 'ADMIN';
                  const dateStr = item.created_at
                    ? new Date(item.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'N/A';

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Name & Email */}
                      <td className="py-4 px-4 sm:px-6">
                        <div className="flex items-center space-x-3">
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${
                              isAdmin
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {item.full_name ? item.full_name.charAt(0).toUpperCase() : '?'}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 leading-tight">
                              {item.full_name}
                            </p>
                            <p className="text-xs text-slate-500 flex items-center mt-0.5">
                              <Mail className="w-3 h-3 mr-1 text-slate-400" />
                              {item.email}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-4 px-4 sm:px-6">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            isAdmin
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}
                        >
                          {isAdmin ? (
                            <ShieldCheck className="w-3 h-3 mr-1 text-purple-600" />
                          ) : null}
                          {item.role?.name || 'CUSTOMER'}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4 sm:px-6">
                        {item.is_active ? (
                          <span className="inline-flex items-center text-xs font-medium text-emerald-700">
                            <CheckCircle className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-xs font-medium text-red-700">
                            <XCircle className="w-3.5 h-3.5 mr-1 text-red-600" />
                            Inactive
                          </span>
                        )}
                      </td>

                      {/* Verified */}
                      <td className="py-4 px-4 sm:px-6">
                        {item.is_verified ? (
                          <span className="inline-flex items-center text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                            Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            Unverified
                          </span>
                        )}
                      </td>

                      {/* Registration Date */}
                      <td className="py-4 px-4 sm:px-6 text-xs text-slate-600">
                        <div className="flex items-center space-x-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{dateStr}</span>
                        </div>
                      </td>

                      {/* ID */}
                      <td className="py-4 px-4 sm:px-6 text-xs font-mono text-slate-400 max-w-[120px] truncate" title={item.id}>
                        {item.id}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
