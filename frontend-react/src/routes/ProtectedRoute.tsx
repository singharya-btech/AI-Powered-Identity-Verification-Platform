import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LoadingSpinner } from '../components/common/LoadingSpinner';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: ('ADMIN' | 'CUSTOMER')[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
}) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <LoadingSpinner size="lg" color="text-blue-600" />
        <p className="mt-4 text-sm font-medium text-slate-600">Verifying session credentials...</p>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    // Redirect unauthenticated user to login, preserving destination in state
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Role-Based Access Control
  if (allowedRoles && allowedRoles.length > 0) {
    const userRole = user.role?.name;
    if (!userRole || !allowedRoles.includes(userRole)) {
      // Unauthorized role - redirect CUSTOMER away from ADMIN routes
      const fallbackRedirect = userRole === 'CUSTOMER' ? '/customer' : '/admin';
      return <Navigate to={fallbackRedirect} replace />;
    }
  }

  return <>{children}</>;
};

