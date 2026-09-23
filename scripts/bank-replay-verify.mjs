import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const fixturePath = path.resolve(
  process.cwd(),
  'fixtures/banking/r0.4-reconciliation-vectors.json'
);

const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
    .join(',')}`;
}

function sha256(value) {
  return createHash('sha256').update(canonicalize(value)).digest('hex');
}

function reconcile(expected, observed, toleranceMinor = 0) {
  if (!observed) {
    return {
      expectationRef: expected.expectationRef,
      outcome: 'NO_MATCH',
      reasons: ['No provider transaction observation supplied'],
    };
  }

  if (expected.currency !== observed.currency) {
    return {
      expectationRef: expected.expectationRef,
      providerTransactionRef: observed.providerTransactionRef,
      outcome: 'CURRENCY_DIFFERENCE',
      reasons: ['Currency differs'],
    };
  }

  if (expected.direction !== observed.direction) {
    return {
      expectationRef: expected.expectationRef,
      providerTransactionRef: observed.providerTransactionRef,
      outcome: 'DIRECTION_DIFFERENCE',
      reasons: ['Credit/debit direction differs'],
    };
  }

  const variance = observed.amountMinor - expected.amountMinor;

  if (Math.abs(variance) > toleranceMinor) {
    return {
      expectationRef: expected.expectationRef,
      providerTransactionRef: observed.providerTransactionRef,
      outcome: 'AMOUNT_DIFFERENCE',
      amountVarianceMinor: variance,
      reasons: ['Observed amount is outside configured tolerance'],
    };
  }

  if (
    expected.providerReference &&
    observed.description &&
    !observed.description.includes(expected.providerReference)
  ) {
    return {
      expectationRef: expected.expectationRef,
      providerTransactionRef: observed.providerTransactionRef,
      outcome: 'REFERENCE_MISMATCH',
      amountVarianceMinor: variance,
      reasons: ['Provider reference not found in observation text'],
    };
  }

  return {
    expectationRef: expected.expectationRef,
    providerTransactionRef: observed.providerTransactionRef,
    outcome: variance === 0 ? 'MATCH' : 'MATCH_WITH_TOLERANCE',
    amountVarianceMinor: variance,
    reasons:
      variance === 0
        ? ['Amount, currency and direction match']
        : ['Matched within configured amount tolerance'],
  };
}

function compileRun() {
  const results = fixture.vectors.map((vector) => ({
    id: vector.id,
    result: reconcile(
      vector.expected,
      vector.observed,
      vector.toleranceMinor ?? 0
    ),
  }));

  return {
    inputHash: sha256(fixture),
    reconciliationHash: sha256(results),
    results,
  };
}

if (fixture.synthetic !== true) {
  throw new Error('Replay verifier refuses non-synthetic fixture data.');
}

const first = compileRun();
const second = compileRun();

if (
  first.inputHash !== second.inputHash ||
  first.reconciliationHash !== second.reconciliationHash
) {
  console.error('FAIL R0.6 replay determinism');
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      version: 'BANK-CONNECTION-001/R0.6',
      vectors: fixture.vectors.length,
      inputHash: first.inputHash,
      reconciliationHash: first.reconciliationHash,
      deterministic: true,
    },
    null,
    2
  )
);
