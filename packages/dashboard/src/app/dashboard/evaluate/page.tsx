"use client";

import { useState, useEffect } from "react";
import { parseEther, encodeFunctionData } from "viem";
import { useWallet } from "@/lib/wallet";
import { useViewChain } from "@/lib/view-chain";
import { getStoredAccount, getNativeToken } from "@/lib/contracts";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "https://api.sigil.codes/v1").trim();

const FUNCTION_CATEGORIES = [
  {
    category: "Common",
    items: [
      { label: "Native Transfer (no data)", value: "", desc: "Send native tokens directly" },
    ],
  },
  {
    category: "ERC-20",
    items: [
      { label: "transfer(address,uint256)", value: "0xa9059cbb", desc: "Send tokens to address" },
      { label: "approve(address,uint256)", value: "0x095ea7b3", desc: "Approve spender allowance" },
      { label: "transferFrom(address,address,uint256)", value: "0x23b872dd", desc: "Transfer on behalf of Origin Wallet" },
    ],
  },
  {
    category: "ERC-721",
    items: [
      { label: "safeTransferFrom(address,address,uint256)", value: "0x42842e0e", desc: "Transfer NFT safely" },
      { label: "setApprovalForAll(address,bool)", value: "0xa22cb465", desc: "Approve all NFTs for operator" },
    ],
  },
  {
    category: "DEX / Swap",
    items: [
      { label: "swapExactTokensForTokens", value: "0x38ed1739", desc: "Swap exact input amount" },
      { label: "swapExactETHForTokens", value: "0x7ff36ab5", desc: "Swap native → tokens" },
      { label: "swapExactTokensForETH", value: "0x18cbafe5", desc: "Swap tokens → native" },
      { label: "exactInputSingle (V3)", value: "0x414bf389", desc: "Uniswap V3 single-hop swap" },
    ],
  },
  {
    category: "Lending",
    items: [
      { label: "supply(address,uint256,address,uint16)", value: "0x617ba037", desc: "Supply to lending pool" },
      { label: "borrow(address,uint256,uint256,uint16,address)", value: "0xa415bcad", desc: "Borrow from pool" },
      { label: "repay(address,uint256,uint256,address)", value: "0x573ade81", desc: "Repay borrowed amount" },
    ],
  },
  {
    category: "Staking / Wrapping",
    items: [
      { label: "stake(uint256)", value: "0xa694fc3a", desc: "Stake tokens" },
      { label: "deposit() — wrap native", value: "0xd0e30db0", desc: "Wrap to WAVAX/WETH" },
      { label: "withdraw(uint256) — unwrap", value: "0x2e1a7d4d", desc: "Unwrap to native" },
    ],
  },
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

  const { address, isAuthenticated, needsSignIn, signIn } = useWallet();
  const [signingIn, setSigningIn] = useState(false);
  const { viewChainId: chainId } = useViewChain();
  const accountAddress = mounted ? getStoredAccount(chainId) : null;

  const [target, setTarget] = useState("");
  const [value, setValue] = useState("");
  const [fnSelector, setFnSelector] = useState("");
  const [customData, setCustomData] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [result, setResult] = useState<EvalResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [execTxHash, setExecTxHash] = useState<string | null>(null);
  const [execError, setExecError] = useState<string | null>(null);

  const callData = fnSelector === "custom" ? customData : fnSelector || "0x";
  const isApproved = result?.verdict === "APPROVE";

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
        accountGasLimits: "0x00000000000000000000000000030000000000000000000000000000007a120", // vgl=192k, cgl=500k
        preVerificationGas: "0x10000",      // 64k — standard
        gasFees: "0x00000000000000000000000077359400000000000000000000000174876e800", // prio=2gwei, max=100gwei
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
      const verdict = data.verdict === 'APPROVED' ? 'APPROVE' : data.verdict === 'REJECTED' ? 'REJECT' : 'ESCALATE';
      const isRejected = verdict === 'REJECT';
      setResult({
        verdict,
        layer1: mapLayer(data.layers?.layer1) || { pass: false, reason: 'No response' },
        layer2: mapLayer(data.layers?.layer2) || { pass: !isRejected, reason: isRejected ? 'Skipped — blocked by earlier layer' : 'Not evaluated' },
        layer3: { ...(mapLayer(data.layers?.layer3) || { pass: !isRejected, reason: isRejected ? 'Skipped — blocked by earlier layer' : 'Not evaluated' }), score: data.layers?.layer3?.score ?? 0 },
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

      {needsSignIn && (
        <div className="p-4 bg-[#F4A524]/10 border border-[#F4A524]/30 rounded-xl text-sm flex items-center justify-between">
          <span className="text-[#F4A524]">🔐 Sign in with your wallet to evaluate transactions</span>
          <button
            onClick={async () => { setSigningIn(true); try { await signIn(); } catch {} setSigningIn(false); }}
            disabled={signingIn}
            className="px-4 py-1.5 bg-[#00FF88] text-[#050505] rounded-lg text-xs font-medium hover:brightness-110 disabled:opacity-50"
          >{signingIn ? "Signing..." : "Sign In"}</button>
        </div>
      )}

      {!accountAddress && (
        <div className="p-4 bg-[#00FF88]/10 border border-[#00FF88]/20 rounded-xl text-sm">
          <span className="text-[#00FF88]">ℹ️ No Sigil Wallet found on this chain. </span>
          <a href="/onboarding" className="text-[#00FF88] underline hover:no-underline">Deploy one first →</a>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Input Form */}
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 space-y-4">
          <h2 className="font-semibold">Transaction Parameters</h2>

          <div>
            <label className="text-xs text-white/40 block mb-1">Target Address</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={target}
                onChange={e => setTarget(e.target.value)}
                onPaste={e => { e.preventDefault(); setTarget(e.clipboardData.getData('text').trim()); }}
                placeholder="0x..."
                autoComplete="off"
                spellCheck={false}
                className="flex-1 bg-[#050505] border border-white/5 rounded-lg px-3 py-2.5 text-sm font-mono focus:border-[#00FF88] outline-none"
              />
              <button
                type="button"
                onClick={async () => { try { const t = await navigator.clipboard.readText(); setTarget(t.trim()); } catch {} }}
                className="px-3 py-2.5 bg-white/5 border border-white/5 rounded-lg text-xs text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                title="Paste from clipboard"
              >📋</button>
            </div>
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
              {FUNCTION_CATEGORIES.map(cat => (
                <optgroup key={cat.category} label={cat.category}>
                  {cat.items.map(f => (
                    <option key={`${cat.category}-${f.value}`} value={f.value}>
                      {f.label}{f.desc ? ` — ${f.desc}` : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value="custom">Custom (enter hex)</option>
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
            className="w-full py-3 bg-[#00FF88] hover:brightness-110 text-[#050505] disabled:bg-gray-700 disabled:text-gray-500 rounded-xl font-medium transition-colors"
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
                {result.verdict === "ESCALATE" && "Requires guardian or Origin Wallet approval"}
              </div>
            </div>
          )}

          {/* Execute Transaction Button */}
          {result?.verdict && (
            <div className="space-y-2">
              <button
                onClick={async () => {
                  if (!accountAddress || !target) return;
                  setExecuting(true);
                  setExecError(null);
                  setExecTxHash(null);
                  try {
                    const provider = (window as any).ethereum;
                    if (!provider) throw new Error("No wallet found — install MetaMask or another Web3 wallet");

                    const valueWei = value ? parseEther(value) : BigInt(0);
                    const innerData = (callData && callData !== "0x") ? callData as `0x${string}` : "0x" as `0x${string}`;
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

                    // Owner calls SigilAccount.execute() directly
                    // value is 0 — the inner value comes from the Sigil account's balance
                    const hash = await provider.request({
                      method: "eth_sendTransaction",
                      params: [{
                        from: address,
                        to: accountAddress,
                        data: encodedCallData,
                        value: "0x0",
                      }],
                    });
                    setExecTxHash(hash);
                  } catch (err: any) {
                    if (err?.code === 4001) {
                      setExecError("Transaction rejected by user");
                    } else {
                      setExecError(err instanceof Error ? err.message : JSON.stringify(err));
                    }
                  } finally {
                    setExecuting(false);
                  }
                }}
                disabled={!isApproved || executing}
                className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all duration-300 ${
                  isApproved
                    ? "bg-[#00FF88] hover:brightness-110 text-[#050505] cursor-pointer"
                    : "bg-gray-800 text-gray-500 cursor-not-allowed"
                }`}
              >
                {executing ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin h-4 w-4 border-2 border-[#050505] border-t-transparent rounded-full" />
                    Sending...
                  </span>
                ) : isApproved ? "⚡ Execute Transaction" : "🔒 Evaluate first to unlock"}
              </button>
              {!isApproved && result.verdict !== "APPROVE" && (
                <p className="text-xs text-center text-white/30">Transaction must pass all 3 security layers before execution</p>
              )}
              {execTxHash && (
                <div className="rounded-xl border border-[#00FF88]/30 bg-[#00FF88]/5 p-4 text-center space-y-1">
                  <p className="text-sm font-medium text-[#00FF88]">✅ Transaction Sent!</p>
                  <p className="text-xs font-mono text-white/60 break-all">{execTxHash}</p>
                </div>
              )}
              {execError && (
                <div className="rounded-xl border border-[#F04452]/30 bg-[#F04452]/5 p-3 text-sm text-[#F04452]">
                  ⚠ {execError}
                </div>
              )}
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
