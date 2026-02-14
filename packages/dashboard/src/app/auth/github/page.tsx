"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.sigil.codes/v1";

function GitHubCallbackInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Completing GitHub authentication...");

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      setStatus("error");
      setMessage(`GitHub auth failed: ${error}`);
      return;
    }

    if (!code) {
      setStatus("error");
      setMessage("Missing authorization code");
      return;
    }

    // Exchange code for token via our API
    fetch(`${API_BASE}/auth/github/callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ code, state }),
    })
      .then(async res => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        setStatus("success");
        setMessage("GitHub connected! Redirecting...");
        // Store GitHub info for the session
        if (data.github_username) {
          localStorage.setItem("sigil-github", JSON.stringify({
            username: data.github_username,
            id: data.github_id,
          }));
        }
        setTimeout(() => router.push("/onboarding"), 1500);
      })
      .catch(err => {
        setStatus("error");
        setMessage(err.message || "Failed to authenticate with GitHub");
      });
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4">
          {status === "loading" && "⏳"}
          {status === "success" && "✅"}
          {status === "error" && "❌"}
        </div>
        <h1 className="text-xl font-bold mb-2">GitHub Authentication</h1>
        <p className="text-white/40">{message}</p>
        {status === "error" && (
          <button
            onClick={() => router.push("/onboarding")}
            className="mt-6 px-6 py-2 bg-[#00FF88] rounded-lg text-[#050505] font-medium"
          >
            Back to Onboarding
          </button>
        )}
      </div>
    </div>
  );
}

export default function GitHubCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-white/40">Loading...</p>
        </div>
      </div>
    }>
      <GitHubCallbackInner />
    </Suspense>
  );
}
