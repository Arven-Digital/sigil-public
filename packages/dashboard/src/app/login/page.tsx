"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useWallet } from "@/lib/wallet";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.sigil.codes/v1";
const NEON = "#00FF88";

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Login cancelled",
  invalid_state: "Session expired — please try again",
  token_exchange_failed: "Google login failed — please try again",
  userinfo_failed: "Could not fetch your Google profile",
  registration_failed: "Account creation failed — please try again",
  server_error: "Something went wrong — please try again",
  missing_params: "Invalid callback — please try again",
};

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isConnected } = useWallet();
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    if (isAuthenticated && isConnected) router.push("/dashboard");
  }, [isAuthenticated, isConnected, router]);

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
                Your wallet address will be linked to your Google account for on-chain operations.
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

          {/* Wallet Connect */}
          <div className="flex justify-center">
            <ConnectButton label="Connect Wallet" />
          </div>

          <p className="text-xs text-white/25 text-center">
            Wallet login uses Sign-In with Ethereum (SIWE)
          </p>
        </div>

        {/* Footer links */}
        <div className="mt-6 text-center space-y-2">
          <p className="text-xs text-white/25">
            New here?{" "}
            <Link href="/onboarding" className="hover:underline" style={{ color: NEON }}>
              Get started →
            </Link>
          </p>
          <p className="text-xs text-white/25">
            <Link href="/" className="hover:text-white transition-colors">
              ← Back to home
            </Link>
          </p>
        </div>
      </div>
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
