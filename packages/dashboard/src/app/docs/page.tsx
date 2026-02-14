"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";

const NEON = "#00FF88";

const SECTIONS = [
  {
    id: "getting-started",
    title: "Getting Started",
    content: `
## Quick Start

### 1. Deploy a Sigil Account

Visit [sigil.codes/onboarding](/onboarding) to deploy your smart account:

1. **Connect Wallet** — MetaMask, WalletConnect, or any EVM wallet
2. **Sign In with Ethereum** — Proves wallet ownership
3. **Choose Strategy** — Conservative, Moderate, Aggressive, DeFi Agent, or NFT Agent
4. **Select Chain** — Avalanche, Base, Arbitrum, or 0G Mainnet
5. **Generate Agent Key** — Save the private key securely
6. **Deploy** — One-time fee, no subscriptions

### 2. Fund Your Account

Send native tokens (AVAX, ETH, or A0GI) to your deployed Sigil account address.

### 3. Integrate Your Agent

\`\`\`typescript
import { SigilSDK } from '@sigil-protocol/sdk';

const sigil = new SigilSDK({
  apiUrl: 'https://api.sigil.codes',
  accountAddress: '0xYourSigilAccount',
  agentKey: '0xYourAgentPrivateKey',
  chainId: 43114,
});

// Check account status
const account = await sigil.getAccount();

// Evaluate a transaction before sending
const result = await sigil.evaluateTransaction({
  to: '0xTarget',
  value: '100000000000000000', // 0.1 AVAX
  data: '0x',
});

if (result.verdict === 'APPROVED') {
  // Transaction is safe — submit it
  console.log('Guardian approved, signature:', result.guardianSignature);
}
\`\`\`

### 4. Or Use the Eliza Plugin

\`\`\`typescript
import { sigilPlugin } from '@sigil-protocol/eliza';

const plugin = sigilPlugin({
  apiUrl: 'https://api.sigil.codes',
  accountAddress: '0xYourSigilAccount',
  rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
});

// Plugin provides 13 actions:
// send, evaluate, freeze, unfreeze, rotateKey,
// createSessionKey, updatePolicy, addTarget,
// removeTarget, getStatus, getHistory, and more
\`\`\`
`,
  },
  {
    id: "sdk",
    title: "TypeScript SDK",
    content: `
## @sigil-protocol/sdk

Full TypeScript SDK for interacting with Sigil Protocol.

### Installation

\`\`\`bash
npm install @sigil-protocol/sdk
\`\`\`

### Configuration

\`\`\`typescript
import { SigilSDK } from '@sigil-protocol/sdk';

const sigil = new SigilSDK({
  apiUrl: 'https://api.sigil.codes',
  accountAddress: '0xYourSigilAccount',
  agentKey: '0xAgentPrivateKey',     // For agent operations
  ownerKey: '0xOwnerPrivateKey',     // For owner operations (optional)
  chainId: 43114,                     // Avalanche
  maxRetries: 3,                      // Auto-retry on network errors
});
\`\`\`

### Account Management

\`\`\`typescript
// Get account info (balance, policy, stats)
const account = await sigil.getAccount();

// Register a new account after deployment
await sigil.registerAccount({
  owner: '0xOwnerAddress',
  agentKey: '0xAgentAddress',
  chainId: 43114,
});
\`\`\`

### Transaction Evaluation

\`\`\`typescript
const result = await sigil.evaluateTransaction({
  to: '0xTargetContract',
  value: '0',
  data: '0xa9059cbb...', // ERC20 transfer calldata
});

// Result contains:
// - verdict: 'APPROVED' | 'REJECTED' | 'ESCALATE'
// - riskScore: 0-100
// - layers: { layer1, layer2, layer3 } details
// - guardianSignature: string (if approved)
// - guidance: { reason, suggestion } (if rejected)
\`\`\`

### Policy Management

\`\`\`typescript
// Update spending limits
await sigil.updatePolicy({
  maxTxValue: '500000000000000000',   // 0.5 AVAX
  dailyLimit: '2000000000000000000',  // 2 AVAX
});

// Manage target whitelist
await sigil.addTargets(['0xUniswapRouter', '0xAavePool']);
await sigil.removeTargets(['0xSuspiciousContract']);

// Set token-specific policies
await sigil.setTokenPolicy('0xUSDC', {
  maxApproval: '1000000000',        // 1000 USDC
  dailyTransferLimit: '5000000000', // 5000 USDC
});
\`\`\`

### Session Keys

\`\`\`typescript
// Create a time-limited session key
await sigil.createSessionKey({
  key: '0xEphemeralKeyAddress',
  validForHours: 24,
  spendLimit: '100000000000000000', // 0.1 AVAX
});
\`\`\`

### Emergency Controls

\`\`\`typescript
// Freeze the account — blocks all transactions
await sigil.freeze('Suspicious activity detected');

// Unfreeze
await sigil.unfreeze();

// Rotate agent key
await sigil.rotateAgentKey('0xNewAgentKeyAddress');
\`\`\`

### Error Handling

\`\`\`typescript
import { SigilRejectionError, FrozenAccountError } from '@sigil-protocol/sdk';

try {
  await sigil.evaluateTransaction(tx);
} catch (error) {
  if (error instanceof SigilRejectionError) {
    console.log('Rejected:', error.reason);
    console.log('Suggestion:', error.suggestion);
    console.log('Failed layer:', error.layer);
  }
  if (error instanceof FrozenAccountError) {
    console.log('Account is frozen — contact owner');
  }
}
\`\`\`
`,
  },
  {
    id: "eliza-plugin",
    title: "Eliza Plugin",
    content: `
## @sigil-protocol/eliza

Drop-in Eliza plugin that gives your AI agent secure wallet capabilities.

### Installation

\`\`\`bash
npm install @sigil-protocol/eliza
\`\`\`

### Setup

\`\`\`typescript
import { sigilPlugin } from '@sigil-protocol/eliza';

const plugin = sigilPlugin({
  apiUrl: 'https://api.sigil.codes',
  accountAddress: '0xYourSigilAccount',
  rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
});

// Register with your Eliza agent
agent.registerPlugin(plugin);
\`\`\`

### Available Actions (13)

| Action | Description |
|--------|-------------|
| \`SIGIL_SEND\` | Send native tokens through Guardian validation |
| \`SIGIL_EVALUATE\` | Evaluate a transaction without sending |
| \`SIGIL_FREEZE\` | Emergency freeze the account |
| \`SIGIL_UNFREEZE\` | Unfreeze the account |
| \`SIGIL_STATUS\` | Get account status and balance |
| \`SIGIL_HISTORY\` | Get transaction history |
| \`SIGIL_ROTATE_KEY\` | Rotate the agent key |
| \`SIGIL_CREATE_SESSION_KEY\` | Create a time-limited session key |
| \`SIGIL_UPDATE_POLICY\` | Update spending policies |
| \`SIGIL_ADD_TARGET\` | Add to target whitelist |
| \`SIGIL_REMOVE_TARGET\` | Remove from target whitelist |
| \`SIGIL_RECOVERY\` | Manage social recovery |
| \`SIGIL_UPGRADE\` | Check/manage account upgrades |

### Evaluator

The plugin includes a transaction evaluator that automatically validates outgoing transactions:

\`\`\`typescript
// The evaluator intercepts all wallet transactions
// and runs them through Sigil's 3-layer pipeline
// before allowing execution.
\`\`\`

### Wallet Provider

\`\`\`typescript
// The plugin provides a wallet context to your agent:
// - Current balance
// - Active policy limits
// - Session key status
// - Recent transaction history
\`\`\`
`,
  },
  {
    id: "api",
    title: "REST API",
    content: `
## REST API Reference

Base URL: \`https://api.sigil.codes/v1\`

### Authentication

#### SIWE (Sign-In with Ethereum)

\`\`\`bash
# 1. Get nonce
GET /v1/auth/nonce
# Returns: { nonce, sessionId }

# 2. Sign SIWE message and verify
POST /v1/auth/siwe
{
  "message": "<SIWE message with nonce>",
  "signature": "0x...",
  "sessionId": "..."
}
# Returns: { accessToken, refreshToken, address, expiresIn }

# 3. Use token
Authorization: Bearer <accessToken>
\`\`\`

#### Agent API Key

\`\`\`bash
# Authenticate with agent API key
POST /v1/agent/auth/api-key
{ "apiKey": "sgil_..." }
# Returns: { token: "eyJ..." }
\`\`\`

### Endpoints

#### Accounts

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | \`/v1/accounts\` | SIWE | Register a deployed account |
| GET | \`/v1/accounts/:address\` | Optional | Get account info (public: minimal, owner: full) |
| PUT | \`/v1/accounts/:address/policy\` | SIWE | Update spending policy |
| POST | \`/v1/accounts/:address/freeze\` | SIWE | Freeze account |
| POST | \`/v1/accounts/:address/unfreeze\` | SIWE | Unfreeze account |
| POST | \`/v1/accounts/:address/rotate-key\` | SIWE | Rotate agent key |

#### Transaction Evaluation

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | \`/v1/evaluate\` | SIWE/Agent | Submit UserOp for 3-layer evaluation |
| GET | \`/v1/transactions\` | SIWE | List evaluated transactions |

#### Agent Setup

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | \`/v1/agent/setup/wizard\` | Agent | Get setup wizard questions |
| POST | \`/v1/agent/setup\` | Agent | Run guided setup |
| POST | \`/v1/agent/wallets/register\` | Agent | Register deployed wallet |

#### Agent Key Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | \`/v1/agent/keys\` | SIWE | Generate agent API key |
| GET | \`/v1/agent/keys\` | SIWE | List agent API keys |
| DELETE | \`/v1/agent/keys/:id\` | SIWE | Revoke an API key |

#### Audit

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | \`/v1/audit\` | SIWE | Get audit log (query: account, limit, since) |

#### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | \`/v1/health\` | None | API health check |
| GET | \`/v1/bundles\` | None | List DeFi whitelist bundles |

### Rate Limits

| Endpoint | Limit |
|----------|-------|
| \`/v1/evaluate\` | 60 req/min per account |
| \`/v1/accounts\` (POST) | 10 req/min per IP |
| \`/v1/auth/*\` | 20 req/min per IP |
| Default | 120 req/min per IP |

### Response Format

All successful responses return JSON. Errors return:

\`\`\`json
{
  "error": "Human-readable error message",
  "details": ["Optional array of validation details"]
}
\`\`\`

### Guardian Verdicts

The \`/v1/evaluate\` endpoint returns:

\`\`\`json
{
  "verdict": "APPROVED",
  "riskScore": 15,
  "evaluationMs": 687,
  "guardianSignature": "0x...",
  "layers": {
    "layer1": { "result": "PASS", "checks": [...] },
    "layer2": { "result": "SAFE", "simulation": {...} },
    "layer3": { "result": "LOW_RISK", "score": 15, "reasoning": "..." }
  }
}
\`\`\`
`,
  },
  {
    id: "contracts",
    title: "Contract Architecture",
    content: `
## Smart Contract Architecture

Sigil Protocol uses an ERC-4337 compatible smart account with a factory deployment pattern.

### Contract Addresses

#### Mainnet Deployments (V10)

| Chain | Factory | Chain ID |
|-------|---------|----------|
| **Avalanche C-Chain** | \`0x2f4dd6db7affcf1f34c4d70998983528d834b8f6\` | 43114 |
| **Base** | \`0x45b20a5F37b9740401a29BD70D636a77B18a510D\` | 8453 |
| **Arbitrum One** | \`0x20f926bd5f416c875a7ec538f499d21d62850f35\` | 42161 |
| **0G Mainnet** | \`0x20f926bd5f416c875a7ec538f499d21d62850f35\` | 16661 |

#### Testnet

| Chain | Factory | Chain ID |
|-------|---------|----------|
| **Avalanche Fuji** | \`0x86E85dE25473b432dabf1B9E8e8CE5145059b85b\` | 43113 |

#### Shared

| Contract | Address |
|----------|---------|
| **Guardian Co-Signer** | \`0xD06fBe90c06703C4b705571113740AfB104e3C67\` |
| **EntryPoint (v0.7)** | \`0x0000000071727De22E5E9d8BAf0edAc6f37da032\` |

### Architecture

\`\`\`
┌─────────────────────────────────────────────┐
│           SigilAccountFactory               │
│  ├── createAccount() → CREATE2 deployment   │
│  ├── deployFee → one-time protocol fee      │
│  └── getAddress() → deterministic address   │
└─────────────┬───────────────────────────────┘
              │ deploys
              ▼
┌─────────────────────────────────────────────┐
│           SigilAccount (ERC-4337)           │
│  ├── owner (human wallet, full control)     │
│  ├── agentKey (AI agent, limited)           │
│  ├── guardianKey (co-signer, validate-only) │
│  ├── Policy Engine                          │
│  │   ├── maxTxValue                         │
│  │   ├── dailyLimit / dailySpent            │
│  │   └── guardianThreshold                  │
│  ├── Session Keys (time + spend limited)    │
│  ├── Social Recovery (N-of-M guardians)     │
│  ├── Emergency Controls                     │
│  │   ├── freeze() / unfreeze()              │
│  │   └── emergencyWithdraw()                │
│  └── UUPS Upgradeable (24h timelock)        │
└─────────────────────────────────────────────┘
\`\`\`

### Key Roles

| Role | Can Do | Cannot Do |
|------|--------|-----------|
| **Owner** | Everything — freeze, unfreeze, withdraw, rotate keys, upgrade, set policy | N/A |
| **Agent Key** | Submit transactions for evaluation | Freeze, withdraw, rotate keys, upgrade |
| **Guardian** | Co-sign approved transactions | Initiate tx, move funds, change policy |
| **Session Key** | Submit transactions within scope | Anything beyond scope/time/spend limits |

### Co-Signing Tiers

| Tier | Condition | Required Signatures |
|------|-----------|-------------------|
| **LOW** | Below \`guardianThreshold\` | Agent only |
| **MEDIUM** | Above \`guardianThreshold\` | Agent + Guardian |
| **HIGH** | Above \`ownerThreshold\` | Agent + Guardian + Owner |
`,
  },
  {
    id: "security",
    title: "Security Model",
    content: `
## Security Model

### Non-Custodial Design

Sigil Protocol is fundamentally non-custodial:

- **Your keys stay with you** — Owner key, agent key, session keys, and recovery guardians are generated and stored entirely on your side
- **Guardian validates, never initiates** — The only key we operate is the Guardian co-signer, which can only approve transactions after they pass all 3 security layers
- **Owner always has override** — Emergency freeze, withdrawal, and key rotation are owner-only on-chain functions that work even if Sigil servers are offline

### 3-Layer Validation Pipeline

Every transaction submitted through the Guardian API passes through:

1. **Layer 1: Deterministic Rules** — Per-tx value limits, daily velocity caps, target whitelist, function selector whitelist, token approval policies. Instant, on-chain enforceable.

2. **Layer 2: Transaction Simulation** — Full dry-run of the transaction. Detects reverts, unexpected balance changes, sandwich attack patterns, unlimited approvals.

3. **Layer 3: AI Risk Scoring** — LLM analyzes the transaction in context of recent history, target reputation, and known attack vectors. Scores 0-100 (threshold: 70).

### Security Features

- **Circuit Breaker** — Auto-trips after repeated suspicious rejections. Blocks all co-signing until owner reset.
- **Velocity Limits** — Hourly and daily spend caps enforced at the Guardian level.
- **Session Key Scoping** — Time-limited, spend-limited ephemeral keys that auto-expire.
- **Social Recovery** — N-of-M guardian recovery with configurable safety delay.
- **Upgrade Timelock** — 24-hour delay on implementation upgrades with guardian co-sign requirement.

### Security Practices

- Multiple rounds of internal security audits across contracts, API, and infrastructure
- Smart contract test suite with 558 tests across 32 suites
- Formal verification with Halmos (Z3 SMT solver)
- Rate limiting and DDoS protection
- httpOnly cookies for session management
- HSTS, CSP, and X-Frame-Options security headers
`,
  },
  {
    id: "mcp",
    title: "MCP Server",
    content: `
## MCP Server

Sigil Protocol provides a Model Context Protocol (MCP) server for integration with any AI agent framework that supports MCP.

### Setup

\`\`\`bash
# Install
npm install @sigil-protocol/mcp

# Run as stdio server
npx sigil-mcp
\`\`\`

### Configuration

Set environment variables:

\`\`\`bash
SIGIL_API_URL=https://api.sigil.codes
SIGIL_API_KEY=sgil_your_key_here
SIGIL_ACCOUNT_ADDRESS=0xYourSigilAccount
SIGIL_CHAIN_ID=43114
\`\`\`

### Available Tools

| Tool | Description |
|------|-------------|
| \`deploy_wallet\` | Deploy a new Sigil smart account |
| \`get_account_info\` | Get account status, balance, and policy |
| \`evaluate_transaction\` | Submit a transaction for 3-layer evaluation |
| \`create_session_key\` | Create a time-limited session key |
| \`freeze_account\` | Emergency freeze the account |
| \`unfreeze_account\` | Unfreeze the account |
| \`update_policy\` | Update spending limits and whitelists |
| \`get_transaction_history\` | List recent evaluated transactions |
| \`rotate_agent_key\` | Rotate the agent's signing key |

### MCP Client Configuration

\`\`\`json
{
  "mcpServers": {
    "sigil": {
      "command": "npx",
      "args": ["sigil-mcp"],
      "env": {
        "SIGIL_API_URL": "https://api.sigil.codes",
        "SIGIL_API_KEY": "sgil_...",
        "SIGIL_ACCOUNT_ADDRESS": "0x...",
        "SIGIL_CHAIN_ID": "43114"
      }
    }
  }
}
\`\`\`
`,
  },
];

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("getting-started");
  const section = SECTIONS.find(s => s.id === activeSection)!;

  return (
    <div className="min-h-screen bg-[#050505]">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#050505]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/sigil-symbol.svg" alt="Sigil" width={36} height={36} />
            <span className="font-display text-[22px] tracking-[0.25em] uppercase">SIGIL</span>
            <span className="text-white/30 text-sm ml-2">Docs</span>
          </Link>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/Arven-Digital/sigil-protocol"
              target="_blank"
              rel="noreferrer"
              className="text-white/40 hover:text-white text-sm transition-colors"
            >
              GitHub ↗
            </a>
            <Link
              href="/onboarding"
              className="px-4 py-1.5 rounded-md text-[#050505] font-medium text-sm transition-all hover:brightness-110"
              style={{ backgroundColor: NEON }}
            >
              Deploy Wallet
            </Link>
          </div>
        </div>
      </nav>

      <div className="pt-20 flex max-w-7xl mx-auto">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 border-r border-white/5 p-6 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto">
          <nav className="space-y-1">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`block w-full text-left px-3 py-2 rounded-lg text-[13px] transition-colors ${
                  activeSection === s.id
                    ? "text-[#050505] font-medium"
                    : "text-white/40 hover:text-white/70"
                }`}
                style={activeSection === s.id ? { backgroundColor: NEON } : undefined}
              >
                {s.title}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 px-12 py-8 max-w-4xl">
          <h1 className="text-3xl font-bold mb-8">{section.title}</h1>
          <div className="prose prose-invert prose-sm max-w-none
            prose-headings:font-semibold prose-headings:tracking-tight
            prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-4
            prose-h3:text-base prose-h3:mt-8 prose-h3:mb-3
            prose-p:text-white/60 prose-p:leading-relaxed
            prose-a:text-[#00FF88] prose-a:no-underline hover:prose-a:underline
            prose-code:text-[#00FF88] prose-code:bg-white/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
            prose-pre:bg-[#0A0A0A] prose-pre:border prose-pre:border-white/5
            prose-table:text-sm prose-th:text-white/60 prose-td:text-white/40
            prose-strong:text-white/80
            prose-li:text-white/60
            prose-hr:border-white/5
          ">
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(section.content) }} />
          </div>
        </main>
      </div>
    </div>
  );
}

// Simple markdown renderer (no external deps)
function renderMarkdown(md: string): string {
  return md
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) =>
      `<pre class="overflow-x-auto"><code class="language-${lang}">${escapeHtml(code.trim())}</code></pre>`
    )
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    // Tables
    .replace(/^\|(.+)\|$/gm, (match) => {
      const cells = match.split('|').filter(c => c.trim());
      if (cells.every(c => /^[\s-:]+$/.test(c))) return ''; // separator row
      const tag = cells.some(c => /^[\s-:]+$/.test(c)) ? 'td' : 'td';
      return '<tr>' + cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>';
    })
    // Wrap consecutive table rows
    .replace(/((?:<tr>.*<\/tr>\n?)+)/g, '<table><tbody>$1</tbody></table>')
    // Lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
    // Numbered lists  
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Paragraphs (lines not already wrapped)
    .replace(/^(?!<[a-z])([\w\[].+)$/gm, '<p>$1</p>')
    // Clean up empty lines
    .replace(/\n{3,}/g, '\n\n');
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
