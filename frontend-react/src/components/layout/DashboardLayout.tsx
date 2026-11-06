import React, { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  LayoutDashboard,
  Users,
  FileCheck,
  Activity,
  LogOut,
  Menu,
  X,
  User,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../common/Button';

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
}

export const DashboardLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const isAdmin = user?.role?.name === 'ADMIN';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const adminNavItems: NavItem[] = [
    {
      name: 'Overview',
      href: '/admin',
      icon: <LayoutDashboard className="w-5 h-5" />,
    },
    {
      name: 'User Management',
      href: '/admin/users',
      icon: <Users className="w-5 h-5" />,
    },
    {
      name: 'Verification Requests',
      href: '/admin/verifications',
      icon: <FileCheck className="w-5 h-5" />,
    },
    {
      name: 'Audit & Health',
      href: '/admin/system',
      icon: <Activity className="w-5 h-5" />,
    },
  ];

  const customerNavItems: NavItem[] = [
    {
      name: 'Dashboard',
      href: '/customer',
      icon: <LayoutDashboard className="w-5 h-5" />,
    },
    {
      name: 'Start KYC Verification',
      href: '/customer/verify',
      icon: <FileCheck className="w-5 h-5" />,
    },
  ];

  const navItems = isAdmin ? adminNavItems : customerNavItems;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <span className="font-bold text-slate-900">VeriFace AI</span>
        </Link>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100"
          aria-label="Open sidebar"
        >
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform transition-transform duration-200 ease-in-out md:translate-x-0 md:static md:inset-auto md:flex md:flex-col ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand header */}
        <div className="h-16 px-6 border-b border-slate-200 flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold text-slate-900 leading-none">
                VeriFace <span className="text-blue-600">AI</span>
              </span>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium mt-0.5">
                {isAdmin ? 'Admin Console' : 'Customer Portal'}
              </span>
            </div>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Card */}
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center space-x-3 p-2 bg-slate-50 rounded-lg border border-slate-200/80">
            <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
              {user?.full_name ? user.full_name.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">
                {user?.full_name || 'User'}
              </p>
              <div className="flex items-center space-x-1.5 mt-0.5">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    isAdmin ? 'bg-purple-500' : 'bg-emerald-500'
                  }`}
                />
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                  {user?.role?.name || 'CUSTOMER'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <span className={isActive ? 'text-blue-600' : 'text-slate-400'}>
                    {item.icon}
                  </span>
                  <span>{item.name}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-200 space-y-2">
          <a
            href="http://127.0.0.1:8000/api/v1/docs"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <span className="flex items-center space-x-2">
              <Activity className="w-3.5 h-3.5 text-blue-500" />
              <span>Swagger API Docs</span>
            </span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </a>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            leftIcon={<LogOut className="w-4 h-4 text-slate-400" />}
            className="w-full justify-start text-slate-600 hover:text-red-600 hover:bg-red-50"
          >
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Backdrop for mobile */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm md:hidden"
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Top bar on desktop */}
        <header className="hidden md:flex h-16 bg-white border-b border-slate-200 px-8 items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-slate-900">
              {isAdmin ? 'System Administration Console' : 'Customer Verification Portal'}
            </h1>
          </div>
          <div className="flex items-center space-x-4">
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                isAdmin
                  ? 'bg-purple-100 text-purple-800 border border-purple-200'
                  : 'bg-blue-100 text-blue-800 border border-blue-200'
              }`}
            >
              Role: {user?.role?.name}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              leftIcon={<LogOut className="w-3.5 h-3.5" />}
            >
              Sign Out
            </Button>
          </div>
        </header>

        {/* Content Body */}
        <div className="p-4 sm:p-6 lg:p-8 flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

