"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.sigil.codes/v1";

interface RegistrationStatus {
  total_registered: number;
  free_spots_total: number;
  free_spots_remaining: number;
  is_registration_open: boolean;
}

export default function RegistrationBanner() {
  const [status, setStatus] = useState<RegistrationStatus | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/registration/status`)
      .then(res => res.json())
      .then(setStatus)
      .catch(() => setError(true));
  }, []);

  if (error || !status) return null;

  const { free_spots_remaining, free_spots_total } = status;
  const percentUsed = ((free_spots_total - free_spots_remaining) / free_spots_total) * 100;

  // Scarcity colors
  const barColor =
    free_spots_remaining > 50 ? "bg-green-500" :
    free_spots_remaining > 20 ? "bg-yellow-500" :
    free_spots_remaining > 0 ? "bg-red-500" :
    "bg-gray-500";

  const textColor =
    free_spots_remaining > 50 ? "text-green-400" :
    free_spots_remaining > 20 ? "text-yellow-400" :
    free_spots_remaining > 0 ? "text-red-400" :
    "text-gray-400";

  const borderColor =
    free_spots_remaining > 50 ? "border-green-500/30" :
    free_spots_remaining > 20 ? "border-yellow-500/30" :
    free_spots_remaining > 0 ? "border-red-500/30" :
    "border-gray-500/30";

  return (
    <div className={`relative overflow-hidden rounded-2xl border ${borderColor} bg-gradient-to-r from-[#050505] to-[#111820] p-8 mb-8`}>
      {/* Animated background glow */}
      <div className={`absolute top-0 right-0 w-64 h-64 ${barColor} opacity-5 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2`} />

      <div className="relative z-10">
        <div className="flex items-start justify-between gap-8">
          <div className="flex-1">
            <div className="text-3xl mb-2">🚀</div>
            <h2 className="text-2xl md:text-3xl font-bold mb-3">
              {free_spots_remaining > 0
                ? "First 100 users get FREE lifetime access"
                : "Free spots are full!"}
            </h2>
            <p className="text-white/40 text-lg mb-4">
              {free_spots_remaining > 0
                ? "Register now and get a referral code to share with a friend — they get free access too."
                : "You can still join with a referral code or subscribe for $5/month."}
            </p>

            <div className="flex items-center gap-4">
              <Link
                href="/onboarding"
                className="px-6 py-3 bg-[#00FF88] hover:brightness-110 text-[#050505] rounded-xl font-medium transition-all hover:scale-[1.02]"
              >
                {free_spots_remaining > 0 ? "Claim Your Spot →" : "Get Started →"}
              </Link>
              <Link
                href="/pricing"
                className="px-6 py-3 border border-white/5 hover:border-white/20 text-white/40 rounded-xl font-medium transition-colors"
              >
                View Pricing
              </Link>
            </div>
          </div>

          {/* Counter */}
          <div className="text-right shrink-0">
            <div className={`text-5xl font-bold font-mono ${textColor}`}>
              {free_spots_remaining}
            </div>
            <div className="text-sm text-white/40 mt-1">spots remaining</div>
            <div className="text-xs text-white/40 mt-0.5">of {free_spots_total} total</div>

            {/* Progress bar */}
            <div className="mt-3 w-40 h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full ${barColor} rounded-full transition-all duration-1000`}
                style={{ width: `${percentUsed}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
