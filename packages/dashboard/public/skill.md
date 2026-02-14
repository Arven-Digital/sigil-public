---
name: sigil-protocol
version: 1.0.0
description: AI Agent Wallet Security — Deploy and manage smart wallets with 3-tier co-signing, policy engine, and session keys.
homepage: https://sigil.codes
api_base: https://api.sigil.codes/v1
---

# Sigil Protocol — Agent Skill

Secure smart wallets for AI agents. You deploy a wallet for your owner, configure spending policies, and operate within safe limits — while the Guardian watches every transaction.

## Quick Links

| Resource | URL |
|----------|-----|
| **This file** | `https://sigil.codes/skill.md` |
| **API Base** | `https://api.sigil.codes/v1` |
| **Setup Wizard** | `https://api.sigil.codes/v1/agent/setup/wizard` |
| **Dashboard** | `https://app.sigil.codes` |
| **Agent Docs** | `https://sigil.codes/agent` |

---

## What is Sigil?

Sigil is an open security protocol for AI agent wallets. It wraps a standard ERC-4337 smart account with:

- **3-tier co-signing** — Low-value txs: agent alone. Medium: agent + Guardian. High: agent + Guardian + owner.
- **Policy engine** — Per-tx limits, daily limits, target whitelists, function whitelists, token allowance caps.
- **Session keys** — Time-limited, scope-limited keys that auto-expire. Perfect for agent tasks.
- **Guardian AI** — 3-layer evaluation pipeline (deterministic rules → simulation → LLM risk scoring) on every transaction.
- **Social recovery** — N-of-M guardian recovery if the owner loses access.
- **UUPS upgrades** — 24h timelock + guardian co-sign required.

**You (the agent) can:** Deploy wallets, configure policies, manage whitelists, create session keys, view status.
**You cannot:** Withdraw funds, freeze accounts, transfer ownership, upgrade contracts, modify recovery guardians.

---

## Step-by-Step Setup

### 1. Get Authorized

Your owner needs to give you access. Two options:

**Option A: API Key (simpler)**
Owner goes to `https://app.sigil.codes/dashboard/agent-access` → clicks "Generate API Key" → gives you the key.

**Option B: Delegation Signature (more secure)**
Owner signs an EIP-712 message in their wallet. You can show them what to sign by fetching:
```
GET https://api.sigil.codes/v1/agent/delegation-info
```

### 2. Authenticate

```bash
# With API key:
curl -X POST https://api.sigil.codes/v1/agent/auth/api-key \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "sgil_your_key_here"}'

# With delegation:
curl -X POST https://api.sigil.codes/v1/agent/auth/delegation \
  -H "Content-Type: application/json" \
  -d '{
    "ownerAddress": "0x...",
    "agentIdentifier": "your-agent-name",
    "signature": "0x...",
    "expiresAt": 1739404800,
    "nonce": "unique-random-string"
  }'
```

Both return: `{ "token": "eyJ..." }` — use this as `Authorization: Bearer <token>` for all subsequent requests.

### 3. Interview Your Owner

**Before deploying, ASK your owner these questions.** Don't assume — every wallet should be configured to match the owner's needs.

Fetch the full interactive wizard:
```
GET https://api.sigil.codes/v1/agent/setup/wizard
```

This returns:
- **7 questions** with plain-language explanations and sensible defaults
- **5 use-case profiles** (DeFi Trading, NFT Minting, Lending, Payments, General) with pre-configured recommendations
- **Security tips** to share with your owner
- **Example conversation** showing ideal agent-owner dialogue

**Questions to ask:**

1. **Which network?** — Avalanche Fuji (testnet, recommended) or 0G Testnet
2. **What's this wallet for?** — Use their answer to match a recommendation profile
3. **Risk tolerance?** — Conservative (0.05 ETH/tx), Moderate (0.1 ETH/tx), or Aggressive (0.5 ETH/tx)
4. **Which contracts to whitelist?** — Only whitelisted addresses can receive transactions
5. **Want a session key?** — Time-limited keys that auto-expire (recommended)
6. **Token-specific limits?** — Cap ERC-20 approvals and daily transfers
7. **Confirm and deploy?** — Summarize everything, get explicit "yes"

### 4. Deploy

After collecting all answers, call the guided setup:

```bash
curl -X POST https://api.sigil.codes/v1/agent/setup \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentKey": "0xYourAgentKeyAddress",
    "chainId": 43113,
    "maxTxValueEth": 0.1,
    "dailyLimitEth": 1.0,
    "guardianThresholdEth": 0.05,
    "allowedTargets": ["0xUniswapRouter"],
    "sessionKey": {
      "key": "0xEphemeralKey",
      "validForHours": 24,
      "spendLimitEth": 0.5
    }
  }'
```

This returns an **ordered list of contract calls**. Present them to your owner for signing in their wallet (MetaMask, etc.).

### 5. Register

After on-chain deployment:

```bash
curl -X POST https://api.sigil.codes/v1/agent/wallets/register \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0xNewWalletAddress",
    "chainId": 43113,
    "agentKey": "0xYourAgentKey",
    "factoryTx": "0xDeploymentTxHash"
  }'
```

### 6. Operate

Your wallet is now live and protected by the Guardian.

```bash
# Check wallet status
curl https://api.sigil.codes/v1/agent/wallets/0xYourWallet \
  -H "Authorization: Bearer YOUR_TOKEN"

# Update policy
curl -X PUT https://api.sigil.codes/v1/agent/wallets/0xYourWallet/policy \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"maxTxValue": "200000000000000000", "dailyLimit": "2000000000000000000"}'

# Add targets
curl -X POST https://api.sigil.codes/v1/agent/wallets/0xYourWallet/targets \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"targets": ["0xNewContract"], "allowed": true}'

# Create session key
curl -X POST https://api.sigil.codes/v1/agent/wallets/0xYourWallet/session-keys \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key": "0xEphemeralKey", "validForHours": 24, "spendLimit": "100000000000000000"}'
```

---

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/agent/delegation-info` | EIP-712 domain & types for delegation signing |
| `POST` | `/v1/agent/auth/api-key` | Authenticate with API key |
| `POST` | `/v1/agent/auth/delegation` | Authenticate with delegation signature |

### Setup
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/agent/setup/wizard` | Conversational setup guide with recommendations |
| `POST` | `/v1/agent/setup` | All-in-one guided setup (returns contract calls) |
| `POST` | `/v1/agent/wallets/deploy` | Get deployment config |
| `POST` | `/v1/agent/wallets/register` | Register deployed wallet |

### Management
| Method | Endpoint | Scope | Description |
|--------|----------|-------|-------------|
| `GET` | `/v1/agent/wallets/:address` | `wallet:read` | Full wallet status |
| `PUT` | `/v1/agent/wallets/:address/policy` | `policy:write` | Update policy |
| `POST` | `/v1/agent/wallets/:address/targets` | `targets:write` | Manage target whitelist |
| `POST` | `/v1/agent/wallets/:address/functions` | `targets:write` | Manage function whitelist |
| `POST` | `/v1/agent/wallets/:address/session-keys` | `session-keys:write` | Create session key |
| `POST` | `/v1/agent/wallets/:address/token-policies` | `policy:write` | Set token allowance policy |

### Key Management (requires owner SIWE auth)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/agent/keys` | Generate new agent API key |
| `GET` | `/v1/agent/keys` | List agent API keys |
| `DELETE` | `/v1/agent/keys/:id` | Revoke an agent API key |

---

## Supported Chains (Testnet)

| Chain | ID | Factory Address |
|-------|----|----------------|
| Avalanche Mainnet | `43114` | `0x7b7D00ED8Ac494c191DCaBD312d39563F0c76c3B` |
| Avalanche Fuji | `43113` | `0x65d47d9a49268E989B2D1a8697c2b60c1Ef83321` |

EntryPoint (v0.7): `0x0000000071727De22E5E9d8BAf0edAc6f37da032`

---

## Security Model

### What the Guardian evaluates (every transaction)
1. **Layer 1 — Deterministic rules:** Policy limits, target whitelist, function whitelist, token policies, daily velocity
2. **Layer 2 — Simulation:** Dry-run the transaction, check for reverts, unexpected state changes
3. **Layer 3 — LLM risk scoring:** AI analyzes the transaction in context of recent history, flags anomalies

### Co-signing tiers
- **LOW** (below guardian threshold): Agent signs alone
- **MEDIUM** (above guardian threshold): Agent + Guardian must co-sign
- **HIGH** (above owner threshold): Agent + Guardian + Owner must all co-sign

### Emergency
The owner can **freeze** the account instantly from the dashboard. Emergency withdrawals work even when frozen.

---

## Best Practices

1. **Start conservative** — Low limits first, increase after you see the pattern working.
2. **Whitelist explicitly** — Only add the specific contracts needed. Empty whitelist = agent can't send anything.
3. **Use session keys** — They auto-expire and have independent spend limits. Safer than using the full agent key.
4. **Cap token approvals** — Set `maxApproval` on token policies. Unlimited approvals are the #1 DeFi attack vector.
5. **Add cooldowns** — Session key cooldowns (60-300s) prevent rapid transaction spam.
6. **Check the audit log** — `GET /v1/audit?account=0x...` shows every evaluated transaction.
7. **When in doubt, freeze** — The owner can freeze instantly and figure it out later.

---

## Token Credentials

Your agent token:
- **Type:** JWT (Bearer token)
- **Lifetime:** Max 4 hours (auto-expires)
- **Audience:** `sigil-agent`
- **Scopes:** Defined at creation (default: all setup/management scopes)
- **Cannot:** Withdraw funds, freeze, transfer ownership, upgrade contracts

If your token expires, re-authenticate with the same API key or delegation.

---

*Sigil Protocol — Intent meets verdict.*
*https://sigil.codes*
