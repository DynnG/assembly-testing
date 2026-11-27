import React from 'react';
import { Activity, Key, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Send, Sparkles } from 'lucide-react';

interface ApiStatusCardProps {
  backendOnline: boolean | null;
  apiKeyConfigured: boolean | null;
  geminiConfigured?: boolean | null;
  geminiModel?: string;
  onRefreshHealth: () => Promise<void>;
  onTestConnection: () => Promise<void>;
  onTestGeminiConnection?: () => Promise<void>;
  isTesting: boolean;
  isTestingGemini?: boolean;
  testResult: {
    success: boolean;
    message: string;
    error?: string;
    status_code?: number;
  } | null;
  geminiTestResult?: {
    success: boolean;
    message: string;
    model?: string;
    error?: string;
  } | null;
}

export const ApiStatusCard: React.FC<ApiStatusCardProps> = ({
  backendOnline,
  apiKeyConfigured,
  geminiConfigured,
  geminiModel = 'gemini-3.5-flash-lite',
  onRefreshHealth,
  onTestConnection,
  onTestGeminiConnection,
  isTesting,
  isTestingGemini = false,
  testResult,
  geminiTestResult,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg shadow-black/20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-cyan-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">API Connection & Services</h2>
            <p className="text-xs text-slate-400">
              Verifies FastAPI backend, AssemblyAI ASR, and Gemini 3.5 Flash-Lite integration
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefreshHealth}
            disabled={isTesting || isTestingGemini}
            title="Refresh backend status"
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors disabled:opacity-50 text-xs flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {onTestGeminiConnection && (
            <button
              onClick={onTestGeminiConnection}
              disabled={isTestingGemini || backendOnline === false}
              className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium text-xs flex items-center gap-1.5 transition-all shadow-md shadow-indigo-950/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isTestingGemini ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Verifying Gemini...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Test Gemini 3.5</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={onTestConnection}
            disabled={isTesting || backendOnline === false}
            className="px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white font-medium text-xs flex items-center gap-2 transition-all shadow-md shadow-teal-950/40 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isTesting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Verifying AssemblyAI...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Test AssemblyAI</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Status Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
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
                <CheckCircle2 className="w-3.5 h-3.5" /> Online
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30">
                <XCircle className="w-3.5 h-3.5" /> Disconnected
              </span>
            )}
          </div>
        </div>

        {/* Gemini 3.5 Flash-Lite Key Status */}
        <div className="bg-slate-800/50 border border-slate-800 rounded-lg p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
            <div>
              <div className="text-xs font-medium text-slate-300">Gemini 3.5 Flash-Lite</div>
              <div className="text-[11px] text-slate-500 font-mono">{geminiModel}</div>
            </div>
          </div>
          <div>
            {geminiConfigured === null ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
                <RefreshCw className="w-3 h-3 animate-spin" /> Checking
              </span>
            ) : geminiConfigured ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="w-3.5 h-3.5" /> Configured
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/30" title="Deterministic rule-based expert engine active">
                <CheckCircle2 className="w-3.5 h-3.5" /> Expert Fallback
              </span>
            )}
          </div>
        </div>

        {/* AssemblyAI Key Status */}
        <div className="bg-slate-800/50 border border-slate-800 rounded-lg p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Key className="w-4 h-4 text-teal-400 shrink-0" />
            <div>
              <div className="text-xs font-medium text-slate-300">AssemblyAI ASR</div>
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
                <AlertTriangle className="w-3.5 h-3.5" /> Missing Key
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

      {/* Gemini Connection Test Result Banner */}
      {geminiTestResult && (
        <div
          className={`mt-3 p-3.5 rounded-lg border text-xs flex items-start gap-2.5 ${
            geminiTestResult.success
              ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          }`}
        >
          {geminiTestResult.success ? (
            <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <div className="font-semibold">
              {geminiTestResult.success ? 'Gemini 3.5 Flash-Lite Connection Verified' : 'Gemini Status Notice'}
            </div>
            <div className="text-slate-200">{geminiTestResult.message}</div>
            <div className="text-[11px] text-slate-400">
              {geminiTestResult.success
                ? `Successfully connected to Gemini API using model '${geminiTestResult.model || geminiModel}'. Backend proxy secure; key never exposed to client.`
                : 'When GEMINI_API_KEY is not configured or offline, Articula automatically activates the deterministic expert phonetic engine.'}
            </div>
          </div>
        </div>
      )}

      {/* AssemblyAI Connection Test Banner Result */}
      {testResult && (
        <div
          className={`mt-3 p-3.5 rounded-lg border text-xs flex items-start gap-2.5 ${
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
              {testResult.success ? 'AssemblyAI Connection Verified' : 'AssemblyAI Test Failed'}
            </div>
            <div className="text-slate-200">{testResult.message}</div>
            <div className="text-[11px] text-slate-400">
              {testResult.success
                ? 'Authenticated request to AssemblyAI succeeded. Speech-to-text pipeline ready.'
                : 'Check your ASSEMBLYAI_API_KEY in backend/.env.'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
