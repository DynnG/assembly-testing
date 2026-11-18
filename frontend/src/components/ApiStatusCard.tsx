import React from 'react';
import { Activity, Key, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Send } from 'lucide-react';

interface ApiStatusCardProps {
  backendOnline: boolean | null;
  apiKeyConfigured: boolean | null;
  onRefreshHealth: () => Promise<void>;
  onTestConnection: () => Promise<void>;
  isTesting: boolean;
  testResult: {
    success: boolean;
    message: string;
    error?: string;
    status_code?: number;
  } | null;
}

export const ApiStatusCard: React.FC<ApiStatusCardProps> = ({
  backendOnline,
  apiKeyConfigured,
  onRefreshHealth,
  onTestConnection,
  isTesting,
  testResult,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg shadow-black/20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-cyan-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">API Connection & Status</h2>
            <p className="text-xs text-slate-400">
              Verifies FastAPI backend reachability and AssemblyAI authentication
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefreshHealth}
            disabled={isTesting}
            title="Refresh backend status"
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors disabled:opacity-50 text-xs flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={onTestConnection}
            disabled={isTesting || backendOnline === false}
            className="px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white font-medium text-xs flex items-center gap-2 transition-all shadow-md shadow-teal-950/40 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isTesting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Verifying with AssemblyAI...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Test API Connection</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Status Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
        {/* Backend Status */}
        <div className="bg-slate-800/50 border border-slate-800 rounded-lg p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-500 shrink-0" />
            <div>
              <div className="text-xs font-medium text-slate-300">FastAPI Backend</div>
              <div className="text-[11px] text-slate-500">http://127.0.0.1:8000</div>
            </div>
          </div>
          <div>
            {backendOnline === null ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
                <RefreshCw className="w-3 h-3 animate-spin" /> Checking
              </span>
            ) : backendOnline ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="w-3.5 h-3.5" /> Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30">
                <XCircle className="w-3.5 h-3.5" /> Disconnected
              </span>
            )}
          </div>
        </div>

        {/* AssemblyAI Key Status */}
        <div className="bg-slate-800/50 border border-slate-800 rounded-lg p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Key className="w-4 h-4 text-cyan-400 shrink-0" />
            <div>
              <div className="text-xs font-medium text-slate-300">AssemblyAI Configuration</div>
              <div className="text-[11px] text-slate-500">backend/.env</div>
            </div>
          </div>
          <div>
            {apiKeyConfigured === null ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
                <RefreshCw className="w-3 h-3 animate-spin" /> Checking
              </span>
            ) : apiKeyConfigured ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="w-3.5 h-3.5" /> Configured
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
                <AlertTriangle className="w-3.5 h-3.5" /> Missing API Key
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Disconnected Backend Warning */}
      {backendOnline === false && (
        <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg flex items-start gap-2.5 text-xs text-rose-300">
          <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Backend server is offline:</span> Please make sure the FastAPI server is running with:
            <code className="block mt-1 font-mono bg-rose-950/40 text-rose-200 px-2 py-1 rounded border border-rose-800/40">
              .\backend\venv\Scripts\uvicorn.exe main:app --reload --port 8000
            </code>
          </div>
        </div>
      )}

      {/* Missing Key Setup Prompt */}
      {backendOnline && apiKeyConfigured === false && (
        <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-2.5 text-xs text-amber-300">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold">AssemblyAI API Key Missing:</span>
            <p className="text-amber-200/90">
              To enable speech-to-text, create a file at <code className="font-mono bg-amber-950/60 px-1 py-0.5 rounded text-amber-200">backend/.env</code> with:
            </p>
            <code className="block font-mono bg-amber-950/60 text-amber-200 px-2 py-1 rounded border border-amber-800/40">
              ASSEMBLYAI_API_KEY=your_actual_api_key_here
            </code>
            <p className="text-[11px] text-amber-300/80">
              Get your key from the official AssemblyAI dashboard at{' '}
              <a
                href="https://www.assemblyai.com/app"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-white"
              >
                https://www.assemblyai.com/app
              </a>
            </p>
          </div>
        </div>
      )}

      {/* Connection Test Banner Result */}
      {testResult && (
        <div
          className={`mt-4 p-3.5 rounded-lg border text-xs flex items-start gap-2.5 ${
            testResult.success
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {testResult.success ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <div className="font-semibold">
              {testResult.success ? 'API Connection Verified' : 'API Connection Test Failed'}
            </div>
            <div className="text-slate-200">{testResult.message}</div>
            <div className="text-[11px] text-slate-400">
              {testResult.success
                ? 'Minimal authenticated request to AssemblyAI (GET /v2/transcript?limit=1) succeeded. Ready for transcription.'
                : 'Distinguished auth / network result: no audio was uploaded.'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
