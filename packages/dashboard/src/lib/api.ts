const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.sigil.codes/v1";
export const DEMO_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

const SESSION_KEY = "sigil-siwe-session";

// Cookie mode: when true, auth is handled by httpOnly cookies — no Authorization header needed
let cookieMode = false;

export function setCookieMode(enabled: boolean) {
  cookieMode = enabled;
}

export function isCookieMode() {
  return cookieMode;
}

function getSession(): { expiry?: number; refreshExpiry?: number } | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

/**
 * In cookie mode, refresh is handled server-side.
 * In legacy mode, we still check expiry from localStorage (but tokens are no longer stored).
 */
async function ensureAuth(): Promise<void> {
  if (cookieMode) {
    const session = getSession();
    if (session?.expiry && session.expiry < Date.now() + 60000) {
      // Cookie-mode refresh: let the server handle it via cookie
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        if (res.ok) {
          const data = await res.json();
          // Update only expiry in localStorage (no tokens stored)
          const existing = getSession() || {};
          localStorage.setItem(SESSION_KEY, JSON.stringify({
            ...existing,
            expiry: Date.now() + (data.expiresIn * 1000),
          }));
        }
      } catch (err) {
        // R12: Log refresh failure for debugging — server will reject on next call
        console.warn('[Sigil] Cookie refresh failed:', err);
      }
    }
    return;
  }
}

async function fetchAPI(path: string, options?: RequestInit) {
  await ensureAuth();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };
  // In cookie mode, cookies are sent automatically — no Authorization header
  // No token is stored in localStorage anymore

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: cookieMode ? "include" : "same-origin",
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  health: () => fetchAPI("/health"),
  getAccount: (address: string) => fetchAPI(`/accounts/${address}`),
  createAccount: (data: unknown) =>
    fetchAPI("/accounts", { method: "POST", body: JSON.stringify(data) }),
  getTransactions: (account: string, page = 1, limit = 20) =>
    fetchAPI(`/transactions?account=${account}&page=${page}&limit=${limit}`),
  updatePolicy: (address: string, policy: unknown) =>
    fetchAPI(`/accounts/${address}/policy`, {
      method: "PUT",
      body: JSON.stringify(policy),
    }),
  freezeAccount: (address: string, reason: string = "Emergency freeze") =>
    fetchAPI(`/accounts/${address}/freeze`, { method: "POST", body: JSON.stringify({ reason }) }),
  unfreezeAccount: (address: string) =>
    fetchAPI(`/accounts/${address}/unfreeze`, { method: "POST" }),
  rotateKey: (address: string, newKey: string) =>
    fetchAPI(`/accounts/${address}/rotate-key`, {
      method: "POST",
      body: JSON.stringify({ newAgentKey: newKey }),
    }),
  emergencyWithdraw: (_address: string, _to: string, _amount?: string) => {
    throw new Error('Emergency withdraw requires direct contract interaction — use the contract ABI with wagmi');
  },
  getAudit: (account: string) => fetchAPI(`/audit?account=${account}`),

  // ─── Recovery ───
  getRecoveryConfig: (address: string) => fetchAPI(`/accounts/${address}/recovery`),
  addGuardian: (address: string, guardian: string) =>
    fetchAPI(`/accounts/${address}/recovery/guardians`, { method: "POST", body: JSON.stringify({ guardian }) }),
  removeGuardian: (address: string, guardian: string) =>
    fetchAPI(`/accounts/${address}/recovery/guardians/${guardian}`, { method: "DELETE" }),
  setRecoveryThreshold: (address: string, threshold: number) =>
    fetchAPI(`/accounts/${address}/recovery/threshold`, { method: "PUT", body: JSON.stringify({ threshold }) }),
  setRecoveryDelay: (address: string, delay: number) =>
    fetchAPI(`/accounts/${address}/recovery/delay`, { method: "PUT", body: JSON.stringify({ delay }) }),
  getActiveRecoveries: (address: string) => fetchAPI(`/accounts/${address}/recovery/active`),
  cancelRecovery: (address: string, recoveryId: string) =>
    fetchAPI(`/accounts/${address}/recovery/${recoveryId}/cancel`, { method: "POST" }),

  // ─── Upgrades ───
  getUpgradeStatus: (address: string) => fetchAPI(`/accounts/${address}/upgrade`),
  requestUpgrade: (address: string, newImplementation: string) =>
    fetchAPI(`/accounts/${address}/upgrade`, { method: "POST", body: JSON.stringify({ newImplementation }) }),
  cancelUpgrade: (address: string) =>
    fetchAPI(`/accounts/${address}/upgrade`, { method: "DELETE" }),
  getUpgradeHistory: (address: string) => fetchAPI(`/accounts/${address}/upgrade/history`),

  // ─── Registration & Referral ───
  getRegistrationStatus: () => fetchAPI("/registration/status"),
  register: (data: { referral_code?: string; github_username?: string }) =>
    fetchAPI("/registration/register", { method: "POST", body: JSON.stringify(data) }),
  validateReferral: (code: string) => fetchAPI(`/registration/referral/${code}`),
  verifyStar: (github_username: string, github_token?: string) =>
    fetchAPI("/registration/verify-star", {
      method: "POST",
      body: JSON.stringify({ github_username, github_token }),
    }),
  getMyReferral: () => fetchAPI("/registration/my-referral"),
  getMySubscription: () => fetchAPI("/registration/my-subscription"),

  // ─── Guardian Protection Status ───
  getProtectionStatus: (address: string, chainId: number) =>
    fetchAPI(`/accounts/${address}/protection?chainId=${chainId}`),
  resetCircuitBreaker: (address: string, chainId: number) =>
    fetchAPI(`/accounts/${address}/protection/reset-circuit-breaker`, {
      method: "POST",
      body: JSON.stringify({ chainId }),
    }),
};
