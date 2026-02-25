"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { useWallet } from "@/lib/wallet";
import { api } from "@/lib/api";

// EIP-712 delegation domain & types (must match API)
const DELEGATION_DOMAIN = {
  name: "Sigil Protocol",
  version: "1",
} as const;

const DELEGATION_TYPES = {
  AgentDelegation: [
    { name: "owner", type: "address" },
    { name: "agentIdentifier", type: "string" },
    { name: "scopes", type: "string" },
    { name: "expiresAt", type: "uint256" },
    { name: "nonce", type: "string" },
  ],
} as const;

// ─── Scope Definitions ───

type ScopeRisk = "safe" | "elevated" | "dangerous";

interface ScopeInfo {
  id: string;
  label: string;
  description: string;
  risk: ScopeRisk;
  defaultEnabled: boolean;
  warning?: string; // shown in confirmation modal for elevated/dangerous
}

const SCOPE_DEFINITIONS: ScopeInfo[] = [
  // Safe — enabled by default
  { id: "wallet:read",       label: "View wallet status",     description: "Read balances, deployment status, and wallet info.",           risk: "safe",      defaultEnabled: true },
  { id: "policy:read",       label: "View policies",          description: "Read security policies and whitelist rules.",                  risk: "safe",      defaultEnabled: true },
  { id: "audit:read",        label: "View audit log",         description: "Read transaction history and Guardian evaluation results.",    risk: "safe",      defaultEnabled: true },
  { id: "tx:read",           label: "View transactions",      description: "Read pending and past transaction details.",                   risk: "safe",      defaultEnabled: true },
  { id: "tx:submit",         label: "Submit transactions",    description: "Propose transactions for Guardian evaluation. All txs go through the 3-layer pipeline (rules → simulation → AI).", risk: "safe", defaultEnabled: true },

  // Elevated — off by default, warning on enable
  { id: "policy:write",      label: "Configure policies",     description: "Change spending limits, risk thresholds, and Guardian rules.", risk: "elevated",  defaultEnabled: false,
    warning: "This allows the agent to modify your security policies — spending limits, risk thresholds, and evaluation rules. A compromised agent could weaken your protections before submitting malicious transactions." },
  { id: "targets:write",     label: "Manage whitelists",      description: "Add or remove whitelisted contract addresses.",               risk: "elevated",  defaultEnabled: false,
    warning: "This allows the agent to add new contracts to your whitelist. A compromised agent could whitelist a malicious contract, then submit transactions to it." },
  { id: "session-keys:read", label: "View session keys",      description: "List active session keys and their permissions.",              risk: "elevated",  defaultEnabled: false,
    warning: "Session keys grant temporary transaction signing rights. Viewing them reveals active key addresses and their limits." },

  // Dangerous — off by default, strong warning
  { id: "wallet:deploy",     label: "Deploy wallets",         description: "Create new Sigil wallets on your behalf.",                    risk: "dangerous", defaultEnabled: false,
    warning: "This allows the agent to deploy new smart contract wallets using your address as owner. Each deployment costs gas and creates a wallet you're responsible for. Only enable this if the agent is explicitly setting up new wallets for you." },
  { id: "session-keys:write", label: "Create session keys",   description: "Generate temporary signing keys with spend limits.",          risk: "dangerous", defaultEnabled: false,
    warning: "Session keys can sign transactions without the full agent key. A compromised agent could create a session key with high limits, then use it to drain funds before you notice. Only enable if your agent needs autonomous time-limited signing." },
];

const ALL_SCOPES = SCOPE_DEFINITIONS.map(s => s.id);
const DEFAULT_SCOPES = SCOPE_DEFINITIONS.filter(s => s.defaultEnabled).map(s => s.id);
const SCOPE_LABELS: Record<string, string> = Object.fromEntries(SCOPE_DEFINITIONS.map(s => [s.id, s.label]));

const RISK_COLORS: Record<ScopeRisk, { bg: string; border: string; text: string; badge: string }> = {
  safe:      { bg: "bg-[#00FF88]/5",  border: "border-[#00FF88]/20", text: "text-[#00FF88]", badge: "bg-[#00FF88]/10 text-[#00FF88]" },
  elevated:  { bg: "bg-[#F4A524]/5",  border: "border-[#F4A524]/20", text: "text-[#F4A524]", badge: "bg-[#F4A524]/10 text-[#F4A524]" },
  dangerous: { bg: "bg-[#F04452]/5",  border: "border-[#F04452]/20", text: "text-[#F04452]", badge: "bg-[#F04452]/10 text-[#F04452]" },
};

const RISK_LABELS: Record<ScopeRisk, string> = {
  safe: "Safe",
  elevated: "⚠ Elevated",
  dangerous: "🔴 Dangerous",
};

interface ApiKey {
  id: string;
  agent_id: string;
  key_prefix: string;
  name: string;
  scopes: string[];
  expires_at: string;
  created_at: string;
  last_used_at: string | null;
  use_count: number;
  revoked: boolean;
}

// Strip trailing /v1 and whitespace — Vercel env has /v1 and trailing newline
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "https://api.sigil.codes").trim().replace(/\/v1\/?$/, "");

// ─── Warning Modal ───

function ScopeWarningModal({ scope, onConfirm, onCancel }: { scope: ScopeInfo; onConfirm: () => void; onCancel: () => void }) {
  const colors = RISK_COLORS[scope.risk];
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl max-w-md w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full ${colors.bg} ${colors.border} border flex items-center justify-center text-lg`}>
            {scope.risk === "dangerous" ? "🔴" : "⚠️"}
          </div>
          <div>
            <h3 className="font-semibold text-sm">Enable &quot;{scope.label}&quot;?</h3>
            <span className={`text-xs ${colors.text}`}>{RISK_LABELS[scope.risk]} permission</span>
          </div>
        </div>

        <div className={`${colors.bg} ${colors.border} border rounded-lg p-3`}>
          <p className="text-sm text-white/70">{scope.warning}</p>
        </div>

        <p className="text-xs text-white/40">
          You can always revoke this permission by generating a new key without it.
        </p>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 ${
              scope.risk === "dangerous"
                ? "bg-[#F04452] hover:bg-[#F04452]/80"
                : "bg-[#F4A524] hover:bg-[#F4A524]/80"
            } text-[#050505] rounded-lg text-sm font-semibold transition-colors`}
          >
            Enable Anyway
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Scope Selector Component ───

function ScopeSelector({ scopes, onChange }: { scopes: string[]; onChange: (s: string[]) => void }) {
  const [warningScope, setWarningScope] = useState<ScopeInfo | null>(null);

  const toggleScope = (scopeInfo: ScopeInfo) => {
    const isEnabled = scopes.includes(scopeInfo.id);
    if (isEnabled) {
      // Always allow disabling
      onChange(scopes.filter(s => s !== scopeInfo.id));
    } else if (scopeInfo.risk !== "safe" && scopeInfo.warning) {
      // Show warning for elevated/dangerous
      setWarningScope(scopeInfo);
    } else {
      // Safe scope, just enable
      onChange([...scopes, scopeInfo.id]);
    }
  };

  const grouped = {
    safe: SCOPE_DEFINITIONS.filter(s => s.risk === "safe"),
    elevated: SCOPE_DEFINITIONS.filter(s => s.risk === "elevated"),
    dangerous: SCOPE_DEFINITIONS.filter(s => s.risk === "dangerous"),
  };

  return (
    <>
      {warningScope && (
        <ScopeWarningModal
          scope={warningScope}
          onConfirm={() => {
            onChange([...scopes, warningScope.id]);
            setWarningScope(null);
          }}
          onCancel={() => setWarningScope(null)}
        />
      )}

      <div className="space-y-4">
        {(["safe", "elevated", "dangerous"] as ScopeRisk[]).map(risk => {
          const items = grouped[risk];
          const colors = RISK_COLORS[risk];
          return (
            <div key={risk}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.badge}`}>
                  {RISK_LABELS[risk]}
                </span>
                {risk === "safe" && <span className="text-xs text-white/30">Recommended for agents</span>}
                {risk === "elevated" && <span className="text-xs text-white/30">Enable only if needed</span>}
                {risk === "dangerous" && <span className="text-xs text-white/30">Proceed with caution</span>}
              </div>
              <div className={`rounded-lg border ${colors.border} ${colors.bg} p-3 space-y-2`}>
                {items.map(scope => (
                  <label key={scope.id} className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={scopes.includes(scope.id)}
                      onChange={() => toggleScope(scope)}
                      className="mt-0.5 rounded border-white/10 bg-[#050505] text-[#00FF88] focus:ring-[#00FF88] cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{scope.label}</span>
                        <code className="text-[10px] text-white/20 font-mono">{scope.id}</code>
                      </div>
                      <p className="text-xs text-white/40 mt-0.5">{scope.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default function AgentAccessPage() {
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { isAuthenticated, isAuthenticating, needsSignIn, authError, signIn } = useWallet();

  // Get Sigil account address for quickstart code
  const [accountAddress, setAccountAddress] = useState<string | null>(null);
  useEffect(() => {
    if (!address) return;
    (async () => {
      try {
        const res = await api.discoverAccounts(address);
        const accounts = res?.accounts || [];
        if (accounts.length > 0) setAccountAddress(accounts[0].address);
      } catch {}
    })();
  }, [address]);

  const [tab, setTab] = useState<"delegation" | "api-keys" | "how-it-works">("api-keys");
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // API Key form
  const [keyName, setKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([...DEFAULT_SCOPES]);
  const [newKey, setNewKey] = useState<string | null>(null);

  // Delegation form
  const [agentName, setAgentName] = useState("");
  const [delegationScopes, setDelegationScopes] = useState<string[]>([...DEFAULT_SCOPES]);
  const [delegationResult, setDelegationResult] = useState<any>(null);

  // Fetch keys — uses httpOnly cookie auth (credentials: include)
  const fetchKeys = useCallback(async () => {
    if (!isConnected) return;
    try {
      const res = await fetch(`${API_URL}/v1/agent/keys`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys);
      }
    } catch {}
  }, [isConnected]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  // Generate API Key
  const generateKey = async () => {
    if (!keyName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/v1/agent/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: keyName,
          scopes: selectedScopes,
          expiresInHours: 4,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewKey(data.apiKey);
        setKeyName("");
        fetchKeys();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Failed to create key (${res.status})`);
      }
    } catch (err: any) {
      setError(err.message || "Network error");
    }
    setLoading(false);
  };

  // Revoke key
  const revokeKey = async (id: string) => {
    await fetch(`${API_URL}/v1/agent/keys/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    fetchKeys();
  };

  // Sign delegation
  const signDelegation = async () => {
    if (!agentName.trim() || !address) return;
    setLoading(true);
    try {
      const scopeString = [...delegationScopes].sort().join(",");
      const expiresAt = Math.floor(Date.now() / 1000) + 4 * 3600; // 4h — matches JWT token TTL
      const nonce = crypto.randomUUID();

      const signature = await signTypedDataAsync({
        domain: DELEGATION_DOMAIN,
        types: DELEGATION_TYPES,
        primaryType: "AgentDelegation",
        message: {
          owner: address,
          agentIdentifier: agentName,
          scopes: scopeString,
          expiresAt: BigInt(expiresAt),
          nonce,
        },
      });

      setDelegationResult({
        ownerAddress: address,
        agentIdentifier: agentName,
        signature,
        expiresAt,
        nonce,
        scopes: delegationScopes,
        agentPayload: JSON.stringify({
          ownerAddress: address,
          agentIdentifier: agentName,
          signature,
          expiresAt,
          nonce,
          scopes: delegationScopes,
        }, null, 2),
      });
    } catch (err) {
      // Failed to sign delegation
    }
    setLoading(false);
  };

  // Count elevated/dangerous scopes for a key
  const getScopeRiskSummary = (scopeList: string[]) => {
    const elevated = scopeList.filter(s => SCOPE_DEFINITIONS.find(d => d.id === s)?.risk === "elevated").length;
    const dangerous = scopeList.filter(s => SCOPE_DEFINITIONS.find(d => d.id === s)?.risk === "dangerous").length;
    return { elevated, dangerous };
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Agent Access</h1>
        <p className="text-white/40 mt-1">
          Allow AI agents to interact with your Sigil wallet. Agents submit transactions through the Guardian&apos;s 3-layer evaluation pipeline — they can never bypass it.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/5">
        <button
          onClick={() => setTab("api-keys")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "api-keys"
              ? "border-[#00FF88] text-[#00FF88]"
              : "border-transparent text-white/40 hover:text-gray-300"
          }`}
        >
          API Keys
        </button>
        <button
          onClick={() => setTab("how-it-works")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "how-it-works"
              ? "border-[#00FF88] text-[#00FF88]"
              : "border-transparent text-white/40 hover:text-gray-300"
          }`}
        >
          📖 How It Works
        </button>
        <button
          onClick={() => setTab("delegation")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "delegation"
              ? "border-[#00FF88] text-[#00FF88]"
              : "border-transparent text-white/40 hover:text-gray-300"
          }`}
        >
          Delegation Signature
        </button>
      </div>

      {/* Auth gate */}
      {needsSignIn && tab === "api-keys" && (
        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-8 text-center space-y-4">
          <div className="text-4xl">🔐</div>
          <h2 className="text-lg font-semibold">Sign in to manage API keys</h2>
          <p className="text-sm text-white/40 max-w-md mx-auto">
            Sign a message with your wallet to verify ownership. No gas fees, no transaction — just a signature.
          </p>
          <button
            onClick={signIn}
            disabled={isAuthenticating}
            className="px-6 py-3 bg-[#00FF88] text-[#050505] rounded-lg text-sm font-semibold hover:bg-[#00FF88]/80 disabled:opacity-50 transition-colors"
          >
            {isAuthenticating ? "Waiting for signature..." : "Sign in with Wallet"}
          </button>
          {authError && (
            <p className="text-sm text-[#F04452]">⚠ {authError}</p>
          )}
        </div>
      )}

      {/* API Keys Tab */}
      {(tab === "api-keys" && (isAuthenticated || !needsSignIn)) && (
        <div className="space-y-6">
          {/* Generate new key */}
          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold">Generate API Key</h2>
            <p className="text-sm text-white/40">
              Create a key your AI agent can use to authenticate. Safe defaults are pre-selected — expand permissions only if your agent needs them.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-white/40 mb-1">Key Name</label>
                <input
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="e.g. Claude Trading Bot"
                  className="w-full px-3 py-2 bg-[#050505] border border-white/5 rounded-lg text-sm focus:ring-1 focus:ring-[#00FF88] outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-white/40 mb-1">Validity</label>
                <div className="w-full px-3 py-2 bg-[#050505] border border-white/5 rounded-lg text-sm text-white/60">
                  4 hours <span className="text-white/30">(JWT token limit)</span>
                </div>
              </div>
            </div>

            {/* Scope Selector */}
            <div>
              <label className="block text-sm text-white/40 mb-2">Permissions</label>
              <ScopeSelector scopes={selectedScopes} onChange={setSelectedScopes} />
            </div>

            <button
              onClick={generateKey}
              disabled={!keyName.trim() || loading || !isConnected || selectedScopes.length === 0}
              className="px-4 py-2 bg-[#00FF88] text-[#050505] rounded-lg text-sm font-medium hover:bg-[#00FF88]/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Generating..." : "Generate API Key"}
            </button>

            {error && (
              <div className="bg-[#F04452]/10 border border-[#F04452]/30 rounded-lg p-3">
                <p className="text-sm text-[#F04452]">⚠ {error}</p>
              </div>
            )}

            {/* New key display */}
            {newKey && (
              <div className="bg-[#00FF88]/10 border border-[#00FF88]/30 rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium text-[#00FF88]">✓ API Key Generated — Save it now!</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-[#050505] px-3 py-2 rounded text-sm font-mono break-all">
                    {newKey}
                  </code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(newKey); }}
                    className="px-3 py-2 bg-[#050505] border border-white/5 rounded text-sm hover:bg-white/5 transition-colors"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-xs text-white/40">This key will not be shown again.</p>

                <details className="mt-2">
                  <summary className="text-sm text-[#00FF88] cursor-pointer hover:underline">
                    Agent Quickstart Code
                  </summary>
                  <pre className="mt-2 bg-[#050505] p-3 rounded text-xs font-mono overflow-x-auto">
{`// 1. Authenticate with your API key
const auth = await fetch("${API_URL}/v1/agent/auth/api-key", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ apiKey: "${newKey}" }),
});
const { token } = await auth.json();

// 2. Check wallet status
const status = await fetch("${API_URL}/v1/agent/wallets/${accountAddress || "YOUR_WALLET"}", {
  headers: { Authorization: \`Bearer \${token}\` },
});

// 3. Submit a transaction (Guardian evaluates it)
const result = await fetch("${API_URL}/v1/execute", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: \`Bearer \${token}\`,
  },
  body: JSON.stringify({
    userOp: signedUserOp,  // agent signs locally
    chainId: 137,
  }),
});
const { txHash, verdict, riskScore } = await result.json();`}
                  </pre>
                </details>
              </div>
            )}
          </div>

          {/* Existing keys */}
          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Active Keys</h2>
            {keys.length === 0 ? (
              <p className="text-sm text-white/40">No API keys created yet.</p>
            ) : (
              <div className="space-y-3">
                {keys.map((key) => {
                  const risk = getScopeRiskSummary(key.scopes || []);
                  return (
                    <div
                      key={key.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        key.revoked
                          ? "border-[#F04452]/30 bg-[#F04452]/5 opacity-60"
                          : new Date(key.expires_at) < new Date()
                          ? "border-[#F4A524]/30 bg-[#F4A524]/5 opacity-60"
                          : "border-white/5 bg-[#050505]"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{key.name}</span>
                          <code className="text-xs text-white/40 font-mono">{key.key_prefix}...</code>
                          {key.revoked && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-[#F04452]/20 text-[#F04452]">Revoked</span>
                          )}
                          {!key.revoked && new Date(key.expires_at) < new Date() && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-[#F4A524]/20 text-[#F4A524]">Expired</span>
                          )}
                          {risk.dangerous > 0 && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-[#F04452]/10 text-[#F04452]">
                              🔴 {risk.dangerous} dangerous
                            </span>
                          )}
                          {risk.elevated > 0 && !risk.dangerous && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-[#F4A524]/10 text-[#F4A524]">
                              ⚠ {risk.elevated} elevated
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-white/40">
                          <span>{(key.scopes || []).length} permissions</span>
                          <span>Used {key.use_count}×</span>
                          <span>Expires {new Date(key.expires_at).toLocaleDateString()}</span>
                          {key.last_used_at && (
                            <span>Last used {new Date(key.last_used_at).toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                      {!key.revoked && new Date(key.expires_at) > new Date() && (
                        <button
                          onClick={() => revokeKey(key.id)}
                          className="px-3 py-1.5 text-xs text-[#F04452] border border-[#F04452]/30 rounded hover:bg-[#F04452]/10 transition-colors"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* How It Works Tab */}
      {tab === "how-it-works" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-[#00FF88]/20 bg-[#00FF88]/5 p-4">
            <div className="flex items-start gap-3">
              <span className="text-xl">🔐</span>
              <div>
                <h3 className="font-semibold text-sm text-[#00FF88]">Non-Custodial Architecture</h3>
                <p className="text-sm text-white/50 mt-1">
                  Sigil <strong className="text-white/70">never stores your private keys</strong>. Your agent signs transactions locally,
                  then submits the pre-signed UserOp to the Guardian for evaluation.
                  Even if our servers are compromised, your funds are safe — the attacker would only have half the required signature.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-6">
            <h3 className="font-semibold mb-4">How Non-Custodial Execution Works</h3>
            <div className="space-y-3">
              {[
                { step: "1", title: "Agent signs locally", desc: "Agent builds UserOp and signs with its private key (never leaves the agent's machine)" },
                { step: "2", title: <>Submit to <code className="text-[#00FF88]">POST /v1/execute</code></>, desc: "Send the pre-signed UserOp + chainId. Agent authenticates with API key." },
                { step: "3", title: "Guardian evaluates", desc: "3-layer pipeline: policy check → simulation → AI risk scoring" },
                { step: "4", title: "Guardian co-signs if approved", desc: "Both signatures (agent + guardian) are concatenated and submitted to EntryPoint on-chain" },
                { step: "5", title: "Agent gets txHash", desc: "Returns verdict, risk score, and transaction hash" },
              ].map(({ step, title, desc }) => (
                <div key={step} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#00FF88]/10 text-[#00FF88] text-sm flex items-center justify-center font-bold">{step}</span>
                  <div><span className="text-sm text-white/70 font-medium">{title}</span><p className="text-xs text-white/40 mt-0.5">{desc}</p></div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-6">
            <h3 className="font-semibold mb-3">Agent Integration Code</h3>
            <pre className="bg-[#050505] p-4 rounded-lg text-xs font-mono overflow-x-auto text-white/60">
{`// 1. Authenticate
const auth = await fetch("${API_URL}/v1/agent/auth/api-key", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ apiKey: "sgil_your_key" }),
});
const { token } = await auth.json();

// 2. Build & sign UserOp locally (agent keeps its own private key)
const userOp = buildUserOp(target, value, data);
const signedUserOp = signWithAgentKey(userOp);

// 3. Submit to Guardian + chain
const res = await fetch("${API_URL}/v1/execute", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": \`Bearer \${token}\`
  },
  body: JSON.stringify({ userOp: signedUserOp, chainId: 137 }),
});
const { txHash, verdict, riskScore } = await res.json();`}
            </pre>
            <p className="text-xs text-white/30 mt-2">
              See <a href="/docs" className="text-[#00FF88] hover:underline">full API docs</a> for UserOp building helpers and signing examples.
            </p>
          </div>

          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-6">
            <h3 className="font-semibold mb-3">Why This Matters</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div className="text-[#F04452] font-medium">❌ Custodial (others)</div>
                <ul className="text-xs text-white/40 space-y-1">
                  <li>• Service holds your private keys</li>
                  <li>• One breach = all wallets drained</li>
                  <li>• You trust the operator completely</li>
                  <li>• Keys stored in databases</li>
                </ul>
              </div>
              <div className="space-y-2">
                <div className="text-[#00FF88] font-medium">✅ Non-Custodial (Sigil)</div>
                <ul className="text-xs text-white/40 space-y-1">
                  <li>• Agent keeps its own key locally</li>
                  <li>• Server breach = attacker has 0 keys</li>
                  <li>• 2-of-2 signatures required (agent + guardian)</li>
                  <li>• Nothing to steal from the database</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delegation Tab */}
      {tab === "delegation" && (
        <div className="space-y-6">
          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold">Sign Delegation</h2>
            <p className="text-sm text-white/40">
              Sign an EIP-712 message to authorize an AI agent. No API key needed — the agent uses your signature directly. More secure for one-time setups.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-white/40 mb-1">Agent Name</label>
                <input
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="e.g. claude-opus, my-bot"
                  className="w-full px-3 py-2 bg-[#050505] border border-white/5 rounded-lg text-sm focus:ring-1 focus:ring-[#00FF88] outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-white/40 mb-1">Validity</label>
                <div className="w-full px-3 py-2 bg-[#050505] border border-white/5 rounded-lg text-sm text-white/60">
                  4 hours <span className="text-white/30">(JWT token limit)</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm text-white/40 mb-2">Permissions</label>
              <ScopeSelector scopes={delegationScopes} onChange={setDelegationScopes} />
            </div>

            <button
              onClick={signDelegation}
              disabled={!agentName.trim() || loading || !isConnected || delegationScopes.length === 0}
              className="px-4 py-2 bg-[#00FF88] text-[#050505] rounded-lg text-sm font-medium hover:bg-[#00FF88]/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Signing..." : "Sign Delegation"}
            </button>

            {delegationResult && (
              <div className="bg-[#00FF88]/10 border border-[#00FF88]/30 rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium text-[#00FF88]">✓ Delegation Signed — Send this to your agent</p>
                <div className="space-y-2">
                  <p className="text-xs text-white/40">
                    Your agent should POST this to <code className="text-[#00FF88]">{API_URL}/v1/agent/auth/delegation</code>
                  </p>
                  <div className="relative">
                    <pre className="bg-[#050505] p-3 rounded text-xs font-mono overflow-x-auto max-h-48">
                      {delegationResult.agentPayload}
                    </pre>
                    <button
                      onClick={() => navigator.clipboard.writeText(delegationResult.agentPayload)}
                      className="absolute top-2 right-2 px-2 py-1 bg-white/5 rounded text-xs hover:bg-white/20 transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-6">
            <h3 className="font-semibold mb-3">How Delegation Works</h3>
            <ol className="space-y-2 text-sm text-white/40 list-decimal list-inside">
              <li>You sign an EIP-712 message in your wallet (above)</li>
              <li>Send the signed payload to your AI agent</li>
              <li>Agent calls <code className="text-[#00FF88]">/v1/agent/auth/delegation</code> with it</li>
              <li>Agent receives a scoped JWT token (valid up to 4h)</li>
              <li>Agent uses the token to submit transactions and read wallet status</li>
            </ol>
            <p className="mt-3 text-xs text-white/40">
              Delegation signatures are one-time use (nonce prevents replay). The agent token cannot withdraw funds, freeze, or transfer ownership.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
