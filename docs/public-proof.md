# Public Proof Notes

This document explains what the public repo can prove without exposing private production services or secrets.

## Local deterministic proof

Run:

```bash
pnpm proof:public
```

The script is intentionally dependency-free and network-free. It verifies:

1. A deterministic Guardian decision model approves safe transactions.
2. The same model rejects over-limit, blocked-target, and reverting-simulation transactions.
3. High-risk approval context escalates instead of silently approving.
4. The README does not claim private API/Guardian packages are present in the public repo.
5. The dashboard contract config contains the six canonical V12 factory addresses.

The output is JSON so CI logs are easy to inspect.

## Live read-only proof

Run:

```bash
pnpm --filter @sigil-protocol/dashboard test
```

The dashboard E2E suite performs read-only checks against:

- `https://api.sigil.codes/v1/health`;
- live dashboard/security headers;
- public RPC endpoints for factory code, `deployFee()`, `owner()`, and short-range `AccountCreated` log queries;
- known deployed account reads.

These tests do not mutate contracts, databases, production state, or user wallets.

## Contract proof

The public contract package includes Solidity source and Foundry artifacts/tests. The release gate currently uses the Node workspace gates from the repository root. Foundry-specific gates should be run before contract release branches.

## What this repo does not prove

This public repo does not publish or prove:

- production Guardian source code;
- production API internals;
- live database contents;
- secrets, tokens, private keys, cookies, or environment files;
- private monitoring/infra configuration.

Those are intentionally private. Public proof should verify the integration contract, on-chain deployments, SDK behavior, and sanitized decision semantics.

## Release gate

Public release branches should pass:

```bash
pnpm install --frozen-lockfile
pnpm audit --audit-level high
pnpm test
pnpm build
pnpm lint
pnpm proof:public
```

A high/critical audit finding is a blocker unless a documented exception is reviewed and accepted.
