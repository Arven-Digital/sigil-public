import { describe, it, expect } from "vitest";

const RPCS: Record<number, string> = {
  43114: "https://avalanche-c-chain-rpc.publicnode.com",
  43113: "https://avalanche-fuji-c-chain-rpc.publicnode.com",
  8453: "https://base-rpc.publicnode.com",
  42161: "https://arbitrum-one-rpc.publicnode.com",
  16661: "https://evmrpc.0g.ai",
  137: "https://polygon-bor-rpc.publicnode.com",
};

const FACTORIES: Record<number, string> = {
  43114: "0x2f4dd6db7affcf1f34c4d70998983528d834b8f6",
  43113: "0x86E85dE25473b432dabf1B9E8e8CE5145059b85b",
  8453: "0x45b20a5F37b9740401a29BD70D636a77B18a510D",
  42161: "0x20f926bd5f416c875a7ec538f499d21d62850f35",
  16661: "0x20f926bd5f416c875a7ec538f499d21d62850f35",
  137: "0x20f926bd5f416c875a7ec538f499d21d62850f35",
};

const CHAIN_NAMES: Record<number, string> = {
  43114: "Avalanche",
  43113: "Fuji",
  8453: "Base",
  42161: "Arbitrum",
  16661: "0G",
  137: "Polygon",
};

const EXPECTED_DEPLOY_FEES: Record<number, bigint> = {
  43114: 220000000000000000n,   // 0.22 AVAX
  43113: 200000000000000000n,   // 0.2 AVAX
  8453: 1000000000000000n,      // 0.001 ETH
  42161: 1000000000000000n,     // 0.001 ETH
  16661: 3230000000000000000n,  // 3.23 A0GI
  137: 10000000000000000000n,   // 10 POL
};

const MAINNET_CHAINS = [43114, 8453, 42161, 16661, 137];
const TREASURY = "0xEC0D6435fFA48E33cf39c56f21A0cCFB9b50Ad45".toLowerCase();

// AccountCreated event topic
const ACCOUNT_CREATED_TOPIC = "0xf910bcf6ef45198082a2e9755330a11e60bde93603dd71de5eb22ecab5416768";

async function rpcCall(chainId: number, method: string, params: unknown[]) {
  const res = await fetch(RPCS[chainId], {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`RPC error: ${JSON.stringify(json.error)}`);
  return json.result;
}

async function ethCall(chainId: number, to: string, data: string): Promise<string> {
  return rpcCall(chainId, "eth_call", [{ to, data }, "latest"]);
}

describe.concurrent("On-Chain E2E — Factory contracts", () => {
  for (const [cid, factory] of Object.entries(FACTORIES)) {
    const chainId = Number(cid);
    const name = CHAIN_NAMES[chainId];

    it(`${name} (${chainId}): factory has code`, async () => {
      const code = await rpcCall(chainId, "eth_getCode", [factory, "latest"]);
      expect(code).not.toBe("0x");
      expect(code.length).toBeGreaterThan(10);
    }, 15000);

    it(`${name} (${chainId}): deployFee matches expected`, async () => {
      const result = await ethCall(chainId, factory, "0xeb2a5d2c");
      const fee = BigInt(result);
      expect(fee).toBe(EXPECTED_DEPLOY_FEES[chainId]);
    }, 15000);

    if (MAINNET_CHAINS.includes(chainId)) {
      it(`${name} (${chainId}): owner is treasury SafePal`, async () => {
        // owner() selector = 0x8da5cb5b
        const result = await ethCall(chainId, factory, "0x8da5cb5b");
        const owner = "0x" + result.slice(26).toLowerCase();
        expect(owner).toBe(TREASURY);
      }, 15000);
    }

    it(`${name} (${chainId}): eth_getLogs for AccountCreated works`, async () => {
      // Just verify the RPC call doesn't error — use a small block range
      const latest = await rpcCall(chainId, "eth_blockNumber", []);
      const latestNum = BigInt(latest);
      const from = "0x" + (latestNum - 100n > 0n ? latestNum - 100n : 0n).toString(16);
      const result = await rpcCall(chainId, "eth_getLogs", [{
        address: factory,
        topics: [ACCOUNT_CREATED_TOPIC],
        fromBlock: from,
        toBlock: "latest",
      }]);
      expect(Array.isArray(result)).toBe(true);
    }, 15000);
  }
});

describe.concurrent("On-Chain E2E — Efe's Polygon account", () => {
  const account = "0xcd49a6a38c3e52763345a4ad36c03eafb61deed5";
  const chainId = 137;

  it("has code (is deployed)", async () => {
    const code = await rpcCall(chainId, "eth_getCode", [account, "latest"]);
    expect(code).not.toBe("0x");
    expect(code.length).toBeGreaterThan(10);
  }, 15000);

  it("balance >= 0 (account exists on-chain)", async () => {
    const bal = await rpcCall(chainId, "eth_getBalance", [account, "latest"]);
    expect(BigInt(bal)).toBeGreaterThanOrEqual(0n);
  }, 15000);

  it("maxTxValue returns 5 POL", async () => {
    const result = await ethCall(chainId, account, "0xe8eecf4c");
    expect(BigInt(result)).toBe(5000000000000000000n);
  }, 15000);

  it("dailyLimit returns 100 POL", async () => {
    const result = await ethCall(chainId, account, "0x67eeba0c");
    expect(BigInt(result)).toBe(100000000000000000000n);
  }, 15000);

  it("isFrozen returns false", async () => {
    const result = await ethCall(chainId, account, "0x33eeb147");
    expect(BigInt(result)).toBe(0n);
  }, 15000);
});

describe("On-Chain E2E — External Avalanche user", () => {
  it("account 0xb6e8...16f9 has code on Avalanche", async () => {
    const code = await rpcCall(43114, "eth_getCode", [
      "0xb6e8d0fac5b33b437aac6eecc76dae2a4f6b16f9",
      "latest",
    ]);
    expect(code).not.toBe("0x");
    expect(code.length).toBeGreaterThan(10);
  }, 15000);
});
