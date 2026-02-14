"use client";

import { useState, useEffect } from "react";
import { useChainId } from "wagmi";
import { parseEther, encodeFunctionData } from "viem";
import { useWallet } from "@/lib/wallet";
import { getStoredAccount, getNativeToken } from "@/lib/contracts";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.sigil.codes/v1";

const COMMON_FUNCTIONS = [
  { label: "Native Transfer (no data)", value: "" },
  { label: "ERC20 transfer(address,uint256)", value: "0xa9059cbb" },
  { label: "ERC20 approve(address,uint256)", value: "0x095ea7b3" },
  { label: "Uniswap swapExactTokensForTokens", value: "0x38ed1739" },
  { label: "Custom (enter hex)", value: "custom" },
];

type LayerResult = {
  pass: boolean;
  reason: string;
  details?: string;
  score?: number;
  gasEstimate?: string;
};

type Guidance = {
  message: string;
  action?: string;
  suggestedBundle?: { id: string; name: string; icon: string };
};

type EvalResult = {
  verdict: "APPROVE" | "REJECT" | "ESCALATE";
  layer1: LayerResult;
  layer2: LayerResult;
  layer3: LayerResult & { score: number };
  guidance?: Guidance;
};

function LayerCard({ num, title, result, animDelay }: { num: number; title: string; result: LayerResult | null; animDelay: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (result) {
      const t = setTimeout(() => setVisible(true), animDelay);
      return () => clearTimeout(t);
    }
    setVisible(false);
  }, [result, animDelay]);

  if (!visible && result) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-sm font-bold text-indigo-400">{num}</div>
          <span className="text-sm text-gray-400">{title}</span>
          <div className="ml-auto animate-spin h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="rounded-xl border border-white/5/50 bg-white/[0.02]/50 p-5 opacity-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-sm font-bold text-gray-600">{num}</div>
          <span className="text-sm text-gray-600">{title}</span>
        </div>
      </div>
    );
  }

  const borderColor = result.pass ? "border-[#00FF88]/30" : "border-[#F04452]/30";
  const icon = result.pass ? "✅" : "❌";

  return (
    <div className={`rounded-xl border ${borderColor} bg-white/[0.02] p-5 transition-all duration-500`}>
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${result.pass ? "bg-[#00FF88]/10 text-[#00FF88]" : "bg-[#F04452]/10 text-[#F04452]"}`}>
          {icon}
        </div>
        <span className="font-semibold text-sm">{title}</span>
        <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded ${result.pass ? "bg-[#00FF88]/10 text-[#00FF88]" : "bg-[#F04452]/10 text-[#F04452]"}`}>
          {result.pass ? "PASS" : "FAIL"}
        </span>
      </div>
      <p className="text-sm text-gray-400 ml-11">{result.reason}</p>
      {result.gasEstimate && (
        <p className="text-xs text-gray-500 ml-11 mt-1 font-mono">Gas estimate: {result.gasEstimate}</p>
      )}
      {"score" in result && result.score !== undefined && (
        <div className="ml-11 mt-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Risk Score:</span>
            <span className={`text-sm font-bold font-mono ${result.score < 30 ? "text-[#00FF88]" : result.score < 70 ? "text-[#F4A524]" : "text-[#F04452]"}`}>
              {result.score}/100
            </span>
          </div>
          <div className="mt-1 h-1.5 bg-gray-800 rounded-full overflow-hidden w-32">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${result.score < 30 ? "bg-[#00FF88]" : result.score < 70 ? "bg-[#F4A524]" : "bg-[#F04452]"}`}
              style={{ width: `${result.score}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function EvaluatePage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { address, isAuthenticated } = useWallet();
  const chainId = useChainId();
  const accountAddress = mounted ? getStoredAccount(chainId) : null;

  const [target, setTarget] = useState("");
  const [value, setValue] = useState("");
  const [fnSelector, setFnSelector] = useState("");
  const [customData, setCustomData] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [result, setResult] = useState<EvalResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const callData = fnSelector === "custom" ? customData : fnSelector || "0x";

  async function handleEvaluate() {
    if (!target || !accountAddress) return;
    setEvaluating(true);
    setResult(null);
    setError(null);

    try {
      const valueWei = value ? parseEther(value) : BigInt(0);
      const innerData = (callData && callData !== "0x") ? callData as `0x${string}` : "0x" as `0x${string}`;

      // Encode as SigilAccount.execute(address target, uint256 value, bytes data)
      const encodedCallData = encodeFunctionData({
        abi: [{
          name: "execute",
          type: "function",
          inputs: [
            { name: "target", type: "address" },
            { name: "value", type: "uint256" },
            { name: "data", type: "bytes" },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        }],
        functionName: "execute",
        args: [target as `0x${string}`, valueWei, innerData],
      });

      // M2 fix: Use higher gas defaults to handle network congestion
      // These are upper bounds — actual gas used will be lower
      const userOp = {
        sender: accountAddress,
        nonce: "0x0",
        callData: encodedCallData,
        callGasLimit: "0x7A120",            // 500k — generous for complex calls
        verificationGasLimit: "0x30000",    // 192k — sufficient for multi-sig validation
        preVerificationGas: "0x10000",      // 64k — standard
        maxFeePerGas: "0x174876E800",       // 100 gwei — handles most congestion
        maxPriorityFeePerGas: "0x77359400", // 2 gwei — reasonable priority
        signature: "0x",
      };

      const res = await fetch(`${API_BASE}/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userOp, chainId }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `API error: ${res.status}`);
      }

      const data = await res.json();
      // Map guardian response to frontend format
      const mapLayer = (l: any): LayerResult | null => {
        if (!l) return null;
        return {
          pass: l.result === 'PASS' || l.result === 'APPROVE' || l.result === 'SAFE',
          reason: l.reasoning || l.reason || (l.checks?.find((c: any) => !c.passed)?.detail) || (l.result === 'SKIPPED' ? 'Skipped' : l.result),
          details: l.details ? JSON.stringify(l.details) : undefined,
          score: l.score,
          gasEstimate: l.gasEstimate,
        };
      };
      setResult({
        verdict: data.verdict === 'APPROVED' ? 'APPROVE' : data.verdict === 'REJECTED' ? 'REJECT' : 'ESCALATE',
        layer1: mapLayer(data.layers?.layer1) || { pass: false, reason: 'No response' },
        layer2: mapLayer(data.layers?.layer2) || { pass: true, reason: 'Not evaluated' },
        layer3: { ...(mapLayer(data.layers?.layer3) || { pass: true, reason: 'Not evaluated' }), score: data.layers?.layer3?.score ?? 0 },
        guidance: data.guidance,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(`Guardian evaluation failed: ${msg}. Do NOT proceed without Guardian verification.`);
    } finally {
      setEvaluating(false);
    }
  }

  if (!mounted) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Evaluate Transaction</h1>
        <p className="text-sm text-white/40 mt-1">Test how the Guardian evaluates a transaction through all 3 security layers.</p>
      </div>

      {!accountAddress && (
        <div className="p-4 bg-[#00FF88]/10 border border-[#00FF88]/20 rounded-xl text-sm">
          <span className="text-[#00FF88]">ℹ️ No Sigil account found on this chain. </span>
          <a href="/onboarding" className="text-[#00FF88] underline hover:no-underline">Deploy one first →</a>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Input Form */}
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 space-y-4">
          <h2 className="font-semibold">Transaction Parameters</h2>

          <div>
            <label className="text-xs text-white/40 block mb-1">Target Address</label>
            <input
              type="text"
              value={target}
              onChange={e => setTarget(e.target.value)}
              placeholder="0x..."
              className="w-full bg-[#050505] border border-white/5 rounded-lg px-3 py-2.5 text-sm font-mono focus:border-[#00FF88] outline-none"
            />
          </div>

          <div>
            <label className="text-xs text-white/40 block mb-1">Value ({getNativeToken(chainId)})</label>
            <input
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="0.0"
              className="w-full bg-[#050505] border border-white/5 rounded-lg px-3 py-2.5 text-sm font-mono focus:border-[#00FF88] outline-none"
            />
          </div>

          <div>
            <label className="text-xs text-white/40 block mb-1">Function</label>
            <select
              value={fnSelector}
              onChange={e => setFnSelector(e.target.value)}
              className="w-full bg-[#050505] border border-white/5 rounded-lg px-3 py-2.5 text-sm focus:border-[#00FF88] outline-none"
            >
              {COMMON_FUNCTIONS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>

          {fnSelector === "custom" && (
            <div>
              <label className="text-xs text-white/40 block mb-1">Call Data (hex)</label>
              <textarea
                value={customData}
                onChange={e => setCustomData(e.target.value)}
                placeholder="0x..."
                rows={3}
                className="w-full bg-[#050505] border border-white/5 rounded-lg px-3 py-2.5 text-sm font-mono focus:border-[#00FF88] outline-none resize-none"
              />
            </div>
          )}

          <button
            onClick={handleEvaluate}
            disabled={!target || evaluating}
            className="w-full py-3 bg-[#00FF88] hover:brightness-110 text-[#050505] disabled:bg-gray-700 disabled:text-gray-500 text-[#050505] rounded-xl font-medium transition-colors"
          >
            {evaluating ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Evaluating...
              </span>
            ) : "🔍 Evaluate Transaction"}
          </button>
        </div>

        {/* Results */}
        <div className="space-y-4">
          <h2 className="font-semibold">Security Pipeline</h2>

          {/* Pipeline visualization */}
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
            <span className={result?.layer1 ? "text-white" : ""}>Layer 1</span>
            <span>→</span>
            <span className={result?.layer2 ? "text-white" : ""}>Layer 2</span>
            <span>→</span>
            <span className={result?.layer3 ? "text-white" : ""}>Layer 3</span>
            <span>→</span>
            <span className={result?.verdict ? "text-white font-bold" : ""}>Verdict</span>
          </div>

          <LayerCard num={1} title="Policy Rules Engine" result={result?.layer1 || null} animDelay={0} />
          <LayerCard num={2} title="Transaction Simulation" result={result?.layer2 || null} animDelay={400} />
          <LayerCard num={3} title="AI Risk Analysis" result={result?.layer3 || null} animDelay={800} />

          {/* Verdict */}
          {result?.verdict && (
            <div className={`rounded-xl border-2 p-5 text-center transition-all duration-500 ${
              result.verdict === "APPROVE"
                ? "border-[#00FF88] bg-[#00FF88]/5"
                : result.verdict === "REJECT"
                ? "border-[#F04452] bg-[#F04452]/5"
                : "border-[#F4A524] bg-[#F4A524]/5"
            }`}>
              <div className="text-3xl mb-2">
                {result.verdict === "APPROVE" ? "✅" : result.verdict === "REJECT" ? "🚫" : "⚠️"}
              </div>
              <div className={`text-xl font-bold ${
                result.verdict === "APPROVE" ? "text-[#00FF88]" : result.verdict === "REJECT" ? "text-[#F04452]" : "text-[#F4A524]"
              }`}>
                {result.verdict}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {result.verdict === "APPROVE" && "Transaction passes all security layers"}
                {result.verdict === "REJECT" && "Transaction blocked by security policy"}
                {result.verdict === "ESCALATE" && "Requires guardian or owner approval"}
              </div>
            </div>
          )}

          {/* Actionable Guidance */}
          {result?.verdict === "REJECT" && result.guidance && (
            <div className="rounded-xl border border-[#00FF88]/20 bg-[#00FF88]/5 p-4 space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-lg">💡</span>
                <div>
                  <p className="text-sm font-medium text-[#00FF88]">How to fix this</p>
                  <p className="text-sm text-gray-300 mt-1">{result.guidance.message}</p>
                  {result.guidance.suggestedBundle && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-lg">{result.guidance.suggestedBundle.icon}</span>
                      <span className="text-sm font-medium">{result.guidance.suggestedBundle.name} Bundle</span>
                      <a
                        href="/dashboard"
                        className="ml-auto text-xs px-3 py-1.5 bg-[#00FF88]/10 text-[#00FF88] rounded-lg hover:bg-[#00FF88]/30 transition-colors"
                      >
                        Enable in Policies →
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-[#F04452]/30 bg-[#F04452]/5 p-4 text-sm text-[#F04452]">
              ⚠ {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
