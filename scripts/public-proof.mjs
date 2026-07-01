#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const ETH = 10n ** 18n;
const ADDRESSES = {
  trustedDex: '0x1111111111111111111111111111111111111111',
  stablecoin: '0x2222222222222222222222222222222222222222',
  scam: '0xdead00000000000000000000000000000000dead',
  recipient: '0x3333333333333333333333333333333333333333',
};

const SELECTORS = {
  transfer: '0xa9059cbb',
  approve: '0x095ea7b3',
  unknown: '0xdeadbeef',
};

const policy = {
  frozen: false,
  maxTxValue: 1n * ETH,
  dailyLimit: 5n * ETH,
  dailySpent: 2n * ETH,
  guardianThreshold: 25n * ETH / 100n,
  allowedTargets: new Set([ADDRESSES.trustedDex, ADDRESSES.stablecoin, ADDRESSES.recipient]),
  blockedTargets: new Set([ADDRESSES.scam]),
  allowedSelectors: new Set([SELECTORS.transfer, SELECTORS.approve, '0x']),
};

function layer1(tx) {
  const selector = tx.data?.slice(0, 10) || '0x';
  const checks = [];
  const block = (reason) => ({ result: 'BLOCKED', reason, checks });
  const pass = (name) => checks.push({ name, result: 'PASS' });

  if (policy.frozen) return block('ACCOUNT_FROZEN');
  pass('not_frozen');

  if (policy.blockedTargets.has(tx.target)) return block('TARGET_BLOCKED');
  pass('target_not_blocked');

  if (!policy.allowedTargets.has(tx.target)) return block('TARGET_NOT_WHITELISTED');
  pass('target_whitelisted');

  if (!policy.allowedSelectors.has(selector)) return block('FUNCTION_NOT_ALLOWED');
  pass('function_allowed');

  if (tx.value > policy.maxTxValue) return block('EXCEEDS_TX_LIMIT');
  pass('per_tx_limit');

  if (policy.dailySpent + tx.value > policy.dailyLimit) return block('EXCEEDS_DAILY_LIMIT');
  pass('daily_limit');

  return { result: 'PASS', checks };
}

function layer2(tx) {
  if (tx.simulation === 'revert') {
    return { result: 'BLOCKED', reason: 'SIMULATION_REVERTED' };
  }
  if (tx.simulation === 'drain') {
    return { result: 'BLOCKED', reason: 'UNEXPECTED_BALANCE_DRAIN' };
  }
  return { result: 'PASS' };
}

function layer3(tx) {
  let score = 10;
  const reasons = ['known policy-compliant transaction'];
  if (tx.value >= policy.guardianThreshold) {
    score += 20;
    reasons.push('value crosses guardian-threshold review band');
  }
  if (tx.target === ADDRESSES.stablecoin && tx.data?.startsWith(SELECTORS.approve)) {
    score += 15;
    reasons.push('token allowance mutation');
  }
  if (tx.context === 'new-counterparty') {
    score += 30;
    reasons.push('new counterparty context');
  }
  return { result: score >= 80 ? 'BLOCKED' : score >= 60 ? 'ESCALATE' : 'PASS', score, reasoning: reasons.join('; ') };
}

function evaluate(tx) {
  const l1 = layer1(tx);
  if (l1.result !== 'PASS') return { verdict: 'REJECTED', reason: l1.reason, riskScore: 100, layers: { layer1: l1 } };

  const l2 = layer2(tx);
  if (l2.result !== 'PASS') return { verdict: 'REJECTED', reason: l2.reason, riskScore: 90, layers: { layer1: l1, layer2: l2 } };

  const l3 = layer3(tx);
  if (l3.result === 'BLOCKED') return { verdict: 'REJECTED', reason: 'AI_RISK_BLOCKED', riskScore: l3.score, layers: { layer1: l1, layer2: l2, layer3: l3 } };
  if (l3.result === 'ESCALATE') return { verdict: 'ESCALATE', reason: 'HUMAN_REVIEW_REQUIRED', riskScore: l3.score, layers: { layer1: l1, layer2: l2, layer3: l3 } };
  return { verdict: 'APPROVED', riskScore: l3.score, layers: { layer1: l1, layer2: l2, layer3: l3 } };
}

const cases = [
  {
    name: 'known recipient native transfer is approved',
    tx: { target: ADDRESSES.recipient, value: 10n ** 17n, data: '0x' },
    expected: 'APPROVED',
  },
  {
    name: 'over-limit native transfer is rejected',
    tx: { target: ADDRESSES.recipient, value: 2n * ETH, data: '0x' },
    expected: 'REJECTED',
  },
  {
    name: 'blocked target is rejected',
    tx: { target: ADDRESSES.scam, value: 0n, data: '0x' },
    expected: 'REJECTED',
  },
  {
    name: 'reverting simulation is rejected',
    tx: { target: ADDRESSES.trustedDex, value: 0n, data: SELECTORS.transfer + '00'.repeat(64), simulation: 'revert' },
    expected: 'REJECTED',
  },
  {
    name: 'new high-value approval escalates to human review',
    tx: { target: ADDRESSES.stablecoin, value: policy.guardianThreshold, data: SELECTORS.approve + '00'.repeat(64), context: 'new-counterparty' },
    expected: 'ESCALATE',
  },
];

const results = cases.map((testCase) => {
  const result = evaluate(testCase.tx);
  const ok = result.verdict === testCase.expected;
  return { name: testCase.name, expected: testCase.expected, verdict: result.verdict, ok, result };
});

const failures = results.filter((r) => !r.ok);

function assertFileContains(file, needle) {
  const body = fs.readFileSync(path.join(root, file), 'utf8');
  if (!body.includes(needle)) throw new Error(`${file} does not contain ${needle}`);
}

function assertFileNotContains(file, needle) {
  const body = fs.readFileSync(path.join(root, file), 'utf8');
  if (body.includes(needle)) throw new Error(`${file} unexpectedly contains ${needle}`);
}

assertFileContains('packages/dashboard/src/lib/contracts.ts', '0x20f926bd5f416c875a7ec538f499d21d62850f35');
assertFileContains('packages/dashboard/src/lib/contracts.ts', '0x483D6e4e203771485aC75f183b56D5F5cDcbe679');
assertFileContains('packages/dashboard/src/lib/contracts.ts', '0x86e85de25473b432dabf1b9e8e8ce5145059b85b');
assertFileContains('packages/dashboard/src/lib/contracts.ts', '0x5729291ed4c69936f5b5ace04dee454c6838fd50');
assertFileContains('packages/dashboard/src/lib/contracts.ts', '0x2f4dd6db7affcf1f34c4d70998983528d834b8f6');
assertFileContains('packages/dashboard/src/lib/contracts.ts', '0x8bAD12A489338B533BCA3B19138Cd61caA17405F');
assertFileNotContains('README.md', '[`packages/api`](packages/api)');
assertFileNotContains('README.md', '[`packages/guardian`](packages/guardian)');

console.log(JSON.stringify({
  proof: 'sigil-public-guardian-decision-demo',
  deterministic: true,
  network: false,
  cases: results.map(({ name, expected, verdict, ok }) => ({ name, expected, verdict, ok })),
}, null, 2));

if (failures.length) {
  console.error('Proof failures:', failures.map((f) => f.name).join(', '));
  process.exit(1);
}
