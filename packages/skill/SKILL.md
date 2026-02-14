---
name: sigil-wallet
description: Secure AI agent wallets via Sigil Protocol. Use when you need to deploy a smart wallet, send transactions through the Guardian, manage spending policies, create session keys, freeze/unfreeze accounts, manage recovery, or check wallet status. Covers all chains: Avalanche, Base, Arbitrum, 0G.
metadata: {"clawdbot":{"emoji":"🛡️"}}
---

# Sigil Protocol — Agent Wallet Skill

Secure smart wallets for AI agents on 4 EVM chains. 3-layer Guardian evaluates every transaction before co-signing.

**API Base:** `https://api.sigil.codes/v1`
**Dashboard:** `https://sigil.codes`
**Chains:** Avalanche (43114), Base (8453), Arbitrum (42161), 0G Mainnet (16661)

## Authentication

Two methods:

### API Key (simpler)
Owner generates a key at the dashboard's Agent Access page.

```bash
curl -X POST https://api.sigil.codes/v1/agent/auth/api-key \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "sgil_your_key_here"}'
# Returns: { "token": "eyJ..." }
```

### Delegation Signature (more secure)
Owner signs EIP-712 message delegating to the agent.

```bash
# Get signing info
GET /v1/agent/delegation-info

# Authenticate
POST /v1/agent/auth/delegation
{
  "ownerAddress": "0x...",
  "agentIdentifier": "my-agent",
  "signature": "0x...",
  "expiresAt": 1739404800,
  "nonce": "unique-string"
}
```

All requests: `Authorization: Bearer <token>` (4h TTL, re-auth with same credentials).

## First-Time Setup

### 1. Run the Setup Wizard
```
GET /v1/agent/setup/wizard
```
Returns guided questions, use-case profiles, and security tips. **Always ask the owner before deploying.**

### 2. Deploy via Dashboard
Direct the owner to `https://sigil.codes/onboarding` to:
1. Connect wallet + SIWE sign-in
2. Choose strategy template (Conservative/Moderate/Aggressive/DeFi Agent/NFT Agent)
3. Select chain
4. Generate agent key pair
5. Deploy smart account

### 3. Register (if deploying programmatically)
```bash
POST /v1/agent/wallets/register
{
  "address": "0xNewWallet",
  "chainId": 43114,
  "agentKey": "0xKey",
  "factoryTx": "0xHash"
}
```

## Daily Operations

### Check Status
```
GET /v1/agent/wallets/0xYourWallet
```
Returns: balance, policy, session keys, daily spend, guardian status, frozen state.

### Evaluate a Transaction
Every transaction goes through the Guardian's 3-layer pipeline:
1. **L1 Deterministic** — Policy limits, whitelist, velocity checks
2. **L2 Simulation** — Dry-run, check for reverts/unexpected state changes
3. **L3 LLM Risk** — AI scores the transaction (0-100, threshold 70)

```bash
POST /v1/evaluate
{
  "userOp": {
    "sender": "0xYourAccount",
    "nonce": "0x0",
    "callData": "0x...",
    "callGasLimit": "200000",
    "verificationGasLimit": "200000",
    "preVerificationGas": "50000",
    "maxFeePerGas": "25000000000",
    "maxPriorityFeePerGas": "1500000000",
    "signature": "0x"
  }
}
```

Verdicts: `APPROVE` (with guardian signature), `REJECT` (with `guidance` explaining why + how to fix), `ESCALATE` (needs owner).

### Policy Management
```bash
# Update limits
PUT /v1/agent/wallets/:addr/policy
{ "maxTxValue": "200000000000000000", "dailyLimit": "2000000000000000000" }

# Whitelist targets
POST /v1/agent/wallets/:addr/targets
{ "targets": ["0xContract"], "allowed": true }

# Whitelist functions
POST /v1/agent/wallets/:addr/functions
{ "selectors": ["0xa9059cbb"], "allowed": true }

# Token policies (cap approvals!)
POST /v1/agent/wallets/:addr/token-policies
{ "token": "0xUSDC", "maxApproval": "1000000000", "dailyTransferLimit": "5000000000" }
```

### Session Keys
Time-limited, scope-limited keys that auto-expire. Always prefer these over the full agent key.
```bash
POST /v1/agent/wallets/:addr/session-keys
{ "key": "0xEphemeralKey", "validForHours": 24, "spendLimit": "100000000000000000" }
```

### Emergency Controls
```bash
# Freeze everything
POST /v1/accounts/:addr/freeze
{ "reason": "Suspicious activity detected" }

# Unfreeze
POST /v1/accounts/:addr/unfreeze

# Rotate agent key
POST /v1/accounts/:addr/rotate-key
{ "newAgentKey": "0xNewKey" }

# Emergency withdraw (owner-only, direct contract call)
# Use the SigilAccount ABI: emergencyWithdraw(address to)
```

### Social Recovery
```bash
# Get recovery config
GET /v1/accounts/:addr/recovery

# Add guardian
POST /v1/accounts/:addr/recovery/guardians
{ "guardian": "0xTrustedAddress" }

# Set threshold (N-of-M)
PUT /v1/accounts/:addr/recovery/threshold
{ "threshold": 2 }
```

### Audit Log
```
GET /v1/audit?account=0xYourWallet&limit=50
```

## Contract Addresses

| Chain | Chain ID | Factory |
|-------|----------|---------|
| Avalanche C-Chain | 43114 | `0x2f4dd6db7affcf1f34c4d70998983528d834b8f6` |
| Base | 8453 | `0x45b20a5F37b9740401a29BD70D636a77B18a510D` |
| Arbitrum One | 42161 | `0x20f926bd5f416c875a7ec538f499d21d62850f35` |
| 0G Mainnet | 16661 | `0x20f926bd5f416c875a7ec538f499d21d62850f35` |
| Avalanche Fuji (testnet) | 43113 | `0x86E85dE25473b432dabf1B9E8e8CE5145059b85b` |

**Guardian:** `0xD06fBe90c06703C4b705571113740AfB104e3C67`
**EntryPoint (v0.7):** `0x0000000071727De22E5E9d8BAf0edAc6f37da032`

## MCP Server

For MCP-compatible agents, use the stdio-based MCP server:

```bash
npx sigil-mcp
```

Configure via environment:
```
SIGIL_API_URL=https://api.sigil.codes
SIGIL_API_KEY=sgil_your_key_here
SIGIL_ACCOUNT_ADDRESS=0xYourAccount
SIGIL_CHAIN_ID=43114
```

Tools: `get_account_info`, `evaluate_transaction`, `create_session_key`, `freeze_account`, `unfreeze_account`, `update_policy`, `get_transaction_history`, `rotate_agent_key`, `get_protection_status`

## Strategy Templates (Chain-Aware)

Templates adjust limits based on native token value:

| Template | AVAX limits | ETH limits | A0GI limits |
|----------|-------------|------------|-------------|
| **Conservative** | 0.1/0.5/0.05 | 0.0003/0.0015/0.00015 | 1/5/0.5 |
| **Moderate** | 0.5/2/0.2 | 0.0015/0.006/0.0006 | 5/20/2 |
| **Aggressive** | 2/10/1 | 0.006/0.03/0.003 | 20/100/10 |
| **DeFi Agent** | 0.3/5/0.1 | 0.0009/0.015/0.0003 | 3/50/1 |
| **NFT Agent** | 1/3/0.5 | 0.003/0.009/0.0015 | 10/30/5 |

*(maxTx / daily / guardianThreshold)*

## Best Practices

1. **Start conservative** — Low limits first, increase after pattern works
2. **Whitelist explicitly** — Use target and function whitelists
3. **Use session keys** — They auto-expire, safer than full agent key
4. **Cap token approvals** — `maxApproval` on token policies. Unlimited approvals = #1 DeFi attack vector
5. **When rejected, read `guidance`** — Guardian explains WHY and HOW to fix
6. **Check status before acting** — `GET /v1/agent/wallets/:addr`
7. **Monitor circuit breaker** — If tripped, all co-signing stops until owner resets

## Advanced

For detailed API reference, co-signing tiers, recovery system, and DeFi whitelist bundles, see [references/api-reference.md](references/api-reference.md).
