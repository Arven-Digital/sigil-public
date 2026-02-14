"use client";
import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { useAccount as useWagmiAccount, useSignMessage, useDisconnect } from "wagmi";
import { SiweMessage } from "siwe";
import { setCookieMode } from "./api";

// R9: Use env-configurable API URL instead of hardcoded
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.sigil.codes/v1";

interface GoogleUser {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  wallet_address: string | null;
  authMethod: 'google';
}

interface WalletContextType {
  address: string | undefined;
  isConnected: boolean;
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  needsSignIn: boolean;
  authError: string | null;
  googleUser: GoogleUser | null;
  signIn: () => Promise<void>;
  signOut: () => void;
}

const WalletContext = createContext<WalletContextType>({
  address: undefined,
  isConnected: false,
  isAuthenticated: false,
  isAuthenticating: false,
  needsSignIn: false,
  authError: null,
  googleUser: null,
  signIn: async () => {},
  signOut: () => {},
});

export function useWallet() {
  return useContext(WalletContext);
}

// Session key — only stores address + expiry for UI state (no tokens)
const SESSION_KEY = "sigil-siwe-session";

export function WalletProvider({ children }: { children: ReactNode }) {
  const { address, isConnected, chain } = useWagmiAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);

  // Enable cookie mode — API supports AUTH_USE_COOKIES=true
  useEffect(() => {
    setCookieMode(true);
  }, []);

  // Check for Google OAuth session (httpOnly cookies set by API callback)
  useEffect(() => {
    async function checkGoogleAuth() {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
        if (res.ok) {
          const user = await res.json();
          if (user.authMethod === "google") {
            setGoogleUser(user);
            // If wallet already linked, treat as authenticated
            if (user.wallet_address) {
              setIsAuthenticated(true);
            }
          }
        }
      } catch {
        // No Google session
      }
    }
    checkGoogleAuth();
  }, []);

  // Auto-link wallet when Google user connects wallet
  useEffect(() => {
    if (googleUser && address && !googleUser.wallet_address) {
      // Link wallet to Google account
      fetch(`${API_BASE}/auth/link-wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ wallet_address: address }),
      }).then(res => {
        if (res.ok) {
          setGoogleUser(prev => prev ? { ...prev, wallet_address: address.toLowerCase() } : null);
          setIsAuthenticated(true);
        }
      }).catch(() => {});
    }
  }, [googleUser, address]);

  // Restore SIWE session from localStorage (only address + expiry, no tokens)
  useEffect(() => {
    if (!address) {
      // Only clear auth if no Google session
      if (!googleUser?.wallet_address) {
        setIsAuthenticated(false);
      }
      return;
    }
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        const session = JSON.parse(stored);
        if (session.address?.toLowerCase() === address.toLowerCase() && session.expiry > Date.now()) {
          setIsAuthenticated(true);
          return;
        }
      } catch {
        // Corrupted session data
      }
    }
    // Don't override Google auth state
    if (!googleUser) {
      setIsAuthenticated(false);
    }
  }, [address, googleUser]);

  const signIn = useCallback(async () => {
    if (!address || !chain) return;
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      // Step 1: Get server-generated nonce
      const nonceRes = await fetch(`${API_BASE}/auth/nonce`, {
        credentials: "include",
      });
      if (!nonceRes.ok) {
        setAuthError("API unreachable — cannot authenticate");
        setIsAuthenticating(false);
        return;
      }
      const { nonce, sessionId } = await nonceRes.json();

      // Step 2: Build and sign SIWE message with server nonce
      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to Sigil Protocol Dashboard",
        uri: window.location.origin,
        version: "1",
        chainId: chain.id,
        nonce,
        issuedAt: new Date().toISOString(),
      });
      const messageStr = message.prepareMessage();
      const signature = await signMessageAsync({ message: messageStr });

      // Step 3: Verify with API — server sets httpOnly cookies
      const res = await fetch(`${API_BASE}/auth/siwe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Accept httpOnly cookies from server
        body: JSON.stringify({ message: messageStr, signature, sessionId }),
      });

      if (!res.ok) {
        setAuthError(`SIWE verification failed (${res.status})`);
        setIsAuthenticating(false);
        return;
      }

      const data = await res.json();
      // Only store address + expiry for UI state — NO tokens in localStorage
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        address,
        expiry: Date.now() + (data.expiresIn * 1000),
      }));
      setIsAuthenticated(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setAuthError(`Sign-in failed: ${msg}`);
      console.error("SIWE sign-in failed:", msg);
    } finally {
      setIsAuthenticating(false);
    }
  }, [address, chain, signMessageAsync]);

  const signOut = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setIsAuthenticated(false);
    setAuthError(null);
    setGoogleUser(null);
    // Also clear server-side session
    fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
    disconnect();
  }, [disconnect]);

  // M11: Clear server session when wallet disconnects externally
  useEffect(() => {
    if (!isConnected && isAuthenticated) {
      localStorage.removeItem(SESSION_KEY);
      setIsAuthenticated(false);
      fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
    }
  }, [isConnected, isAuthenticated]);

  // M4 fix: Don't auto-sign on connect. Expose needsSignIn state for UI prompt.
  const needsSignIn = isConnected && !!address && !isAuthenticated && !isAuthenticating;

  return (
    <WalletContext.Provider value={{ address, isConnected, isAuthenticated, isAuthenticating, needsSignIn, authError, googleUser, signIn, signOut }}>
      {children}
    </WalletContext.Provider>
  );
}
