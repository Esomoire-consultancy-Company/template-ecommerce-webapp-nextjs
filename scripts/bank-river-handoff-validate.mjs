import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function canonicalize(value) {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    return 'null';
  }
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? 'null' : encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.keys(value)
    .filter((key) => {
      const item = value[key];
      return item !== undefined && typeof item !== 'function' && typeof item !== 'symbol';
    })
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
    .join(',')}`;
}

function sha256(value) {
  return createHash('sha256').update(canonicalize(value)).digest('hex');
}

const runId = required('BANK_RUN_ID');
const workspaceId = required('RIVER_WORKSPACE_ID');
const baseDir = path.resolve(process.cwd(), '.local/banking');
const statePath = path.join(baseDir, `${runId}.json`);
const receiptPath = path.join(baseDir, `${runId}.receipt.json`);
const outputPath = path.join(baseDir, `${runId}.river-event.json`);

if (!fs.existsSync(statePath) || !fs.existsSync(receiptPath)) {
  throw new Error('R0.7 state and reconciliation receipt are both required.');
}

const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));

if (state.stage !== 'REPLAY_VERIFIED' || state.replay?.deterministic !== true) {
  throw new Error('River handoff requires provider-backed REPLAY_VERIFIED state.');
}
if (receipt.receiptType !== 'BANK_SETTLEMENT_RECONCILED') {
  throw new Error('Unsupported receipt type.');
}
if (receipt.version !== 'BANK-CONNECTION-001/R0.7') {
  throw new Error('Unsupported handoff version.');
}
if (receipt.provider !== 'setu-aa' || receipt.environment !== 'sandbox') {
  throw new Error('R0.8 validator only admits Setu AA sandbox receipts.');
}
if (receipt.rawFinancialInformationPersisted !== false) {
  throw new Error('Receipt violates the raw-FI persistence boundary.');
}
if (!state.reconciliation?.receiptHash) {
  throw new Error('Stored full receipt hash is missing from R0.7 state.');
}
if (sha256(receipt) !== state.reconciliation.receiptHash) {
  throw new Error('Full reconciliation receipt hash mismatch.');
}
if (sha256(receipt.reconciliation) !== receipt.reconciliationHash) {
  throw new Error('Reconciliation hash mismatch.');
}
if (state.replay.reconciliationHash !== receipt.reconciliationHash) {
  throw new Error('Replay reconciliation hash does not match receipt.');
}
if (state.replay.observationSetHash !== receipt.observationSetHash) {
  throw new Error('Replay observation-set hash does not match receipt.');
}

const sourceEventRef =
  `bank:${receipt.runId}:${receipt.reconciliationHash}`;

const core = {
  stream_id: process.env.RIVER_STREAM_ID || undefined,
  workspace_id: workspaceId,
  event_type: 'BANK_SETTLEMENT_RECONCILED',
  event_version: '0.2',
  action: 'RECONCILE_BANK_SETTLEMENT',
  source_system: 'setu-aa',
  source_environment: 'sandbox',
  source_event_ref: sourceEventRef,
  idempotency_key: sourceEventRef,
  actor_type: 'service',
  actor_id: receipt.actorRef,
  digitalme_principal: process.env.RIVER_DIGITALME_PRINCIPAL || undefined,
  organisation_id: process.env.RIVER_ORGANISATION_ID || undefined,
  workflow_id: process.env.RIVER_WORKFLOW_ID || undefined,
  object_type: 'bank_settlement_reconciliation',
  object_id: receipt.expectationRef,
  previous_state: null,
  new_state: {
    outcome: receipt.reconciliation.outcome,
    amountVarianceMinor: receipt.reconciliation.amountVarianceMinor,
    reasons: receipt.reconciliation.reasons,
    providerTransactionRef: receipt.providerTransactionRef,
    observationSetHash: receipt.observationSetHash,
    expectationHash: receipt.expectationHash,
    reconciliationHash: receipt.reconciliationHash,
    replayVerified: true,
  },
  authority_basis: {
    wardenDecisionRef: receipt.wardenDecisionRef,
  },
  consent_context: {
    consentRef: receipt.consentRef,
    notificationCorrelationRef: receipt.notificationCorrelationRef,
  },
  commercial_relevance: true,
  settlement_eligibility: 'not_applicable',
  lifecycle_status: 'VERIFIED',
  correlation_id: process.env.RIVER_CORRELATION_ID || undefined,
  causation_id: process.env.RIVER_CAUSATION_ID || undefined,
  occurred_at: receipt.occurredAt,
  observed_at: new Date().toISOString(),
  metadata: {
    bankingContractVersion: 'BANK-CONNECTION-001/R0.8',
    providerSessionRef: receipt.sessionRef,
    providerTraceId: receipt.providerTraceId,
    merchantRef: receipt.merchantRef,
    runId: receipt.runId,
    rawFinancialInformationPersisted: false,
    bankNativeTruthRetainedByProvider: true,
  },
};

const event = {
  ...core,
  event_hash: sha256(core),
};

fs.writeFileSync(
  outputPath,
  JSON.stringify(event, null, 2) + '\n',
  { mode: 0o600 }
);

console.log(
  JSON.stringify(
    {
      ok: true,
      version: 'BANK-CONNECTION-001/R0.8',
      runId,
      sourceEventRef,
      idempotencyKey: event.idempotency_key,
      eventHash: event.event_hash,
      outputPath,
      durableRiverWritePerformed: false,
      settlementEligibility: event.settlement_eligibility,
      bankNativeTruthRetainedByProvider: true,
    },
    null,
    2
  )
);
