"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useSignTypedData } from "wagmi";

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

const ALL_SCOPES = [
  "wallet:deploy",
  "wallet:read",
  "policy:write",
  "policy:read",
  "targets:write",
  "session-keys:write",
  "session-keys:read",
  "audit:read",
] as const;

const SCOPE_LABELS: Record<string, string> = {
  "wallet:deploy": "Deploy wallets",
  "wallet:read": "View wallet status",
  "policy:write": "Configure policies",
  "policy:read": "View policies",
  "targets:write": "Manage whitelists",
  "session-keys:write": "Create session keys",
  "session-keys:read": "View session keys",
  "audit:read": "View audit log",
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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.sigil.codes";

export default function AgentAccessPage() {
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [tab, setTab] = useState<"delegation" | "api-keys">("api-keys");
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // API Key form
  const [keyName, setKeyName] = useState("");
  const [keyExpiry, setKeyExpiry] = useState(24);
  const [selectedScopes, setSelectedScopes] = useState<string[]>([...ALL_SCOPES]);
  const [newKey, setNewKey] = useState<string | null>(null);

  // Delegation form
  const [agentName, setAgentName] = useState("");
  const [delegationExpiry, setDelegationExpiry] = useState(24);
  const [delegationScopes, setDelegationScopes] = useState<string[]>([...ALL_SCOPES]);
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
          expiresInHours: keyExpiry,
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
      const expiresAt = Math.floor(Date.now() / 1000) + delegationExpiry * 3600;
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
        // Ready-to-use JSON for the agent
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
      console.error("Failed to sign delegation:", err);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Agent Access</h1>
        <p className="text-white/40 mt-1">
          Allow AI agents to manage your Sigil wallet. Agents can deploy, configure policies, and create session keys — but never withdraw funds.
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

      {/* API Keys Tab */}
      {tab === "api-keys" && (
        <div className="space-y-6">
          {/* Generate new key */}
          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold">Generate API Key</h2>
            <p className="text-sm text-white/40">
              Create a key your AI agent can use to authenticate. The key is shown once — save it immediately.
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
                <label className="block text-sm text-white/40 mb-1">Expires In</label>
                <select
                  value={keyExpiry}
                  onChange={(e) => setKeyExpiry(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#050505] border border-white/5 rounded-lg text-sm focus:ring-1 focus:ring-[#00FF88] outline-none"
                >
                  <option value={1}>1 hour</option>
                  <option value={6}>6 hours</option>
                  <option value={24}>24 hours</option>
                  <option value={168}>7 days</option>
                  <option value={720}>30 days</option>
                </select>
              </div>
            </div>

            {/* Scopes */}
            <div>
              <label className="block text-sm text-white/40 mb-2">Permissions</label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_SCOPES.map((scope) => (
                  <label key={scope} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedScopes.includes(scope)}
                      onChange={(e) => {
                        setSelectedScopes(
                          e.target.checked
                            ? [...selectedScopes, scope]
                            : selectedScopes.filter((s) => s !== scope)
                        );
                      }}
                      className="rounded border-white/5 bg-[#050505] text-[#00FF88] focus:ring-[#00FF88]"
                    />
                    {SCOPE_LABELS[scope]}
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={generateKey}
              disabled={!keyName.trim() || loading || !isConnected}
              className="px-4 py-2 bg-[#00FF88] text-[#050505] rounded-lg text-sm font-medium hover:bg-[#00FF88]/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Generating..." : "Generate API Key"}
            </button>

            {/* Error display */}
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

                {/* Agent quickstart */}
                <details className="mt-2">
                  <summary className="text-sm text-[#00FF88] cursor-pointer hover:underline">
                    Agent Quickstart Code
                  </summary>
                  <pre className="mt-2 bg-[#050505] p-3 rounded text-xs font-mono overflow-x-auto">
{`// Authenticate
const auth = await fetch("${API_URL}/v1/agent/auth/api-key", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ apiKey: "${newKey.slice(0, 12)}..." }),
});
const { token } = await auth.json();

// Get wallet status
const status = await fetch("${API_URL}/v1/agent/wallets/YOUR_WALLET", {
  headers: { Authorization: \`Bearer \${token}\` },
});

// Or use the guided setup
const setup = await fetch("${API_URL}/v1/agent/setup", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: \`Bearer \${token}\`,
  },
  body: JSON.stringify({
    agentKey: "0xYourAgentKeyAddress",
    chainId: 43113,
    maxTxValueEth: 0.1,
    dailyLimitEth: 1.0,
  }),
});`}
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
                {keys.map((key) => (
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
                          <span className="text-xs px-1.5 py-0.5 rounded bg-[#F04452]/20 text-[#F04452]">
                            Revoked
                          </span>
                        )}
                        {!key.revoked && new Date(key.expires_at) < new Date() && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-[#F4A524]/20 text-[#F4A524]">
                            Expired
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-white/40">
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
                ))}
              </div>
            )}
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
                <label className="block text-sm text-white/40 mb-1">Valid For</label>
                <select
                  value={delegationExpiry}
                  onChange={(e) => setDelegationExpiry(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#050505] border border-white/5 rounded-lg text-sm focus:ring-1 focus:ring-[#00FF88] outline-none"
                >
                  <option value={1}>1 hour</option>
                  <option value={6}>6 hours</option>
                  <option value={24}>24 hours</option>
                  <option value={168}>7 days</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm text-white/40 mb-2">Permissions</label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_SCOPES.map((scope) => (
                  <label key={scope} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={delegationScopes.includes(scope)}
                      onChange={(e) => {
                        setDelegationScopes(
                          e.target.checked
                            ? [...delegationScopes, scope]
                            : delegationScopes.filter((s) => s !== scope)
                        );
                      }}
                      className="rounded border-white/5 bg-[#050505] text-[#00FF88] focus:ring-[#00FF88]"
                    />
                    {SCOPE_LABELS[scope]}
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={signDelegation}
              disabled={!agentName.trim() || loading || !isConnected}
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

          {/* How it works */}
          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-6">
            <h3 className="font-semibold mb-3">How Delegation Works</h3>
            <ol className="space-y-2 text-sm text-white/40 list-decimal list-inside">
              <li>You sign an EIP-712 message in your wallet (above)</li>
              <li>Send the signed payload to your AI agent</li>
              <li>Agent calls <code className="text-[#00FF88]">/v1/agent/auth/delegation</code> with it</li>
              <li>Agent receives a scoped JWT token (valid up to 4h)</li>
              <li>Agent uses the token to call setup/config endpoints</li>
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
