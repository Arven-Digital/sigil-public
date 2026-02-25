---
title: "How We Validated 558 Tests Across 32 Suites — Our Security Journey"
date: "2026-02-14"
excerpt: "From formal verification with Halmos to getting pen-tested by an AI — here's how we approached security for Sigil Protocol's smart contracts."
author: "Sigil Team"
tags: ["security", "testing", "audit"]
---

# How We Validated 558 Tests Across 32 Suites — Our Security Journey

Security isn't a checkbox. It's not something you do once before launch and then forget about. For Sigil Protocol — infrastructure that secures AI agent wallets — getting security right isn't just important, it's the entire value proposition.

Here's how we approached it.

## The Testing Foundation

Sigil's smart contract suite consists of multiple interacting contracts: the smart account, Guardian validator, session key manager, policy engine, recovery module, upgrade controller, and more. Each component needs to work correctly in isolation *and* in composition.

We ended up with **558 tests across 32 test suites**, covering:

- Unit tests for every public and external function
- Integration tests for cross-contract interactions
- Edge case tests for boundary conditions
- Fuzz tests with randomized inputs
- Invariant tests for properties that must always hold
- Gas benchmarks to prevent regression

Every test runs on every commit. No exceptions.

## Formal Verification with Halmos

Testing tells you that specific inputs produce expected outputs. Formal verification tells you that *all possible inputs* produce correct behavior.

We used [Halmos](https://github.com/a16z/halmos) with the Z3 SMT solver to formally verify critical invariants:

- **Access control** — only authorized signers can execute specific functions
- **Fund safety** — no code path allows unauthorized fund movement
- **State consistency** — account state transitions are always valid
- **Guardian constraints** — the Guardian can co-sign but never initiate

Formal verification doesn't replace testing — it complements it. Tests catch implementation bugs. Formal verification catches *logical* bugs that no amount of testing would find because you'd never think to write that specific test case.

## Multiple Audit Rounds

We went through multiple rounds of professional security review. Each round followed the same pattern:

1. **Preparation** — freeze code, document architecture, write threat model
2. **Review** — auditors examine every contract, every function, every state transition
3. **Findings** — categorized by severity (Critical, High, Medium, Low, Informational)
4. **Remediation** — fix every finding, document the fix
5. **Re-review** — auditors verify all fixes, check for regressions
6. **Report** — final audit report published

We're not going to share specific findings or exact numbers here — that's between us and our auditors. What we will say is that every finding was addressed, and the re-reviews confirmed clean fixes.

The key insight from the audit process: **the bugs you expect aren't the ones they find**. We were worried about complex reentrancy scenarios. The auditors found subtle issues in access control edge cases we'd never considered. That's why you hire external reviewers — they think differently than the people who wrote the code.

## The Shannon AI Pentester Story

This one deserves its own section because it's genuinely entertaining.

[Shannon](https://x.com/keygraphhq) is an AI-powered penetration testing tool. We pointed it at our infrastructure to see what an autonomous attacker could find.

Shannon found 6 potential vulnerabilities. That sounds alarming, but here's the punchline: **it couldn't exploit any of them because its own JWT authentication token expired mid-attack**.

An AI pentester, defeated by session expiry. There's a metaphor in there somewhere about the importance of proper session management — which, incidentally, is exactly what Sigil's session key system is designed for.

In all seriousness, Shannon's findings were valuable. Several overlapped with issues our human auditors had flagged, which gave us confidence in the coverage. The ones that didn't overlap were low-severity edge cases that we addressed anyway.

Shoutout to [@keygraphhq](https://x.com/keygraphhq) for building Shannon. AI pentesting is still early, but the trajectory is impressive.

## What We Learned

After this entire process — 558 tests, formal verification, multiple audit rounds, AI pentesting — here are the lessons we'd share with any team building security-critical smart contracts:

### 1. Test Composition, Not Just Units

Individual contract tests are necessary but insufficient. The most dangerous bugs live in the *interactions* between contracts. Your session key manager might be flawless in isolation, but what happens when it interacts with the upgrade controller during a recovery flow? Test the combinations.

### 2. Fuzz Early, Fuzz Often

Fuzz testing found bugs that our hand-written tests missed. Randomized inputs explore state spaces that human test authors don't think to cover. We run fuzz tests with thousands of iterations on every CI run.

### 3. Formal Verification Is Worth the Investment

Setting up Halmos and writing verification properties took significant time. It was worth every hour. The invariants we verified give us a level of confidence that testing alone cannot provide.

### 4. External Review Is Non-Negotiable

You cannot audit your own code effectively. The team that wrote the code has blind spots — assumptions baked so deep they're invisible. Fresh eyes find fresh bugs.

### 5. Security Is Ongoing

Our test suite grows with every feature. Our monitoring catches anomalies in production. Our upgrade path includes timelock + guardian co-sign precisely because we know future changes need the same rigor.

Security is a process, not a milestone.

## The Numbers

| Metric | Value |
|--------|-------|
| Test suites | 32 |
| Individual tests | 558 |
| Formal verification properties | Multiple critical invariants |
| Audit rounds | Multiple |
| AI pentest findings | 6 (all addressed) |
| Post-remediation critical findings | 0 |

## What's Next

We're continuing to expand our test coverage as we add new features. Every new chain deployment gets its own integration test suite. Every SDK update is tested against the full contract suite.

If you're evaluating Sigil for your agent's wallet security, we'd encourage you to look at the code yourself:

**[github.com/Arven-Digital/sigil-public](https://github.com/Arven-Digital/sigil-public)**

Read the contracts. Run the tests. Check the verification properties. Security infrastructure should be verifiable, not just claimed.

---

*Sigil Protocol provides 3-layer Guardian validation for AI agent wallets. [Deploy your first secured wallet →](/onboarding)*
