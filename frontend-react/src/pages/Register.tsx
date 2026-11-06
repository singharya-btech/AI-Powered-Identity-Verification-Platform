import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, User, Mail, Lock, CheckCircle2, ArrowRight } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Card } from '../components/common/Card';
import { Alert } from '../components/common/Alert';
import { ApiErrorMessage } from '../services/api';

export const Register: React.FC = () => {
  const { register, isLoading } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  // Password complexity checks
  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    digit: /\d/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>_\-+=[\]~]/.test(password),
  };

  const isPasswordValid = Object.values(checks).every(Boolean);

  const validate = (): boolean => {
    const errors: { [key: string]: string } = {};

    if (!fullName.trim()) {
      errors.fullName = 'Full name is required';
    } else if (fullName.trim().length < 2) {
      errors.fullName = 'Full name must be at least 2 characters';
    }

    if (!email.trim()) {
      errors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Please provide a valid email address';
    }

    if (!password) {
      errors.password = 'Password is required';
    } else if (!isPasswordValid) {
      errors.password = 'Password does not meet the complexity requirements';
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!validate()) {
      return;
    }

    try {
      await register({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
      });

      setIsSuccess(true);
      setTimeout(() => {
        navigate('/login', {
          state: { message: 'Registration successful! Please sign in with your credentials.' },
        });
      }, 2000);
    } catch (err) {
      const error = err as ApiErrorMessage;
      setServerError(error.message || 'Registration failed. Please try again.');
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
            Create Customer Account
          </h2>
          <p className="text-sm text-slate-600">
            Get started with AI-powered local identity verification
          </p>
        </div>

        {/* Card */}
        <Card className="border border-slate-200">
          {serverError && (
            <Alert
              type="error"
              message={serverError}
              onClose={() => setServerError(null)}
              className="mb-4"
            />
          )}

          {isSuccess && (
            <Alert
              type="success"
              title="Account Created"
              message="Registration successful! Redirecting you to the sign-in page..."
              className="mb-4"
            />
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name */}
            <Input
              label="Full Name"
              type="text"
              placeholder="e.g. Aarav Sharma"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              error={formErrors.fullName}
              leftIcon={<User className="w-4 h-4" />}
              required
              disabled={isLoading || isSuccess}
            />

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
              disabled={isLoading || isSuccess}
            />

            {/* Password */}
            <Input
              label="Password"
              showPasswordToggle
              placeholder="Create a strong password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={formErrors.password}
              leftIcon={<Lock className="w-4 h-4" />}
              required
              disabled={isLoading || isSuccess}
            />

            {/* Password Complexity Checklist */}
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1 text-xs text-slate-600">
              <p className="font-semibold text-slate-700 mb-1.5">Password Requirements:</p>
              <div className="grid grid-cols-2 gap-1.5">
                <span className={`flex items-center ${checks.length ? 'text-emerald-700 font-medium' : 'text-slate-500'}`}>
                  <CheckCircle2 className={`w-3.5 h-3.5 mr-1 ${checks.length ? 'text-emerald-600' : 'text-slate-300'}`} />
                  At least 8 chars
                </span>
                <span className={`flex items-center ${checks.uppercase ? 'text-emerald-700 font-medium' : 'text-slate-500'}`}>
                  <CheckCircle2 className={`w-3.5 h-3.5 mr-1 ${checks.uppercase ? 'text-emerald-600' : 'text-slate-300'}`} />
                  Uppercase letter
                </span>
                <span className={`flex items-center ${checks.lowercase ? 'text-emerald-700 font-medium' : 'text-slate-500'}`}>
                  <CheckCircle2 className={`w-3.5 h-3.5 mr-1 ${checks.lowercase ? 'text-emerald-600' : 'text-slate-300'}`} />
                  Lowercase letter
                </span>
                <span className={`flex items-center ${checks.digit ? 'text-emerald-700 font-medium' : 'text-slate-500'}`}>
                  <CheckCircle2 className={`w-3.5 h-3.5 mr-1 ${checks.digit ? 'text-emerald-600' : 'text-slate-300'}`} />
                  At least one digit
                </span>
                <span className={`flex items-center col-span-2 ${checks.special ? 'text-emerald-700 font-medium' : 'text-slate-500'}`}>
                  <CheckCircle2 className={`w-3.5 h-3.5 mr-1 ${checks.special ? 'text-emerald-600' : 'text-slate-300'}`} />
                  Special symbol (!@#$%^&*...)
                </span>
              </div>
            </div>

            {/* Confirm Password */}
            <Input
              label="Confirm Password"
              showPasswordToggle
              placeholder="Repeat your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={formErrors.confirmPassword}
              leftIcon={<Lock className="w-4 h-4" />}
              required
              disabled={isLoading || isSuccess}
            />

            {/* Role Notice */}
            <div className="text-[11px] text-slate-500 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
              <span className="font-semibold text-slate-700">Account Access:</span> Public registration
              provisions a verified <strong className="text-slate-800">Customer</strong> role. Administrative
              credentials must be provisioned via offline CLI tooling.
            </div>

            {/* Submit */}
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isLoading}
              disabled={isSuccess}
              className="w-full mt-2"
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Register Account
            </Button>
          </form>

          {/* Footer Link */}
          <div className="mt-6 text-center text-xs text-slate-600">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-700">
              Sign In
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
};

