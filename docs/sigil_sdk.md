# Sigil — SDK Documentation

> `@sigil-protocol/sdk` — TypeScript SDK for integrating Sigil-secured wallets into AI agents. Drop-in replacement for raw EOA wallet operations.

---

## Installation

```bash
npm install @sigil-protocol/sdk
# or
pnpm add @sigil-protocol/sdk
```

### Peer Dependencies

```bash
npm install ethers@^6.0.0 viem@^2.0.0
```

---

## Quick Start

```typescript
import { SigilSDK } from '@sigil-protocol/sdk';

// Initialize
const sigil = new SigilSDK({
  apiUrl: 'https://api.sigil.codes',         // Sigil API endpoint
  apiKey: 'sigil_sk_xxxxxxxxxxxx',        // SDK API key
  agentPrivateKey: process.env.AGENT_KEY, // Agent signing key
  accountAddress: '0x...',                // SigilAccount address
  chainId: 84532,                         // Base Sepolia
});

// Execute a transaction (evaluate + sign + submit)
const result = await sigil.execute({
  to: '0xUniswapRouter...',
  data: swapCalldata,
  value: parseEther('0.1'),
});

console.log(result.verdict);     // 'APPROVED'
console.log(result.txHash);      // '0x...'
console.log(result.riskScore);   // 12
```

---

## Configuration

```typescript
interface SigilConfig {
  // Required
  apiUrl: string;                 // Sigil API endpoint
  apiKey: string;                 // SDK API key (sigil_sk_...)
  agentPrivateKey: string;        // Agent private key (hex)
  accountAddress: string;         // Deployed SigilAccount address

  // Optional
  chainId?: number;               // Default: 84532 (Base Sepolia)
  bundlerUrl?: string;            // Custom ERC-4337 bundler URL
  entryPointAddress?: string;     // Custom EntryPoint address
  timeout?: number;               // API timeout in ms (default: 30000)
  retries?: number;               // Retry count for API calls (default: 3)
  onVerdictReceived?: (verdict: Verdict) => void;  // Callback
}
```

---

## Core API

### sigil.execute(txParams)

Build, evaluate, sign, and submit a transaction in one call.

```typescript
const result = await sigil.execute({
  to: '0x...',                    // Target contract address
  data: '0x...',                  // Encoded calldata
  value: parseEther('0.5'),       // ETH value (optional, default 0)
});

// Result
{
  verdict: 'APPROVED',            // 'APPROVED' | 'REJECTED'
  txHash: '0x...',                // On-chain tx hash (if approved)
  riskScore: 12,                  // 0-100
  guardianReason: 'Standard swap on verified DEX',
  layers: {
    layer1: { result: 'PASS', ... },
    layer2: { result: 'SAFE', ... },
    layer3: { result: 'APPROVE', score: 12, ... },
  },
  receipt: { ... },               // Ethers TransactionReceipt (if approved)
}
```

If the transaction is rejected, `execute()` throws a `TransactionRejectedError`:

```typescript
try {
  await sigil.execute(txParams);
} catch (error) {
  if (error instanceof TransactionRejectedError) {
    console.log(error.reason);      // 'Exceeds daily limit'
    console.log(error.riskScore);   // 87
    console.log(error.layer);       // 'layer1' — which layer rejected
  }
}
```

### sigil.evaluate(txParams)

Evaluate a transaction without submitting it. Useful for pre-checks.

```typescript
const evaluation = await sigil.evaluate({
  to: '0x...',
  data: '0x...',
  value: parseEther('0.5'),
});

if (evaluation.verdict === 'APPROVED') {
  // Safe to proceed
  const result = await sigil.submit(evaluation.signedUserOp);
}
```

### sigil.submit(signedUserOp)

Submit a pre-evaluated and signed UserOperation to the bundler.

```typescript
const result = await sigil.submit(evaluation.signedUserOp);
console.log(result.txHash);
```

### sigil.getPolicy()

Get current policy for the account.

```typescript
const policy = await sigil.getPolicy();

console.log(policy.maxTxValue);        // '1000000000000000000' (1 ETH)
console.log(policy.dailyLimit);        // '5000000000000000000' (5 ETH)
console.log(policy.allowedTargets);    // ['0x...', '0x...']
console.log(policy.allowedFunctions);  // ['0x38ed1739', ...]
```

### sigil.getBalance()

Get account ETH balance and token balances.

```typescript
const balance = await sigil.getBalance();
console.log(balance.eth);     // '1.5'
console.log(balance.tokens);  // [{ symbol: 'USDC', balance: '1000.00', ... }]
```

### sigil.getTransactions(options?)

Get transaction history.

```typescript
const txs = await sigil.getTransactions({
  limit: 50,
  status: 'approved',  // 'approved' | 'rejected' | 'all'
});
```

### sigil.getGuardianStatus()

Check guardian health.

```typescript
const status = await sigil.getGuardianStatus();
console.log(status.status);         // 'online' | 'degraded' | 'offline'
console.log(status.lastHeartbeat);  // '2026-02-09T14:30:00Z'
```

### sigil.getAccountInfo()

Get full account details.

```typescript
const info = await sigil.getAccountInfo();
console.log(info.address);
console.log(info.owner);
console.log(info.isFrozen);
console.log(info.isDegraded);
console.log(info.stats.totalTransactions);
console.log(info.stats.blockedTransactions);
```

---

## Helper Utilities

### Building Calldata

```typescript
import { SigilUtils } from '@sigil-protocol/sdk';

// Encode a function call
const calldata = SigilUtils.encodeFunctionCall({
  abi: UNISWAP_ABI,
  functionName: 'swapExactTokensForTokens',
  args: [amountIn, amountOutMin, path, recipient, deadline],
});

// Or use viem/ethers directly — SDK accepts raw calldata
```

### Deploying a New Account

```typescript
import { SigilFactory } from '@sigil-protocol/sdk';

const factory = new SigilFactory({
  apiUrl: 'https://api.sigil.codes',
  ownerPrivateKey: process.env.OWNER_KEY,  // Owner signs deployment
  chainId: 84532,
});

const account = await factory.deploy({
  agentKey: agentWallet.address,
  guardianKey: '0x...',  // From Guardian service
  policy: {
    maxTxValue: parseEther('1'),
    dailyLimit: parseEther('5'),
    weeklyLimit: parseEther('20'),
    guardianThreshold: parseEther('0.1'),
    ownerThreshold: parseEther('1'),
    timelockDuration: 600,  // 10 minutes
    allowedTargets: ['0xUniswap...'],
    allowedFunctions: ['0x38ed1739'],
  },
});

console.log(account.address);  // '0x...' — deterministic address
```

---

## Error Handling

```typescript
import {
  TransactionRejectedError,
  GuardianOfflineError,
  AccountFrozenError,
  PolicyViolationError,
  RateLimitError,
  SigilApiError,
} from '@sigil-protocol/sdk';

try {
  await sigil.execute(txParams);
} catch (error) {
  if (error instanceof TransactionRejectedError) {
    // Transaction failed evaluation
    console.log(error.reason);
    console.log(error.riskScore);
    console.log(error.layer);  // Which layer rejected
  }
  if (error instanceof GuardianOfflineError) {
    // Guardian unavailable — operating in degraded mode
    console.log(error.degradationMode);
  }
  if (error instanceof AccountFrozenError) {
    // Account is frozen by owner
  }
  if (error instanceof PolicyViolationError) {
    // Transaction violates policy (from on-chain revert)
    console.log(error.violatedRule);
  }
  if (error instanceof RateLimitError) {
    // Too many requests
    console.log(error.retryAfter);  // Seconds to wait
  }
}
```

---

## Eliza Plugin

### Installation

```bash
npm install @sigil-protocol/eliza-plugin
```

### Setup

```typescript
import { AgentRuntime } from '@ai16z/eliza';
import { sigilPlugin } from '@sigil-protocol/eliza-plugin';

const agent = new AgentRuntime({
  // ... other config
  plugins: [
    sigilPlugin({
      apiUrl: 'https://api.sigil.codes',
      apiKey: 'sigil_sk_xxxxxxxxxxxx',
      agentKey: process.env.AGENT_KEY,
      accountAddress: '0x...',
      chainId: 84532,
    }),
  ],
});
```

### Available Actions

| Action | Description | Example Trigger |
|--------|-------------|-----------------|
| `SEND_TOKEN` | Transfer ETH or tokens | "Send 0.1 ETH to 0x..." |
| `SWAP_TOKEN` | DEX swap with simulation | "Swap 100 USDC for ETH" |
| `CHECK_BALANCE` | Read account balance | "What's my balance?" |
| `VIEW_POLICY` | Show current policy | "What are my spending limits?" |

### Action Details

#### SEND_TOKEN

```typescript
// Triggered by: "Send 0.1 ETH to 0xRecipient"
// Plugin:
//   1. Parses amount + recipient from agent context
//   2. Calls sigil.execute({ to: recipient, value: amount })
//   3. Returns result to agent conversation

// Agent response (approved):
// "Sent 0.1 ETH to 0xRecipient. TX: 0x... Risk score: 8/100."

// Agent response (rejected):
// "Transaction blocked by guardian. Reason: recipient not whitelisted."
```

#### SWAP_TOKEN

```typescript
// Triggered by: "Swap 100 USDC for ETH on Uniswap"
// Plugin:
//   1. Builds Uniswap swap calldata
//   2. Calls sigil.execute(swapTx)
//   3. Includes simulation results in response

// Agent response:
// "Swapped 100 USDC for 0.041 ETH. Slippage: 0.3%. Risk score: 5/100."
```

### Custom Actions

Extend the plugin with custom actions:

```typescript
import { sigilPlugin, SigilAction } from '@sigil-protocol/eliza-plugin';

const customAction: SigilAction = {
  name: 'PROVIDE_LIQUIDITY',
  description: 'Add liquidity to a Uniswap pool',
  pattern: /add liquidity|provide liquidity/i,
  handler: async (sigil, params) => {
    // Custom logic using sigil SDK
    return await sigil.execute(liquidityTx);
  },
};

const agent = new AgentRuntime({
  plugins: [
    sigilPlugin({
      ...config,
      customActions: [customAction],
    }),
  ],
});
```

---

## Framework Integration Examples

### LangChain

```typescript
import { SigilSDK } from '@sigil-protocol/sdk';
import { Tool } from 'langchain/tools';

class SigilTransferTool extends Tool {
  name = 'sigil_transfer';
  description = 'Send ETH or tokens securely through Sigil';

  private sigil: SigilSDK;

  constructor(config: SigilConfig) {
    super();
    this.sigil = new SigilSDK(config);
  }

  async _call(input: string): Promise<string> {
    const { to, value } = JSON.parse(input);
    const result = await this.sigil.execute({ to, value: parseEther(value) });
    return JSON.stringify({
      txHash: result.txHash,
      verdict: result.verdict,
      riskScore: result.riskScore,
    });
  }
}
```

### CrewAI (Python — via REST API)

```python
import requests

class SigilTool:
    def __init__(self, api_url, api_key, account_address):
        self.api_url = api_url
        self.headers = {"X-API-Key": api_key}
        self.account = account_address

    def evaluate(self, to, value, data="0x"):
        response = requests.post(
            f"{self.api_url}/transactions/evaluate",
            headers=self.headers,
            json={"userOp": {"sender": self.account, "to": to, "value": value, "data": data}}
        )
        return response.json()
```

---

## TypeScript Types

```typescript
// Core types exported from @sigil-protocol/sdk

interface SigilConfig { ... }

interface TransactionParams {
  to: string;
  data?: string;
  value?: bigint;
}

interface ExecutionResult {
  verdict: 'APPROVED' | 'REJECTED';
  txHash?: string;
  riskScore: number;
  guardianReason?: string;
  layers: LayerResults;
  receipt?: TransactionReceipt;
}

interface EvaluationResult {
  verdict: 'APPROVED' | 'REJECTED';
  riskScore: number;
  guardianSignature?: string;
  signedUserOp?: UserOperation;
  layers: LayerResults;
}

interface Policy {
  maxTxValue: string;
  dailyLimit: string;
  weeklyLimit: string;
  guardianThreshold: string;
  ownerThreshold: string;
  timelockDuration: number;
  allowedTargets: string[];
  allowedFunctions: string[];
  blockedAddresses: string[];
}

interface GuardianStatus {
  status: 'online' | 'degraded' | 'offline';
  lastHeartbeat: string;
  uptime: number;
}

interface AccountInfo {
  address: string;
  owner: string;
  agentKey: string;
  guardianKey: string;
  isFrozen: boolean;
  isDegraded: boolean;
  balance: string;
  stats: {
    totalTransactions: number;
    blockedTransactions: number;
    dailySpent: string;
    weeklySpent: string;
  };
}
```
