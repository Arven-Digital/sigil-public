---
name: Sigil Protocol
slug: sigil-security
description: Secure AI agent wallets via Sigil Protocol. Evaluate and submit ERC-4337 transactions through a 3-layer Guardian (rules, simulation, AI risk scoring) on 6 EVM chains. The agent signs UserOps locally — Sigil never sees private keys.
homepage: https://sigil.codes
source: https://github.com/Arven-Digital/sigil-public
metadata:
  openclaw:
    primaryEnv: SIGIL_API_KEY
    emoji: "🛡️"
    requires:
      env:
        - SIGIL_API_KEY
        - SIGIL_ACCOUNT_ADDRESS
        - SIGIL_AGENT_PRIVATE_KEY
---

# Sigil Protocol — Agent Wallet Skill

Secure ERC-4337 smart wallets for AI agents on 6 EVM chains. Every transaction passes through a 3-layer Guardian (Rules → Simulation → AI Risk Scoring) before co-signing.

**API:** `https://api.sigil.codes/v1`
**Dashboard:** `https://sigil.codes`
**Chains:** Ethereum (1), Polygon (137), Avalanche (43114), Base (8453), Arbitrum (42161), 0G (16661)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SIGIL_API_KEY` | ✅ | Agent API key (starts with `sgil_`). Generate at sigil.codes/dashboard/agent-access |
| `SIGIL_ACCOUNT_ADDRESS` | ✅ | Deployed Sigil smart account address |
| `SIGIL_AGENT_PRIVATE_KEY` | ✅ | Agent signing key (for UserOp signatures) |
| `SIGIL_CHAIN_ID` | No | Default chain (137=Polygon, 43114=Avalanche, etc.) |

## How It Works

```
Agent signs UserOp → POST /v1/execute → Guardian validates → co-signs → submitted on-chain
```

Three addresses — don't confuse them:
- **Owner wallet** — human's MetaMask, controls policy and settings
- **Sigil account** — on-chain smart wallet holding funds
- **Agent key** — a dedicated EOA for signing UserOps (NOT the owner key)

**Fund the Sigil account** with tokens you want to use. **Fund the agent key with minimal gas only** (small amount of POL/ETH/AVAX for submitting UserOps to the EntryPoint — never store significant value on the agent key).

## Security Model & Why SIGIL_AGENT_PRIVATE_KEY Is Required

**`SIGIL_AGENT_PRIVATE_KEY` is NOT an owner key or a wallet holding funds.** It is a dedicated signing key generated specifically for the agent during onboarding. Here's why it exists and why it's safe:

1. **ERC-4337 requires cryptographic signatures.** The agent must sign each UserOp locally before the Guardian will evaluate it. This is how Sigil verifies the transaction came from the authorized agent — not from a stolen API key.

2. **The agent key CANNOT act alone.** Every transaction requires BOTH the agent signature AND the Guardian's co-signature. Even if the agent key is compromised, the attacker still needs Guardian approval — which enforces whitelists, value limits, velocity checks, and AI risk scoring.

3. **The agent key CANNOT modify its own permissions.** Only the owner wallet (via SIWE) can change policy, freeze accounts, rotate keys, or whitelist targets. The agent key can only propose transactions for Guardian evaluation.

4. **`tx:submit` is safe because of Guardian enforcement.** The agent can submit transactions, but every single one passes through 3 layers of validation. Exceeding limits, calling unwhitelisted contracts, or triggering risk flags → automatic rejection. The Guardian is the enforcement boundary, not the API key scope.

5. **The key should be purpose-generated and rotatable.** Generate a fresh keypair during setup (Dashboard → Onboarding). The private key never leaves the agent's environment. Rotate via Dashboard → Emergency if compromised.

**Best practice:** Use a fresh keypair with no other purpose. Fund the agent EOA with minimal gas only. Set conservative policy limits on the Sigil dashboard. The Guardian enforces everything regardless of what the agent attempts.

## Installation (OpenClaw)

```json
{
  "name": "sigil-security",
  "env": {
    "SIGIL_API_KEY": "sgil_your_key_here",
    "SIGIL_ACCOUNT_ADDRESS": "0xYourSigilAccount",
    "SIGIL_AGENT_PRIVATE_KEY": "0xYourAgentPK"
  }
}
```

⚠️ `env` must be a flat key-value object, NOT an array.

## Complete Working Example (Copy-Paste Ready)

This is the full flow from auth to confirmed transaction. Uses ethers.js v6.

```javascript
const { ethers } = require('ethers');

// ─── Config (from your env vars) ───
const API_KEY = process.env.SIGIL_API_KEY;           // sgil_...
const ACCOUNT = process.env.SIGIL_ACCOUNT_ADDRESS;   // 0x...
const AGENT_PK = process.env.SIGIL_AGENT_PRIVATE_KEY; // 0x...
const CHAIN_ID = parseInt(process.env.SIGIL_CHAIN_ID || '137');
const API = 'https://api.sigil.codes/v1';
const ENTRYPOINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';

// ─── RPC URLs ───
const RPCS = {
  1: 'https://eth.drpc.org',
  137: 'https://polygon.drpc.org',
  43114: 'https://api.avax.network/ext/bc/C/rpc',
  8453: 'https://mainnet.base.org',
  42161: 'https://arb1.arbitrum.io/rpc',
  16661: 'https://0g.drpc.org',
};

const provider = new ethers.JsonRpcProvider(RPCS[CHAIN_ID]);
const agentWallet = new ethers.Wallet(AGENT_PK, provider);

// ─── Step 1: Authenticate ───
async function auth() {
  const res = await fetch(`${API}/agent/auth/api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: API_KEY }),
  });
  const { token, error } = await res.json();
  if (error) throw new Error(`Auth failed: ${error}`);
  return token; // Use as: Authorization: Bearer <token>
}

// ─── Step 2: Build, sign, and submit a transaction ───
async function sendTransaction(token, target, value, innerData, description) {
  // 2a. Encode execute(target, value, innerData)
  const executeIface = new ethers.Interface([
    'function execute(address target, uint256 value, bytes data)',
  ]);
  const callData = executeIface.encodeFunctionData('execute', [target, value, innerData]);

  // 2b. Get nonce from the Sigil account
  const account = new ethers.Contract(ACCOUNT, [
    'function getNonce() view returns (uint256)',
  ], provider);
  const nonce = await account.getNonce();

  // 2c. Pack gas fields (v0.7 format)
  // Safe defaults: 300k verification, 500k call gas, 50gwei fees
  const vgl = 300000n, cgl = 500000n, preVerGas = 60000n;
  const feeData = await provider.getFeeData();
  const maxPriority = feeData.maxPriorityFeePerGas ?? 30000000000n;
  const maxFee = feeData.maxFeePerGas ?? 50000000000n;

  const accountGasLimits = '0x' +
    vgl.toString(16).padStart(32, '0') +
    cgl.toString(16).padStart(32, '0');
  const gasFees = '0x' +
    maxPriority.toString(16).padStart(32, '0') +
    maxFee.toString(16).padStart(32, '0');

  // 2d. Get UserOp hash from EntryPoint and sign it
  const ep = new ethers.Contract(ENTRYPOINT, [
    'function getUserOpHash((address,uint256,bytes,bytes,bytes32,uint256,bytes32,bytes,bytes)) view returns (bytes32)',
  ], provider);
  const userOpHash = await ep.getUserOpHash([
    ACCOUNT, ethers.toBeHex(nonce), '0x', callData,
    accountGasLimits, ethers.toBeHex(preVerGas), gasFees, '0x', '0x',
  ]);
  const signature = await agentWallet.signMessage(ethers.getBytes(userOpHash));

  // 2e. Submit to Sigil — Guardian evaluates and co-signs
  const res = await fetch(`${API}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      userOp: {
        sender: ACCOUNT,
        nonce: ethers.toBeHex(nonce),
        callData,
        accountGasLimits,
        preVerificationGas: preVerGas.toString(),
        gasFees,
        signature,
      },
      chainId: CHAIN_ID,
    }),
  });
  const result = await res.json();

  if (result.verdict === 'APPROVED') {
    console.log(`✅ ${description}: ${result.txHash}`);
  } else {
    console.log(`❌ ${description}: ${result.rejectionReason}`);
    console.log('   Guidance:', result.guidance?.message);
  }
  return result;
}

// ─── Example: Approve 100 USDC to a DEX on Polygon ───
async function main() {
  const token = await auth();

  const usdc = new ethers.Interface(['function approve(address,uint256)']);
  const innerData = usdc.encodeFunctionData('approve', [
    '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', // Uniswap SwapRouter02
    ethers.parseUnits('100', 6), // 100 USDC
  ]);

  await sendTransaction(
    token,
    '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // USDC on Polygon
    0n,
    innerData,
    'Approve 100 USDC to SwapRouter02',
  );
}

main().catch(console.error);
```

The `sendTransaction()` function above handles the complete flow. Reuse it for any operation by changing `target`, `value`, and `innerData`.

## Quick Recipes

### Transfer tokens
```javascript
const inner = erc20.encodeFunctionData('transfer', [recipient, amount]);
await sendTransaction(token, tokenAddress, 0n, inner, 'Transfer');
```

### Send native token (POL/ETH/AVAX)
```javascript
await sendTransaction(token, recipient, ethers.parseEther('1'), '0x', 'Send 1 POL');
```

### Wrap native → WMATIC/WETH/WAVAX
```javascript
await sendTransaction(token, WMATIC, ethers.parseEther('1'), '0xd0e30db0', 'Wrap 1 POL');
```

### Uniswap V3 swap
```javascript
const router = new ethers.Interface([
  'function exactInputSingle(tuple(address,address,uint24,address,uint256,uint256,uint160))',
]);
const inner = router.encodeFunctionData('exactInputSingle', [
  [tokenIn, tokenOut, 3000, ACCOUNT, amountIn, 0, 0],
]);
await sendTransaction(token, ROUTER_ADDRESS, 0n, inner, 'Swap');
```

## Evaluate Without Executing (Dry Run)

Same as above but POST to `/v1/evaluate` instead of `/v1/execute`. Signature can be `"0x"` for dry runs. Returns verdict + risk score + layer breakdown without submitting or spending gas.

## Handling Rejections

When a transaction is rejected, the response includes `guidance` with a message and suggested action:

```json
{
  "verdict": "REJECTED",
  "rejectionReason": "TARGET_NOT_WHITELISTED",
  "guidance": {
    "message": "Contract 0xABC... is not in your whitelist. Add it in Dashboard → Policies.",
    "action": "add_target"
  }
}
```

**Decision tree:**
1. `TARGET_NOT_WHITELISTED` or `FUNCTION_NOT_ALLOWED` → Tell the user/owner to whitelist via dashboard. You cannot fix this yourself.
2. `EXCEEDS_TX_LIMIT` or `EXCEEDS_DAILY_LIMIT` → Reduce the amount, or ask owner to increase limits.
3. `SIMULATION_FAILED` → Your calldata is wrong. Check: correct target? correct ABI encoding? sufficient token balance? approval in place?
4. `HIGH_RISK_SCORE` → Guardian AI flagged the tx. Review what you're doing — unusual patterns get flagged.
5. `ACCOUNT_FROZEN` or `CIRCUIT_BREAKER` → Stop. Owner must intervene via dashboard.

## RPC URLs

| Chain | ID | RPC | Native Token |
|-------|-----|-----|-------------|
| Ethereum | 1 | `https://eth.drpc.org` | ETH |
| Polygon | 137 | `https://polygon.drpc.org` | POL |
| Avalanche | 43114 | `https://api.avax.network/ext/bc/C/rpc` | AVAX |
| Base | 8453 | `https://mainnet.base.org` | ETH |
| Arbitrum | 42161 | `https://arb1.arbitrum.io/rpc` | ETH |
| 0G | 16661 | `https://0g.drpc.org` | A0GI |

## Key Token Addresses

### Polygon (137)
| Token | Address | Decimals |
|-------|---------|----------|
| USDC | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` | 6 |
| USDC.e | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` | 6 |
| WMATIC | `0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270` | 18 |
| WETH | `0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619` | 18 |

### Avalanche (43114)
| Token | Address | Decimals |
|-------|---------|----------|
| USDC | `0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E` | 6 |
| WAVAX | `0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7` | 18 |

### Base (8453)
| Token | Address | Decimals |
|-------|---------|----------|
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | 6 |
| WETH | `0x4200000000000000000000000000000000000006` | 18 |

### Arbitrum (42161)
| Token | Address | Decimals |
|-------|---------|----------|
| USDC | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | 6 |
| WETH | `0x82aF49447D8a07e3bd95BD0d56f35241523fBab1` | 18 |

## Key API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/agent/auth/api-key` | Auth → JWT |
| POST | `/v1/evaluate` | Dry-run evaluation |
| POST | `/v1/execute` | Evaluate + co-sign + submit |
| GET | `/v1/accounts/:addr` | Account info + policy |
| GET | `/v1/accounts/discover?owner=0x...&chainId=N` | Find wallets |
| GET | `/v1/transactions?account=0x...` | Transaction history |

## Guardian Rejections & Fixes

| Reason | Fix |
|--------|-----|
| `TARGET_NOT_WHITELISTED` | Owner whitelists target: Dashboard → Policies → Bundles |
| `FUNCTION_NOT_ALLOWED` | Owner whitelists selector: Dashboard → Policies |
| `EXCEEDS_TX_LIMIT` | Reduce value or owner increases maxTxValue |
| `EXCEEDS_DAILY_LIMIT` | Wait for reset or owner increases daily limit |
| `SIMULATION_FAILED` | Fix calldata encoding, check balance/approvals |
| `HIGH_RISK_SCORE` | Review tx — AI flagged as suspicious (score >70) |
| `ACCOUNT_FROZEN` | Owner unfreezes via dashboard |
| `CIRCUIT_BREAKER` | Too many rejections — owner resets |

## Agent Scopes

| Scope | Default | Description |
|-------|---------|-------------|
| `wallet:read` | ✅ | Read account info |
| `policy:read` | ✅ | Read policy settings |
| `audit:read` | ✅ | Read audit logs |
| `tx:read` | ✅ | Read transaction history |
| `tx:submit` | ✅ | Submit transactions |
| `policy:write` | ❌ | Modify policy (owner only) |
| `wallet:deploy` | ❌ | Deploy wallets (dangerous) |
| `wallet:freeze` | ❌ | Freeze/unfreeze |
| `session-keys:write` | ❌ | Create session keys |

## V12 Factory Addresses

| Chain | Factory |
|-------|---------|
| Ethereum (1) | `0x20f926bd5f416c875a7ec538f499d21d62850f35` |
| Polygon (137) | `0x483D6e4e203771485aC75f183b56D5F5cDcbe679` |
| Avalanche (43114) | `0x86e85de25473b432dabf1b9e8e8ce5145059b85b` |
| Base (8453) | `0x5729291ed4c69936f5b5ace04dee454c6838fd50` |
| Arbitrum (42161) | `0x2f4dd6db7affcf1f34c4d70998983528d834b8f6` |
| 0G (16661) | `0x8bAD12A489338B533BCA3B19138Cd61caA17405F` |

**EntryPoint v0.7:** `0x0000000071727De22E5E9d8BAf0edAc6f37da032` (all chains)

## Common Selectors

| Function | Selector |
|----------|----------|
| `approve(address,uint256)` | `0x095ea7b3` |
| `transfer(address,uint256)` | `0xa9059cbb` |
| `deposit()` (wrap native) | `0xd0e30db0` |
| `exactInputSingle(...)` | `0x414bf389` |
| `multicall(uint256,bytes[])` | `0x5ae401dc` |
| `multicall(bytes[])` | `0xac9650d8` |

## Best Practices

1. **Start conservative** — low limits, increase after pattern works
2. **Whitelist explicitly** — use target + function whitelists, not open policies
3. **Cap approvals** — never approve unlimited (`type(uint256).max`) unless necessary
4. **Read `guidance` on rejection** — Guardian explains why and how to fix
5. **Check status first** — `GET /v1/accounts/:addr` before transacting
6. **Use session keys** for routine operations — they auto-expire

## Links

- Dashboard: https://sigil.codes
- Full LLM docs: https://sigil.codes/llms-full.txt
- GitHub: https://github.com/Arven-Digital/sigil-public
- ClawdHub: `clawdhub install sigil-security`
- X: https://x.com/sigilcodes
