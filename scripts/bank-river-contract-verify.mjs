import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`
  ).join(',')}`;
}

function sha256(value) {
  return createHash('sha256').update(canonicalize(value)).digest('hex');
}

const runId = `ci-r0-8-${process.pid}-${Date.now()}`;
const baseDir = path.resolve(process.cwd(), '.local/banking');
const statePath = path.join(baseDir, `${runId}.json`);
const receiptPath = path.join(baseDir, `${runId}.receipt.json`);
const eventPath = path.join(baseDir, `${runId}.river-event.json`);

fs.mkdirSync(baseDir, { recursive: true });

for (const p of [statePath, receiptPath, eventPath]) {
  if (fs.existsSync(p)) {
    throw new Error(
      `Refusing to overwrite existing local evidence fixture path: ${p}`
    );
  }
}

const reconciliation = {
  outcome: 'MATCH',
  amountVarianceMinor: 0,
  reasons: ['Exact amount/direction/currency match'],
};

const observationSetHash = sha256([
  {
    bankConnectionRef: 'SETU-SANDBOX-CI',
    providerTransactionRef: 'BANK-TXN-CI-001',
    observedAt: '2026-09-23T00:00:00+05:30',
    amountMinor: 125000,
    currency: 'INR',
    direction: 'CREDIT',
    description: 'Synthetic payout PAYOUT-CI-001',
  },
]);

const expectation = {
  expectationRef: 'SETTLEMENT-CI-001',
  amountMinor: 125000,
  currency: 'INR',
  direction: 'CREDIT',
  providerReference: 'PAYOUT-CI-001',
};

const receipt = {
  receiptType: 'BANK_SETTLEMENT_RECONCILED',
  version: 'BANK-CONNECTION-001/R0.7',
  provider: 'setu-aa',
  environment: 'sandbox',
  runId,
  actorRef: 'service:bank-ci',
  merchantRef: 'merchant:ci',
  wardenDecisionRef: 'WARDEN-CI-ALLOW-001',
  consentRef: 'CONSENT-CI-001',
  sessionRef: 'SESSION-CI-001',
  notificationCorrelationRef: 'NOTIFY-CI-001',
  providerTraceId: 'TRACE-CI-001',
  providerTransactionRef: 'BANK-TXN-CI-001',
  expectationRef: expectation.expectationRef,
  observationSetHash,
  expectationHash: sha256(expectation),
  reconciliation,
  reconciliationHash: sha256(reconciliation),
  occurredAt: '2026-09-23T00:05:00+05:30',
  rawFinancialInformationPersisted: false,
};

const state = {
  version: 'BANK-CONNECTION-001/R0.7',
  runId,
  provider: 'setu-aa',
  environment: 'sandbox',
  stage: 'REPLAY_VERIFIED',
  replay: {
    deterministic: true,
    observationSetHash,
    reconciliationHash: receipt.reconciliationHash,
    replayedAt: '2026-09-23T00:06:00+05:30',
  },
};

fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');

const result = spawnSync(
  process.execPath,
  ['scripts/bank-river-handoff-validate.mjs'],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      BANK_RUN_ID: runId,
      RIVER_WORKSPACE_ID: '00000000-0000-4000-8000-000000000801',
      RIVER_STREAM_ID: '00000000-0000-4000-8000-000000000802',
      RIVER_DIGITALME_PRINCIPAL: 'digitalme:ci',
      RIVER_ORGANISATION_ID: 'org:ci',
      RIVER_WORKFLOW_ID: 'BANK-CONNECTION-001/R0.8-CI',
    },
    encoding: 'utf8',
  }
);

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));

const assertions = [
  [event.event_type === 'BANK_SETTLEMENT_RECONCILED', 'event type'],
  [event.action === 'RECONCILE_BANK_SETTLEMENT', 'action'],
  [event.source_system === 'setu-aa', 'source system'],
  [event.source_environment === 'sandbox', 'source environment'],
  [event.lifecycle_status === 'VERIFIED', 'lifecycle status'],
  [event.commercial_relevance === true, 'commercial relevance'],
  [event.settlement_eligibility === 'not_applicable', 'settlement eligibility'],
  [event.new_state?.replayVerified === true, 'replay verified'],
  [event.metadata?.rawFinancialInformationPersisted === false, 'raw FI boundary'],
  [event.metadata?.bankNativeTruthRetainedByProvider === true, 'provider truth boundary'],
  [event.source_event_ref === event.idempotency_key, 'idempotency/source ref'],
];

for (const [ok, label] of assertions) {
  if (!ok) throw new Error(`R0.8 contract assertion failed: ${label}`);
}

const { event_hash: eventHash, ...withoutHash } = event;
if (sha256(withoutHash) !== eventHash) {
  throw new Error('R0.8 event hash is not reproducible.');
}

console.log(
  JSON.stringify(
    {
      ok: true,
      version: 'BANK-CONNECTION-001/R0.8',
      sourceEventRef: event.source_event_ref,
      eventHash,
      settlementEligibility: event.settlement_eligibility,
      durableRiverWritePerformed: false,
    },
    null,
    2
  )
);

for (const p of [statePath, receiptPath, eventPath]) {
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
