# @sigil-protocol/sdk

TypeScript SDK for [Sigil Protocol](https://sigil.codes) — ERC-4337 smart wallets for AI agents.

## Install

```bash
npm install @sigil-protocol/sdk ethers
```

`ethers` v6 is a peer dependency.

## Quick Start

```typescript
import { SigilSDK } from '@sigil-protocol/sdk';

const sigil = new SigilSDK({
  apiKey: 'sgil_your_api_key',
  accountAddress: '0xYourSigilWallet',
  agentPrivateKey: '0xYourAgentPrivateKey',
  chainId: 137, // Polygon
});

// Approve USDC spending
const result = await sigil.approve(
  '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // USDC on Polygon
  '0xSpenderAddress',
  1000000n, // 1 USDC (6 decimals)
);
console.log('Tx hash:', result.txHash);

// Transfer tokens
await sigil.transfer(USDC, '0xRecipient', 500000n);

// Send native token (MATIC/ETH)
await sigil.transferNative('0xRecipient', ethers.parseEther('0.1'));

// Arbitrary contract call
await sigil.contractCall(targetAddress, 0n, encodedCalldata);

// Dry run — check if guardian would approve
const eval = await sigil.evaluate(targetAddress, 0n, encodedCalldata);
console.log(eval.verdict, eval.riskScore);
```

## Supported Chains

| Chain    | ID    |
|----------|-------|
| Polygon  | 137   |
| Avalanche| 43114 |
| Base     | 8453  |
| Arbitrum | 42161 |
| 0G       | 16661 |

## API

### `new SigilSDK(config)`

- `apiKey` — Your `sgil_...` API key
- `accountAddress` — Your Sigil smart wallet address
- `agentPrivateKey` — Agent's EOA private key for signing UserOps
- `chainId` — Target chain ID
- `apiUrl` — Optional, defaults to `https://api.sigil.codes`

### Methods

| Method | Description |
|--------|-------------|
| `approve(token, spender, amount)` | ERC-20 approve |
| `transfer(token, to, amount)` | ERC-20 transfer |
| `transferNative(to, amount)` | Send native token |
| `contractCall(target, value, data)` | Arbitrary call |
| `evaluate(target, value, data)` | Dry run evaluation |
| `getAccount()` | Account info |
| `getPolicy()` | Spending policy |
| `buildUserOp(target, value, data)` | Low-level: build UserOp |
| `signUserOp(userOp)` | Low-level: sign UserOp |
| `submitUserOp(userOp)` | Low-level: submit UserOp |

### Error Handling

```typescript
import { SigilError } from '@sigil-protocol/sdk';

try {
  await sigil.approve(token, spender, amount);
} catch (err) {
  if (err instanceof SigilError) {
    console.log(err.code);            // 'API_ERROR', 'NONCE_ERROR', etc.
    console.log(err.rejectionReason);  // Why guardian rejected
    console.log(err.riskScore);        // Risk score from evaluation
    console.log(err.guidance);         // Suggested fix
  }
}
```

## License

MIT
