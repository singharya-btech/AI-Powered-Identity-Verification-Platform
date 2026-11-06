import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ShieldCheck, Mail, Lock, ArrowRight, Clock, AlertTriangle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Card } from '../components/common/Card';
import { Alert } from '../components/common/Alert';
import { ApiErrorMessage } from '../services/api';

export const Login: React.FC = () => {
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);

  // Check for redirected state messages (e.g., from successful registration or session expiry)
  useEffect(() => {
    const state = location.state as { message?: string; from?: { pathname?: string } } | null;
    if (state?.message) {
      setSuccessNotice(state.message);
    }
  }, [location.state]);

  // Rate limit countdown ticker
  useEffect(() => {
    if (retryCountdown === null || retryCountdown <= 0) return;

    const timer = setInterval(() => {
      setRetryCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [retryCountdown]);

  const validate = (): boolean => {
    const errors: { [key: string]: string } = {};

    if (!email.trim()) {
      errors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Please provide a valid email address';
    }

    if (!password) {
      errors.password = 'Password is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (retryCountdown && retryCountdown > 0) {
      setErrorMessage(`Login attempts temporarily throttled. Please wait ${retryCountdown} seconds.`);
      return;
    }

    if (!validate()) {
      return;
    }

    try {
      const authData = await login({
        email: email.trim().toLowerCase(),
        password,
      });

      // Role-Based Redirection based strictly on database response
      const targetRole = authData.user.role?.name;
      if (targetRole === 'ADMIN') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/customer', { replace: true });
      }
    } catch (err) {
      const error = err as ApiErrorMessage;

      // Handle HTTP 429 Rate Limiting
      if (error.status === 429) {
        const seconds = error.retryAfter || 60;
        setRetryCountdown(seconds);
        setErrorMessage(
          `Too many failed attempts. Security rate limiter active. Please retry in ${seconds} seconds.`
        );
      } else {
        setErrorMessage(error.message || 'Invalid credentials or connection error.');
      }
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-slate-50">
      <div className="max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-12 h-12 rounded-xl bg-blue-600 text-white items-center justify-center shadow-md">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Sign In to Platform
          </h2>
          <p className="text-sm text-slate-600">
            Enter your credentials to access your verification dashboard
          </p>
        </div>

        {/* Card */}
        <Card className="border border-slate-200">
          {successNotice && (
            <Alert
              type="success"
              message={successNotice}
              onClose={() => setSuccessNotice(null)}
              className="mb-4"
            />
          )}

          {errorMessage && (
            <Alert
              type="error"
              message={errorMessage}
              onClose={() => setErrorMessage(null)}
              className="mb-4"
            />
          )}

          {retryCountdown !== null && retryCountdown > 0 && (
            <div className="mb-4 p-3.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center space-x-3 text-xs text-amber-800">
              <Clock className="w-4 h-4 text-amber-600 flex-shrink-0 animate-spin" />
              <div>
                <span className="font-semibold">Security Lockout Active:</span> You can try logging in again in{' '}
                <strong className="text-amber-950 font-bold">{retryCountdown}s</strong>.
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Address */}
            <Input
              label="Email Address"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={formErrors.email}
              leftIcon={<Mail className="w-4 h-4" />}
              required
              disabled={isLoading || (retryCountdown !== null && retryCountdown > 0)}
            />

            {/* Password */}
            <Input
              label="Password"
              showPasswordToggle
              placeholder="Enter your account password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={formErrors.password}
              leftIcon={<Lock className="w-4 h-4" />}
              required
              disabled={isLoading || (retryCountdown !== null && retryCountdown > 0)}
            />

            {/* Remember Me note */}
            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center space-x-2 text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Remember me</span>
              </label>

              <span className="text-slate-400 text-[11px] flex items-center">
                <AlertTriangle className="w-3 h-3 mr-1 text-slate-400" />
                In-memory session token
              </span>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isLoading}
              disabled={retryCountdown !== null && retryCountdown > 0}
              className="w-full mt-2"
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Sign In
            </Button>
          </form>

          {/* Footer Link */}
          <div className="mt-6 text-center text-xs text-slate-600">
            Don&apos;t have an account yet?{' '}
            <Link to="/register" className="font-semibold text-blue-600 hover:text-blue-700">
              Create an Account
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
};

