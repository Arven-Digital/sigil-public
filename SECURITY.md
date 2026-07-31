# Security Policy

Sigil is smart-account infrastructure that moves real value, so we take
security reports seriously and want to make responsible disclosure easy.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report privately via GitHub's **Report a vulnerability** button under this
repository's **Security** tab (Private Vulnerability Reporting), or email
**security@arven.digital**.

Please include:

- a description of the issue and its impact,
- steps to reproduce or a proof of concept,
- affected package(s) / contract(s) and version or commit,
- any suggested remediation.

We aim to acknowledge a report within **3 business days** and to provide a
remediation timeline after triage. Please give us a reasonable window to
release a fix before any public disclosure.

## Scope

In scope:

- the published packages in `packages/*` (`@sigil-protocol/sdk`,
  `@sigil-protocol/mcp`, `@sigil-protocol/eliza-plugin`),
- the Solidity contracts under `packages/contracts/`,
- the dashboard application under `packages/dashboard/`.

Out of scope:

- private Sigil backend / guardian infrastructure (not part of this public
  repository),
- third-party dependencies (report those upstream; tell us if we should pin
  or patch),
- findings that require a compromised user device or a phishing precondition.

## Handling of secrets

This is a public repository. It must never contain real private keys, API
keys, tokens, RPC credentials, or `.env` files. `.env.example` carries
placeholders only. A secret-boundary scan runs in CI
(`pnpm gate:release`); if you believe a secret was committed, report it
privately using the channel above rather than opening a public issue.
