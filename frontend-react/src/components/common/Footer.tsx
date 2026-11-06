import React from 'react';
import { ShieldCheck, Lock, FileText, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-900 text-slate-400 text-sm border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand & Purpose */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <span className="text-base font-bold text-white tracking-tight">
                VeriFace <span className="text-blue-400">AI</span>
              </span>
            </div>
            <p className="text-slate-400 text-sm max-w-md leading-relaxed">
              An enterprise AI-driven electronic Know Your Customer platform leveraging local
              optical character recognition (OCR) and facial feature similarity analysis.
            </p>
            {/* Regulatory & Functional Disclaimer */}
            <div className="p-3.5 bg-slate-800/80 rounded-lg border border-slate-700/60 text-xs text-slate-300 leading-relaxed">
              <span className="font-semibold text-amber-400">Transparency Notice:</span> This application
              executes local automated document text extraction and biometric facial comparison algorithms.
              It does <strong className="text-white">not</strong> claim government portal authentication
              nor guarantee absolute document authenticity. Zero personal identity information (PII) is
              persisted unencrypted.
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3">
              Platform
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/" className="hover:text-white transition-colors">
                  Overview
                </Link>
              </li>
              <li>
                <a href="/#features" className="hover:text-white transition-colors">
                  Features
                </a>
              </li>
              <li>
                <a href="/#how-it-works" className="hover:text-white transition-colors">
                  Verification Pipeline
                </a>
              </li>
              <li>
                <a href="/#security" className="hover:text-white transition-colors">
                  Security Standards
                </a>
              </li>
            </ul>
          </div>

          {/* Compliance & Links */}
          <div>
            <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3">
              Compliance & API
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="http://127.0.0.1:8000/api/v1/docs"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center hover:text-white transition-colors"
                >
                  <FileText className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
                  Swagger API Docs
                  <ExternalLink className="w-3 h-3 ml-1" />
                </a>
              </li>
              <li className="flex items-center text-slate-400">
                <Lock className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                DPDP Act 2023 Principles
              </li>
              <li className="flex items-center text-slate-400">
                <ShieldCheck className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
                Zero PII Data Minimization
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500">
          <p>© {new Date().getFullYear()} VeriFace AI Platform. All rights reserved.</p>
          <p className="mt-2 sm:mt-0">
            Powered by FastAPI, PostgreSQL, EasyOCR & DeepFace
          </p>
        </div>
      </div>
    </footer>
  );
};

