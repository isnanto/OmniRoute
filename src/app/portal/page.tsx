"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { Spinner } from "@/shared/components/Loading";

interface PersonalQuota {
  enabled: boolean;
  dailyLimitUsd: number | null;
  weeklyLimitUsd: number | null;
  dailySpentUsd: number;
  weeklySpentUsd: number;
  dailyWindowStartIso: string;
  dailyResetAtIso: string;
  weeklyWindowStartIso: string;
  weeklyResetAtIso: string | null;
  dailyExceeded: boolean;
  weeklyExceeded: boolean;
}

interface QuotaItem {
  name: string;
  windowType: string;
  used: number;
  limit: number;
  percentage?: number;
  resetAt?: string | null;
}

interface UsageSnapshot {
  connectionId: string;
  provider: string;
  quotas: Record<string, QuotaItem | undefined>;
}

interface KeyInfo {
  id: string;
  name: string;
  allowedModels: string[];
}

interface RecentCall {
  id: string;
  model: string;
  provider: string;
  tokensInput: number;
  tokensOutput: number;
  latencyMs: number;
  success: boolean;
  timestamp: string;
}

interface UsageResponse {
  allowed: boolean;
  error?: {
    message: string;
  };
  personal?: PersonalQuota | null;
  keyInfo?: KeyInfo | null;
  recentCalls?: RecentCall[];
  provider?: UsageSnapshot | null;
  providers?: UsageSnapshot[];
}

const STORAGE_KEY = "omniroute_portal_api_key";

function formatCurrency(usd: number | null | undefined): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(usd);
}

function formatPercentage(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export default function PortalPage() {
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [usageData, setUsageData] = useState<UsageResponse | null>(null);
  const [rememberKey, setRememberKey] = useState(true);
  const [activeTab, setActiveTab] = useState<"claude" | "cursor" | "python" | "curl">("claude");
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [instanceName, setInstanceName] = useState<string>("OmniRoute");
  const [customLogo, setCustomLogo] = useState<string | null>(null);

  const baseUrl = useMemo(() => {
    if (typeof window !== "undefined") {
      return window.location.origin;
    }
    return "http://localhost:20128";
  }, []);

  useEffect(() => {
    async function loadBranding() {
      try {
        const res = await fetch("/api/settings/require-login", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.instanceName) setInstanceName(data.instanceName);
          if (data.customLogoBase64 || data.customLogoUrl) {
            setCustomLogo(data.customLogoBase64 || data.customLogoUrl);
          }
        }
      } catch {
        // fail silently, keep defaults
      }
    }
    void loadBranding();
  }, []);

  const fetchUsage = useCallback(async (key: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/usage/om-usage?format=json", {
        headers: {
          Authorization: `Bearer ${key.trim()}`,
        },
        cache: "no-store",
      });

      const data = (await res.json()) as UsageResponse;

      if (!res.ok || !data.allowed) {
        const msg = data.error?.message || (res.status === 401 ? "API Key tidak valid atau salah." : "Gagal mengambil data kuota.");
        setErrorMsg(msg);
        setUsageData(null);
        return;
      }

      setUsageData(data);
      setActiveKey(key.trim());
      if (rememberKey) {
        localStorage.setItem(STORAGE_KEY, key.trim());
      }
    } catch {
      setErrorMsg("Tidak dapat terhubung ke server OmniRoute.");
      setUsageData(null);
    } finally {
      setLoading(false);
    }
  }, [rememberKey]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setApiKeyInput(saved);
      void fetchUsage(saved);
    }
  }, [fetchUsage]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;
    void fetchUsage(apiKeyInput);
  };

  const handleClear = () => {
    localStorage.removeItem(STORAGE_KEY);
    setActiveKey(null);
    setApiKeyInput("");
    setUsageData(null);
    setErrorMsg(null);
  };

  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const personal = usageData?.personal;
  const keyInfo = usageData?.keyInfo;
  const recentCalls = usageData?.recentCalls || [];
  const providers = usageData?.providers || (usageData?.provider ? [usageData.provider] : []);

  const snippets = useMemo(() => {
    const key = activeKey || "YOUR_API_KEY";
    return {
      claude: `# 1. Pasang Environment Variable
export ANTHROPIC_BASE_URL="${baseUrl}/v1"
export ANTHROPIC_API_KEY="${key}"

# 2. Jalankan Claude Code CLI
claude`,
      cursor: `// Di Settings > Models > OpenAI API Key & Base URL:
Base URL: ${baseUrl}/v1
API Key : ${key}
Model   : auto (atau model yang diizinkan)`,
      python: `from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}/v1",
    api_key="${key}",
)

response = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "Halo AI!"}],
)
print(response.choices[0].message.content)`,
      curl: `curl ${baseUrl}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${key}" \\
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "Halo!"}]
  }'`,
    };
  }, [activeKey, baseUrl]);

  return (
    <main className="min-h-screen text-text-main p-4 sm:p-8 flex flex-col items-center justify-start">
      <div className="w-full max-w-4xl space-y-6">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
          <div className="flex items-center gap-3.5">
            {customLogo ? (
              <img
                src={customLogo}
                alt={instanceName}
                className="w-12 h-12 rounded-xl object-contain border border-border bg-surface p-1"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-white text-[24px]">hub</span>
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
                  {instanceName} Portal
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight mt-0.5">
                Utilitas & Kuota API Key
              </h1>
              <p className="text-text-muted text-xs sm:text-sm mt-0.5">
                Pantau pemakaian token, alokasi model, dan panduan integrasi mandiri.
              </p>
            </div>
          </div>

          {activeKey && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void fetchUsage(activeKey)}
                disabled={loading}
                className="px-3.5 py-2 rounded-lg text-xs font-medium border border-border bg-surface hover:bg-bg-alt transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {loading && <Spinner size="sm" />}
                Refresh
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="px-3.5 py-2 rounded-lg text-xs font-medium text-red-500 hover:bg-red-500/10 border border-red-500/20 transition-colors"
              >
                Ganti Key
              </button>
            </div>
          )}
        </header>

        {/* Form Input Key bila belum login atau ingin input baru */}
        {!activeKey && (
          <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-2">Masukkan API Key Anda</h2>
            <p className="text-sm text-text-muted mb-4">
              Gunakan OmniRoute API Key yang diberikan oleh admin server.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="portal-api-key" className="block text-xs font-medium text-text-muted mb-1.5">
                  OmniRoute API Key
                </label>
                <input
                  id="portal-api-key"
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-bg text-text-main text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                  required
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="inline-flex items-center gap-2 text-xs text-text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberKey}
                    onChange={(e) => setRememberKey(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary/40"
                  />
                  Ingat key di browser ini (localStorage)
                </label>

                <button
                  type="submit"
                  disabled={loading || !apiKeyInput.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {loading && <Spinner size="sm" />}
                  Periksa Kuota
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400" role="alert">
            <span className="font-semibold">Perhatian: </span>
            {errorMsg}
          </div>
        )}

        {/* Data Tampil */}
        {activeKey && usageData && (
          <div className="space-y-6">
            {/* Key Information Banner */}
            <div className="rounded-xl border border-border bg-surface p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-base">{keyInfo?.name || "API Key User"}</span>
                  <span className="text-xs font-mono text-text-muted">({keyInfo?.id?.slice(0, 8)})</span>
                </div>
                <p className="font-mono text-xs text-text-muted mt-1">
                  Kredensial: ••••••••••••{activeKey.slice(-6)}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 w-fit">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Key Terverifikasi
              </span>
            </div>

            {/* Allowed Models Badge Section */}
            <section className="rounded-xl border border-border bg-surface p-5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Model AI yang Diizinkan</h2>
                <span className="text-xs text-text-muted">Akses Model</span>
              </div>
              {keyInfo && keyInfo.allowedModels && keyInfo.allowedModels.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {keyInfo.allowedModels.map((m, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg text-xs font-mono bg-bg border border-border text-text-main"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-text-muted">
                  Key ini memiliki izin penuh mengakses semua model (<code className="text-primary font-mono font-semibold">all models</code>) termasuk alias <code className="text-primary font-mono font-semibold">auto</code>.
                </p>
              )}
            </section>

            {/* Recent Calls History */}
            <section className="rounded-xl border border-border bg-surface p-5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Riwayat Panggilan Terakhir</h2>
                  <p className="text-xs text-text-muted mt-0.5">15 permintaan inferensi terakhir milik API Key ini.</p>
                </div>
                <span className="text-xs font-mono text-text-muted">{recentCalls.length} aktivitas</span>
              </div>

              {recentCalls.length === 0 ? (
                <div className="p-4 rounded-lg bg-bg border border-border text-center text-xs text-text-muted">
                  Belum ada riwayat panggilan tercatat untuk API Key ini.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border text-text-muted">
                        <th className="pb-2 font-medium">Waktu</th>
                        <th className="pb-2 font-medium">Model</th>
                        <th className="pb-2 font-medium">Provider</th>
                        <th className="pb-2 font-medium text-right">Tokens In / Out</th>
                        <th className="pb-2 font-medium text-right">Latency</th>
                        <th className="pb-2 font-medium text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {recentCalls.map((call) => {
                        let displayModel = call.model || "unknown";
                        if (displayModel.startsWith("amanai/")) {
                          displayModel = `petirs/${displayModel.slice(7)}`;
                        } else if (displayModel.includes("openai-compatible-")) {
                          const parts = displayModel.split("/");
                          displayModel = `petirs/${parts[parts.length - 1]}`;
                        }

                        return (
                          <tr key={call.id} className="hover:bg-bg-alt/50 transition-colors">
                            <td className="py-2.5 text-text-muted">
                              {new Date(call.timestamp).toLocaleTimeString()}
                            </td>
                            <td className="py-2.5 font-mono text-text-main">{displayModel}</td>
                            <td className="py-2.5 capitalize text-text-muted">
                              {call.provider?.startsWith("openai-compatible-") ? "petirs" : call.provider}
                            </td>
                            <td className="py-2.5 text-right font-mono">
                              {call.tokensInput} / {call.tokensOutput}
                            </td>
                            <td className="py-2.5 text-right font-mono text-text-muted">
                              {call.latencyMs}ms
                            </td>
                            <td className="py-2.5 text-right">
                              {call.success ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                  Sukses
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-500 border border-red-500/20">
                                  Gagal
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Personal Quota Card (Jika diaktifkan) */}
            {personal && personal.enabled ? (
              <section className="rounded-xl border border-border bg-surface p-6 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">Personal Usage & Spending Limit</h2>
                  <span className="text-xs text-text-muted">Jadwal & Kuota Akun</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Daily */}
                  <div className="p-4 rounded-lg border border-border bg-bg space-y-2">
                    <div className="flex justify-between text-xs text-text-muted">
                      <span>Batas Harian (Daily)</span>
                      <span>
                        {personal.dailyLimitUsd !== null
                          ? `${formatCurrency(personal.dailySpentUsd)} / ${formatCurrency(personal.dailyLimitUsd)}`
                          : formatCurrency(personal.dailySpentUsd)}
                      </span>
                    </div>
                    {personal.dailyLimitUsd !== null && (
                      <div className="w-full h-2 rounded-full bg-border overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            personal.dailyExceeded ? "bg-red-500" : "bg-primary"
                          }`}
                          style={{
                            width: `${formatPercentage((personal.dailySpentUsd / personal.dailyLimitUsd) * 100)}%`,
                          }}
                        />
                      </div>
                    )}
                    <p className="text-[11px] text-text-muted">
                      Reset: {personal.dailyResetAtIso ? new Date(personal.dailyResetAtIso).toLocaleTimeString() : "-"}
                    </p>
                  </div>

                  {/* Weekly */}
                  <div className="p-4 rounded-lg border border-border bg-bg space-y-2">
                    <div className="flex justify-between text-xs text-text-muted">
                      <span>Batas Mingguan (Weekly)</span>
                      <span>
                        {personal.weeklyLimitUsd !== null
                          ? `${formatCurrency(personal.weeklySpentUsd)} / ${formatCurrency(personal.weeklyLimitUsd)}`
                          : formatCurrency(personal.weeklySpentUsd)}
                      </span>
                    </div>
                    {personal.weeklyLimitUsd !== null && (
                      <div className="w-full h-2 rounded-full bg-border overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            personal.weeklyExceeded ? "bg-red-500" : "bg-primary"
                          }`}
                          style={{
                            width: `${formatPercentage((personal.weeklySpentUsd / personal.weeklyLimitUsd) * 100)}%`,
                          }}
                        />
                      </div>
                    )}
                    <p className="text-[11px] text-text-muted">
                      Reset: {personal.weeklyResetAtIso ? new Date(personal.weeklyResetAtIso).toLocaleDateString() : "-"}
                    </p>
                  </div>
                </div>
              </section>
            ) : (
              <div className="rounded-xl border border-border bg-surface/50 p-4 text-xs text-text-muted">
                Catatan: API Key ini tidak memiliki batas anggaran nominal (Personal Quota limit tidak diaktifkan).
              </div>
            )}

            {/* Provider Quota Snapshots */}
            <section className="space-y-4">
              <h2 className="text-base font-semibold">Snapshot Kuota Provider</h2>

              {providers.length === 0 ? (
                <div className="rounded-xl border border-border bg-surface p-6 text-center text-text-muted text-sm">
                  Belum ada snapshot kuota provider yang tercatat untuk key ini.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {providers.map((p, idx) => {
                    const quotas = Object.values(p.quotas || {}).filter((q): q is QuotaItem => Boolean(q));
                    return (
                      <div key={p.connectionId || idx} className="rounded-xl border border-border bg-surface p-5 space-y-3 shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm capitalize">{p.provider || "Provider"}</span>
                          <span className="text-[11px] font-mono text-text-muted">{p.connectionId}</span>
                        </div>

                        {quotas.length === 0 ? (
                          <p className="text-xs text-text-muted">Tidak ada rincian batas aktif.</p>
                        ) : (
                          <div className="space-y-3 pt-1">
                            {quotas.map((q, qIdx) => {
                              const pct = q.percentage ?? (q.limit > 0 ? (q.used / q.limit) * 100 : 0);
                              return (
                                <div key={qIdx} className="space-y-1">
                                  <div className="flex justify-between text-xs">
                                    <span className="text-text-muted capitalize">{q.name || q.windowType}</span>
                                    <span className="font-mono text-[11px]">{q.used} / {q.limit} ({formatPercentage(pct)}%)</span>
                                  </div>
                                  <div className="w-full h-1.5 rounded-full bg-border overflow-hidden">
                                    <div
                                      className={`h-full transition-all ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-primary"}`}
                                      style={{ width: `${formatPercentage(pct)}%` }}
                                    />
                                  </div>
                                  {q.resetAt && (
                                    <p className="text-[10px] text-text-muted text-right">
                                      Reset: {new Date(q.resetAt).toLocaleString()}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Quickstart Integration Snippets */}
            <section className="rounded-xl border border-border bg-surface p-6 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold">Panduan Integrasi Cepat</h2>
                  <p className="text-xs text-text-muted mt-0.5">
                    Gunakan konfigurasi di bawah ini untuk menghubungkan coding agent atau aplikasi Anda.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(snippets[activeTab])}
                  className="px-3 py-1.5 rounded-lg border border-border bg-bg text-xs font-medium hover:bg-bg-alt transition-colors inline-flex items-center gap-1.5"
                >
                  {copiedSnippet ? "Tersalin!" : "Salin Kode"}
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-border gap-2 text-xs">
                {(["claude", "cursor", "python", "curl"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`pb-2 px-2 font-medium capitalize border-b-2 transition-colors ${
                      activeTab === tab
                        ? "border-primary text-primary"
                        : "border-transparent text-text-muted hover:text-text-main"
                    }`}
                  >
                    {tab === "claude" ? "Claude Code" : tab === "cursor" ? "Cursor IDE" : tab}
                  </button>
                ))}
              </div>

              {/* Snippet Code Box */}
              <pre className="p-4 rounded-lg bg-bg border border-border font-mono text-xs overflow-x-auto text-text-main whitespace-pre-wrap leading-relaxed">
                {snippets[activeTab]}
              </pre>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
