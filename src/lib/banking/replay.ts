import { createHash } from 'node:crypto';

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();

  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(',')}`;
}

export function canonicalSha256(value: unknown): string {
  return createHash('sha256').update(canonicalize(value)).digest('hex');
}

export interface BankReplayCheckpoint {
  version: 'BANK-CONNECTION-001/R0.6';
  inputHash: string;
  normalizedObservationHash: string;
  reconciliationHash: string;
}

export function compileReplayCheckpoint(input: {
  source: unknown;
  normalizedObservations: unknown;
  reconciliation: unknown;
}): BankReplayCheckpoint {
  return {
    version: 'BANK-CONNECTION-001/R0.6',
    inputHash: canonicalSha256(input.source),
    normalizedObservationHash: canonicalSha256(input.normalizedObservations),
    reconciliationHash: canonicalSha256(input.reconciliation),
  };
}

export function assertReplayDeterministic(
  before: BankReplayCheckpoint,
  after: BankReplayCheckpoint
): void {
  if (
    before.inputHash !== after.inputHash ||
    before.normalizedObservationHash !== after.normalizedObservationHash ||
    before.reconciliationHash !== after.reconciliationHash
  ) {
    throw new Error('Bank reconciliation replay is not deterministic.');
  }
}
