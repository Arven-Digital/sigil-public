# @sigil-protocol/eliza-plugin

Eliza AI framework plugin for [Sigil Protocol](https://sigil.codes) — secure AI agent wallets with 3-layer transaction validation.

## Installation

```bash
npm install @sigil-protocol/eliza-plugin @sigil-protocol/sdk
```

## Quick Start

```typescript
import { sigilPlugin } from '@sigil-protocol/eliza-plugin';

const plugin = sigilPlugin({
  apiUrl: 'https://api.sigil.codes',
  apiKey: 'sigil_sk_...',
  agentKey: '0xYOUR_AGENT_PRIVATE_KEY',
  accountAddress: '0xYOUR_ACCOUNT_ADDRESS',
  chainId: 1,
  // Optional
  maxRiskScore: 60,        // Auto-reject above this (0-100)
  rpcUrl: 'https://eth.llamarpc.com',  // For balance checks & nonce
  bundlerUrl: 'https://bundler.example.com',  // For UserOp submission
  verbose: false,
});

// Use with Eliza
const agent = new ElizaAgent({
  plugins: [plugin],
});
```

## Available Actions

### SIGIL_SEND
Send ETH through the Sigil-secured wallet.

```
User: "Send 0.5 ETH to 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28"
Agent: ✅ Transaction submitted! Amount: 0.5 ETH → 0x742d... Risk score: 25/100
```

### SIGIL_TRANSFER_TOKEN
Transfer ERC20 tokens.

```
User: "Send 100 USDC to 0x742d..."
```

Supports structured content: `{ tokenAddress, to, amount, decimals }`

### SIGIL_EVALUATE
Evaluate a transaction without executing — dry run through Guardian.

```
User: "Check if sending 1 ETH to 0x742d... is safe"
Agent: 📊 Verdict: ✅ APPROVED | Risk: 15/100 | Time: 42ms
```

### SIGIL_STATUS
Get wallet status, policy limits, and stats.

```
User: "What's my wallet status?"
Agent: 🛡️ Status: ACTIVE | Tier: standard | Daily: 5.0 ETH | 42 total tx
```

### SIGIL_BALANCE
Check ETH and token balances (requires `rpcUrl`).

```
User: "What's my balance?"
Agent: 💰 ETH: 2.500000 ETH
```

### SIGIL_HISTORY
View recent transaction history.

```
User: "Show my last 5 transactions"
```

### SIGIL_POLICY
View or update spending limits.

```
User: "Set daily limit to 10 ETH"
User: "Show me my policy limits"
```

### SIGIL_FREEZE
Emergency freeze — blocks all transactions.

```
User: "Freeze my wallet, it might be compromised"
```

### SIGIL_UNFREEZE
Reactivate a frozen wallet (owner only).

```
User: "Unfreeze my wallet"
```

### SIGIL_ROTATE_KEY
Rotate the agent signing key.

```
User: "Rotate my agent key"
```

## Evaluators

### SIGIL_TRANSACTION_INTENT
Automatically detects when messages contain transaction intent (keywords like "send", "transfer" + addresses or amounts). Sets `state.sigilTransactionIntent = true`.

## Providers

### SIGIL_WALLET
Injects wallet context into agent memory (30s cache):
```
[Sigil Wallet Context]
Address: 0x1234...
Status: ACTIVE
Policy: max_tx=1.0 ETH, daily=5.0 ETH, weekly=20.0 ETH
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiUrl` | string | required | Sigil API URL |
| `apiKey` | string | optional | API key for authentication |
| `agentKey` | string | optional | Agent private key for signing |
| `accountAddress` | string | required | Sigil account address |
| `chainId` | number | 1 | Chain ID for UserOp hashing |
| `maxRiskScore` | number | 60 | Auto-reject threshold (0-100) |
| `rpcUrl` | string | optional | RPC URL for on-chain queries |
| `bundlerUrl` | string | optional | ERC-4337 bundler endpoint |
| `entryPointAddress` | string | v0.7 default | EntryPoint contract address |
| `verbose` | boolean | false | Log evaluations to console |

## Error Handling

All actions return user-friendly error messages:

| Error | Message |
|-------|---------|
| Auth failure | 🔐 Authentication failed. Check API key. |
| Frozen account | 🧊 Account is frozen. Use SIGIL_UNFREEZE. |
| Timeout | ⏱️ Request timed out. |
| No RPC | ⚙️ RPC provider not configured. |
| Bad address | ❌ Invalid Ethereum address. |

## License

MIT
