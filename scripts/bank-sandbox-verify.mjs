import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const fixturePath = path.resolve(
  process.cwd(),
  'fixtures/banking/r0.4-reconciliation-vectors.json'
);

const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

function parseDate(value, field) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${field} must be a valid date/time.`);
  }
  return parsed;
}

function reconcile(expected, observed, toleranceMinor = 0) {
  if (!Number.isSafeInteger(toleranceMinor) || toleranceMinor < 0) {
    throw new Error('toleranceMinor must be a finite non-negative integer.');
  }

  if (!observed) return 'NO_MATCH';
  if (expected.currency !== observed.currency) return 'CURRENCY_DIFFERENCE';
  if (expected.direction !== observed.direction) return 'DIRECTION_DIFFERENCE';

  const observedTime = Date.parse(observed.bookedAt ?? observed.observedAt);
  if (!Number.isFinite(observedTime)) return 'DATE_OUTSIDE_WINDOW';

  if (
    expected.expectedFrom &&
    observedTime < parseDate(expected.expectedFrom, 'expectedFrom')
  ) {
    return 'DATE_OUTSIDE_WINDOW';
  }

  if (
    expected.expectedTo &&
    observedTime > parseDate(expected.expectedTo, 'expectedTo')
  ) {
    return 'DATE_OUTSIDE_WINDOW';
  }

  const variance = observed.amountMinor - expected.amountMinor;
  if (Math.abs(variance) > toleranceMinor) return 'AMOUNT_DIFFERENCE';

  if (
    expected.providerReference &&
    (!observed.description ||
      !observed.description.includes(expected.providerReference))
  ) {
    return 'REFERENCE_MISMATCH';
  }

  return variance === 0 ? 'MATCH' : 'MATCH_WITH_TOLERANCE';
}

if (fixture.synthetic !== true) {
  throw new Error('R0.4 verification refuses non-synthetic fixture data.');
}

let failed = 0;

for (const vector of fixture.vectors) {
  const actual = reconcile(
    vector.expected,
    vector.observed,
    vector.toleranceMinor ?? 0
  );

  const ok = actual === vector.expectedOutcome;

  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${vector.id}: expected=${vector.expectedOutcome} actual=${actual}`
  );

  if (!ok) failed += 1;
}

let invalidToleranceRejected = false;

try {
  const vector = fixture.vectors[0];
  reconcile(vector.expected, vector.observed, Number.NaN);
} catch {
  invalidToleranceRejected = true;
}

console.log(
  `${invalidToleranceRejected ? 'PASS' : 'FAIL'} invalid-tolerance: expected rejection`
);

if (!invalidToleranceRejected) failed += 1;

if (failed > 0) {
  console.error(`R0.4 sandbox verification failed: ${failed} check(s)`);
  process.exit(1);
}

console.log(
  `R0.4 sandbox verification passed: ${fixture.vectors.length} synthetic vector(s) + tolerance rejection`
);
