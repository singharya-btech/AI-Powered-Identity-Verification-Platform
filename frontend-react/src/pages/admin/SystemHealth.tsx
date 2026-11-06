import React, { useEffect, useState } from 'react';
import { Activity, Database, Server, RefreshCw, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { api } from '../../services/api';

interface HealthResponse {
  status: string;
  database: string;
  version: string;
  environment: string;
}

export const SystemHealth: React.FC = () => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<HealthResponse>('/api/v1/health');
      setHealth(response.data);
    } catch {
      setError('Could not reach backend health check endpoint.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            System & Database Health
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Live telemetry from <code className="text-slate-800 font-mono">GET /api/v1/health</code>
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchHealth}
            isLoading={loading}
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Probe Health
          </Button>
          <Link to="/admin">
            <Button variant="outline" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />}>
              Overview
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase text-slate-500">API Service</span>
            <Server className="w-5 h-5 text-blue-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">
            {health?.status === 'healthy' ? 'Online' : 'Operational'}
          </h3>
          <p className="text-xs text-slate-500 mt-1">FastAPI v{health?.version || '1.0.0'}</p>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase text-slate-500">PostgreSQL</span>
            <Database className="w-5 h-5 text-emerald-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">
            {health?.database === 'connected' ? 'Connected' : 'Degraded / Retrying'}
          </h3>
          <p className="text-xs text-slate-500 mt-1">Connection Pool Active</p>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase text-slate-500">Environment</span>
            <Activity className="w-5 h-5 text-purple-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 capitalize">
            {health?.environment || 'development'}
          </h3>
          <p className="text-xs text-slate-500 mt-1">Local Development Mode</p>
        </Card>
      </div>

      {error && (
        <Card className="bg-red-50 border-red-200">
          <p className="text-sm text-red-700">{error}</p>
        </Card>
      )}
    </div>
  );
};
