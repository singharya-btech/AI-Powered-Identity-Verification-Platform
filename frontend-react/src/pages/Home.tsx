import React from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  FileSearch,
  UserCheck,
  Lock,
  ArrowRight,
  Database,
  CheckCircle2,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { useAuth } from '../hooks/useAuth';

export const Home: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const dashboardPath = user?.role?.name === 'ADMIN' ? '/admin' : '/customer';

  return (
    <div className="space-y-20 pb-16">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-50/70 via-white to-slate-50 pt-16 pb-20 lg:pt-24 lg:pb-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-6">
            {/* Status Pill */}
            <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-blue-100/80 border border-blue-200 text-xs font-semibold text-blue-800">
              <span className="flex h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
              <span>AI-Powered Local Document Verification Platform</span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-tight">
              Enterprise Identity Verification Powered by{' '}
              <span className="text-blue-600">Local AI Pipelines</span>
            </h1>

            {/* Subheadline with Honest Scope Disclosure */}
            <p className="text-lg sm:text-xl text-slate-600 leading-relaxed font-normal">
              Automated document text extraction with EasyOCR and bi-modal facial similarity
              verification using DeepFace. Built with FastAPI, PostgreSQL, and strict data
              minimization principles.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
              {isAuthenticated ? (
                <Link to={dashboardPath}>
                  <Button size="lg" variant="primary" rightIcon={<ArrowRight className="w-5 h-5" />}>
                    Enter Your Dashboard
                  </Button>
                </Link>
              ) : (
                <>
                  <Link to="/register">
                    <Button size="lg" variant="primary" rightIcon={<ArrowRight className="w-5 h-5" />}>
                      Start Verification
                    </Button>
                  </Link>
                  <Link to="/login">
                    <Button size="lg" variant="outline">
                      Sign In to Account
                    </Button>
                  </Link>
                </>
              )}
            </div>

            {/* Trust Highlights */}
            <div className="pt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-500">
              <span className="flex items-center">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 mr-1.5" />
                Zero PII Database Storage
              </span>
              <span className="flex items-center">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 mr-1.5" />
                Bcrypt (rounds=12) Hashed Credentials
              </span>
              <span className="flex items-center">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 mr-1.5" />
                Sliding-Window Rate Limiting
              </span>
            </div>
          </div>

          {/* Transparent Notice Banner */}
          <div className="mt-12 max-w-4xl mx-auto bg-amber-50/90 border border-amber-200/90 rounded-xl p-4 sm:p-5 flex items-start space-x-3.5 shadow-sm">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm text-amber-900 leading-relaxed">
              <strong className="font-semibold text-amber-950">Architecture & Compliance Notice:</strong>{' '}
              This platform executes local, privacy-preserving computer vision pipelines (OpenCV,
              EasyOCR, and FaceNet biometrics). It operates independently and does{' '}
              <strong className="underline">not</strong> query live government portal APIs (UIDAI/ITD)
              nor claim legal government authentication guarantees. All processing complies strictly
              with data minimization guidelines under the Digital Personal Data Protection (DPDP) Act 2023.
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-xs font-bold uppercase tracking-wider text-blue-600">Core Capabilities</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            Engineered for Privacy, Precision & Performance
          </p>
          <p className="mt-3 text-slate-600 text-sm">
            Our multi-stage verification architecture keeps document processing local, secure, and auditable.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="hover:border-blue-300 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-4">
              <FileSearch className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-2">Automated Document OCR</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              OpenCV-based document boundary extraction, perspective skew correction, and EasyOCR text
              extraction parsing names and document identifiers locally.
            </p>
          </Card>

          <Card className="hover:border-blue-300 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-4">
              <UserCheck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-2">Facial Biometric Match</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              DeepFace and FaceNet cosine similarity comparisons matching the document photo with the
              user&apos;s captured selfie, computing confidence distance vectors without cloud egress.
            </p>
          </Card>

          <Card className="hover:border-blue-300 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-4">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-2">Zero PII Persistence</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              In accordance with UIDAI regulations, no raw Aadhaar numbers, PAN numbers, or facial embeddings
              are stored in the relational database. Only session lifecycle state is retained.
            </p>
          </Card>

          <Card className="hover:border-blue-300 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-4">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-2">Role-Based Access Control</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Strict separation between Customer and Administrator roles. Public registration strictly
              defaults to Customer, while Admin credentials require dedicated offline CLI provisioning.
            </p>
          </Card>

          <Card className="hover:border-blue-300 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-4">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-2">Brute-Force Protection</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Sliding window rate limiters throttle login attempts (5 failed attempts per 15-minute window),
              accompanied by standard HTTP 429 response codes and Retry-After delay headers.
            </p>
          </Card>

          <Card className="hover:border-blue-300 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-4">
              <Database className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-2">PostgreSQL & Alembic</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Robust SQLAlchemy 2.x ORM schemas with full connection pooling, health probes, and tracked
              database migrations ensuring dependable schema evolution.
            </p>
          </Card>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="bg-slate-100/70 py-16 border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-xs font-bold uppercase tracking-wider text-blue-600">The Verification Workflow</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              Four Steps to Verified Identity
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm mb-4">
                1
              </div>
              <h4 className="text-base font-semibold text-slate-900 mb-2">Account Registration</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Create an account with email and password complexity validation. Safe customer role assigned automatically.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm mb-4">
                2
              </div>
              <h4 className="text-base font-semibold text-slate-900 mb-2">Document OCR Scan</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Upload Aadhaar or PAN card. Preprocessing crops the document, improves contrast, and extracts text.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm mb-4">
                3
              </div>
              <h4 className="text-base font-semibold text-slate-900 mb-2">Biometric Face Match</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Live webcam selfie capture is compared against the document portrait utilizing DeepFace neural embeddings.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm mb-4">
                4
              </div>
              <h4 className="text-base font-semibold text-slate-900 mb-2">Session Audit Recorded</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                A verification session record and tamper-evident audit log are saved in PostgreSQL with status results.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Security & Privacy Section */}
      <section id="security" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-slate-900 text-white rounded-2xl p-8 sm:p-12 shadow-md">
          <div className="max-w-3xl space-y-6">
            <div className="inline-flex items-center space-x-2 text-xs font-semibold text-blue-400 uppercase tracking-wider">
              <Lock className="w-4 h-4" />
              <span>Data Protection & Cryptography</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Designed from the Ground Up with Zero PII Persistence
            </h2>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              We treat identity data with the highest sensitivity. During verification, document images
              and extracted face vectors are evaluated strictly within temporary memory. Once the similarity
              score and OCR checks complete, raw identifiers are discarded, leaving only an anonymized
              session record in PostgreSQL.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-800">
              <div>
                <p className="text-2xl font-bold text-blue-400">0</p>
                <p className="text-xs text-slate-400 mt-1">Raw Aadhaar/PAN stored in DB</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-400">12</p>
                <p className="text-xs text-slate-400 mt-1">Bcrypt Salt Rounds for Passwords</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-400">100%</p>
                <p className="text-xs text-slate-400 mt-1">Local Model Execution</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
