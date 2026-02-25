"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useWallet } from "@/lib/wallet";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "https://api.sigil.codes/v1").trim();
const NEON = "#00FF88";

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Login cancelled",
  invalid_state: "Session expired — please try again",
  token_exchange_failed: "Google login failed — please try again",
  userinfo_failed: "Could not fetch your Google profile",
  registration_failed: "Registration failed — please try again",
  server_error: "Something went wrong — please try again",
  missing_params: "Invalid callback — please try again",
};

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isConnected, signIn, needsSignIn } = useWallet();
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showWalletWarning, setShowWalletWarning] = useState(false);
  const [showWalletConnect, setShowWalletConnect] = useState(false);
  const error = searchParams.get("error");

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
        if (res.ok) {
          const user = await res.json();
          if (user.authMethod === "google") {
            setGoogleUser(user);
            if (user.wallet_address) { router.push("/dashboard"); return; }
          } else if (user.authMethod === "siwe") {
            router.push("/dashboard"); return;
          }
        }
      } catch {}
      setLoading(false);
    }
    checkAuth();
  }, [router]);

  const isReady = isAuthenticated && isConnected;

  useEffect(() => {
    if (isReady) router.push("/dashboard");
  }, [isReady, router]);

  // Auto-trigger SIWE when wallet already connected and warning dismissed
  useEffect(() => {
    if (showWalletConnect && needsSignIn) {
      signIn();
    }
  }, [showWalletConnect, needsSignIn, signIn]);

  function handleGoogleLogin() {
    window.location.href = `${API_BASE}/auth/google?redirect=/dashboard`;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="animate-pulse text-white/40">Loading...</div>
      </div>
    );
  }

  // Google user logged in but no wallet linked yet
  if (googleUser && !googleUser.wallet_address) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <Image src="/sigil-symbol.svg" alt="Sigil" width={48} height={48} className="mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Welcome, {googleUser.name}!</h1>
            <p className="text-white/40">Connect your wallet to access the dashboard.</p>
          </div>

          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: `${NEON}10`, border: `1px solid ${NEON}20` }}>
              {googleUser.avatar_url && (
                <img src={googleUser.avatar_url} alt="" className="w-10 h-10 rounded-full" />
              )}
              <div>
                <div className="font-medium text-sm">{googleUser.email}</div>
                <div className="text-xs" style={{ color: NEON }}>✓ Signed in with Google</div>
              </div>
            </div>

            <div className="pt-2">
              <p className="text-sm text-white/40 mb-3">
                Your wallet address will be linked to your Google login for on-chain operations.
              </p>
              <div className="flex justify-center">
                <ConnectButton label="Connect Wallet" />
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-white/25 mt-4">
            <Link href="/" className="hover:text-white transition-colors">← Back to home</Link>
          </p>
        </div>
      </div>
    );
  }

  // Post-auth: show dashboard button if redirect didn't fire
  if (isReady) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <Image src="/sigil-symbol.svg" alt="Sigil" width={48} height={48} className="mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">You&apos;re in! 🎉</h1>
          <p className="text-white/40 text-sm mb-6">Signed in successfully. Redirecting...</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-6 py-3 rounded-xl font-medium transition-colors"
            style={{ backgroundColor: NEON, color: "#050505" }}
          >
            Go to Dashboard →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <Image src="/sigil-symbol.svg" alt="Sigil" width={48} height={48} className="mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Sign in to Sigil</h1>
          <p className="text-white/40 text-sm">Protect your AI agent&apos;s wallet</p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-[#F04452]/10 border border-[#F04452]/20 text-[#F04452] text-sm text-center">
            {ERROR_MESSAGES[error] || error}
          </div>
        )}

        {/* Login options */}
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 space-y-4">
          {/* Google OAuth */}
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white hover:bg-gray-50 transition-colors text-gray-800 font-medium"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-white/5" />
            <span className="text-xs text-white/25">or</span>
            <div className="flex-1 border-t border-white/5" />
          </div>

          {/* Wallet Only - shows warning first */}
          {!showWalletConnect ? (
            <button
              onClick={() => setShowWalletWarning(true)}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-white font-medium"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="6" width="20" height="14" rx="2" />
                <path d="M2 10h20" />
                <circle cx="16" cy="15" r="2" />
              </svg>
              Continue with Wallet
            </button>
          ) : (
            <div className="flex justify-center">
              <ConnectButton label="Connect Wallet" />
            </div>
          )}

          <p className="text-xs text-white/25 text-center">
            Wallet login uses Sign-In with Ethereum (SIWE)
          </p>
        </div>

        {/* Footer links */}
        <div className="mt-6 text-center space-y-2">
          <p className="text-xs text-white/25">
            New here?{" "}
            <Link href="/docs" className="hover:underline" style={{ color: NEON }}>
              Read the docs →
            </Link>
          </p>
          <p className="text-xs text-white/25">
            <Link href="/" className="hover:text-white transition-colors">
              ← Back to home
            </Link>
          </p>
        </div>
      </div>

      {/* Wallet-only warning modal */}
      {showWalletWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="max-w-sm w-full rounded-2xl border border-white/10 bg-[#0a0a0a] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg" style={{ backgroundColor: `${NEON}15`, color: NEON }}>
                ⚠️
              </div>
              <h3 className="text-lg font-semibold">No email recovery</h3>
            </div>

            <p className="text-sm text-white/60 leading-relaxed">
              Signing in with only a wallet means <strong className="text-white/80">you won&apos;t have email-based recovery</strong> if you lose access to your wallet.
            </p>

            <ul className="text-sm text-white/50 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-[#F04452] mt-0.5">✕</span>
                No password reset or account recovery via email
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#F04452] mt-0.5">✕</span>
                No email notifications for security alerts
              </li>
              <li className="flex items-start gap-2">
                <span style={{ color: NEON }} className="mt-0.5">✓</span>
                You can link an email later from settings
              </li>
            </ul>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowWalletWarning(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-sm font-medium"
              >
                ← Back
              </button>
              <button
                onClick={async () => {
                  setShowWalletWarning(false);
                  if (isConnected && needsSignIn) {
                    await signIn();
                  } else {
                    setShowWalletConnect(true);
                  }
                }}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{ backgroundColor: `${NEON}15`, color: NEON, border: `1px solid ${NEON}30` }}
              >
                Proceed anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#050505]" />}>
      <LoginPageInner />
    </Suspense>
  );
}
