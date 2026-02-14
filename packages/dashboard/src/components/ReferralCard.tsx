"use client";

import { useEffect, useState, useCallback } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.sigil.codes/v1";

interface ReferralData {
  code: string;
  type: string;
  is_used: boolean;
  used_at: string | null;
  plan: string;
}

interface SubscriptionData {
  subscription: {
    plan: string;
    status: string;
    created_at: string;
    expires_at: string | null;
  };
}

export default function ReferralCard() {
  const [referral, setReferral] = useState<ReferralData | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/registration/my-referral`, { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),
      fetch(`${API_BASE}/registration/my-subscription`, { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),
    ]).then(([ref, sub]) => {
      setReferral(ref);
      setSubscription(sub);
      setLoading(false);
    });
  }, []);

  const copyCode = useCallback(() => {
    if (!referral?.code) return;
    navigator.clipboard.writeText(referral.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [referral?.code]);

  if (loading) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 animate-pulse">
        <div className="h-4 bg-white/5 rounded w-1/3 mb-4" />
        <div className="h-8 bg-white/5 rounded w-2/3" />
      </div>
    );
  }

  if (!subscription) return null;

  const plan = subscription.subscription.plan;
  const planLabels: Record<string, { label: string; emoji: string; color: string }> = {
    free_early: { label: "Free (Early Adopter)", emoji: "🌟", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30" },
    free_referral: { label: "Free (Referred)", emoji: "🤝", color: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
    monthly: { label: "Pro Monthly ($5/mo)", emoji: "💎", color: "text-purple-400 bg-purple-500/10 border-purple-500/30" },
    yearly: { label: "Pro Yearly ($50/yr)", emoji: "💎", color: "text-purple-400 bg-purple-500/10 border-purple-500/30" },
  };

  const planInfo = planLabels[plan] ?? { label: plan, emoji: "📋", color: "text-gray-400 bg-gray-500/10 border-gray-500/30" };

  return (
    <div className="space-y-4">
      {/* Plan Badge */}
      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border ${planInfo.color}`}>
        <span>{planInfo.emoji}</span>
        <span className="font-medium text-sm">{planInfo.label}</span>
      </div>

      {/* Referral Code */}
      {referral && (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Your Referral Code</h3>
            {referral.is_used ? (
              <span className="text-xs px-2 py-1 rounded-md bg-white/5 text-white/40">Used</span>
            ) : (
              <span className="text-xs px-2 py-1 rounded-md bg-[#00FF88]/10 text-[#00FF88]">Active</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <code className="flex-1 px-4 py-3 bg-[#050505] rounded-lg font-mono text-lg tracking-widest text-center border border-white/5">
              {referral.code}
            </code>
            <button
              onClick={copyCode}
              disabled={referral.is_used}
              className="px-4 py-3 rounded-lg bg-[#00FF88] hover:brightness-110 text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          <p className="text-xs text-white/40 mt-3">
            {referral.is_used
              ? `This code was used on ${new Date(referral.used_at!).toLocaleDateString()}.`
              : "Share this code with a friend — they get free lifetime access to Sigil."}
          </p>
        </div>
      )}

      {/* Subscription Details */}
      {(plan === "monthly" || plan === "yearly") && subscription.subscription.expires_at && (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
          <h3 className="font-semibold mb-3">Subscription Details</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-white/40">Status</span>
              <span className="text-[#00FF88] capitalize">{subscription.subscription.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Renews</span>
              <span>{new Date(subscription.subscription.expires_at).toLocaleDateString()}</span>
            </div>
          </div>
          <button className="mt-4 w-full py-2 rounded-lg border border-white/5 hover:border-white/20 text-sm text-white/40 transition-colors">
            Manage Subscription
          </button>
        </div>
      )}
    </div>
  );
}
