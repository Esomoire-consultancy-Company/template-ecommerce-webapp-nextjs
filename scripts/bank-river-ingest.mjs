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

const prohibitedKeys = new Set([
  'accesstoken',
  'refreshtoken',
  'clientsecret',
  'password',
  'otp',
  'vua',
  'authorization',
  'bankaccountnumber',
  'accountnumber',
  'pan',
  'aadhaar',
  'dob',
]);

function scanProhibited(value, pathParts = []) {
  if (!value || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      scanProhibited(item, [...pathParts, String(index)])
    );
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    const normalized = key.replace(/[_-]/g, '').toLowerCase();

    if (prohibitedKeys.has(normalized)) {
      throw new Error(
        `Prohibited sensitive key found in River payload: ${[...pathParts, key].join('.')}`
      );
    }

    scanProhibited(item, [...pathParts, key]);
  }
}

const runId = required('BANK_RUN_ID');
const mode = process.env.RIVER_INGEST_MODE || 'verify';
const baseDir = path.resolve(process.cwd(), '.local/banking');
const eventPath = path.join(baseDir, `${runId}.river-event.json`);
const durableReceiptPath = path.join(
  baseDir,
  `${runId}.river-durable-receipt.json`
);

if (!fs.existsSync(eventPath)) {
  throw new Error(
    `River event candidate not found: ${eventPath}. Run yarn bank:river:validate first.`
  );
}

const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
const { event_hash: eventHash, ...eventWithoutHash } = event;

if (!eventHash || sha256(eventWithoutHash) !== eventHash) {
  throw new Error('River event candidate hash is invalid.');
}

if (
  event.event_type !== 'BANK_SETTLEMENT_RECONCILED' ||
  event.source_system !== 'setu-aa' ||
  event.source_environment !== 'sandbox' ||
  event.lifecycle_status !== 'VERIFIED' ||
  event.new_state?.replayVerified !== true
) {
  throw new Error('River event candidate is outside R0.8 admitted semantics.');
}

if (
  event.metadata?.rawFinancialInformationPersisted !== false ||
  event.metadata?.bankNativeTruthRetainedByProvider !== true
) {
  throw new Error('River event candidate violates evidence/truth boundaries.');
}

scanProhibited(event);

const request = {
  contract_id: 'RIVER-EXTERNAL-EVIDENCE-INGRESS-001',
  contract_version: '0.1',
  event,
};

if (mode === 'verify') {
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode,
        runId,
        contractId: request.contract_id,
        sourceEventRef: event.source_event_ref,
        eventHash,
        durableRiverWritePerformed: false,
        next:
          'Set RIVER_INGEST_MODE=http plus RIVER_INGEST_URL and runtime authorization to perform the admitted River ingress call.',
      },
      null,
      2
    )
  );
  process.exit(0);
}

if (mode !== 'http') {
  throw new Error('RIVER_INGEST_MODE must be verify or http.');
}

const endpoint = required('RIVER_INGEST_URL');
const token = required('RIVER_API_TOKEN');

const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify(request),
});

const body = await response.json().catch(() => ({
  accepted: false,
  failure_code: 'INGEST_FAILED',
  reason: 'River ingress returned non-JSON response.',
}));

if (!response.ok || body.accepted !== true) {
  throw new Error(
    `River ingress rejected evidence: ${body.failure_code ?? response.status} ${body.reason ?? ''}`.trim()
  );
}

const requiredFields = [
  'river_event_ref',
  'river_receipt_ref',
  'workspace_id',
  'source_event_ref',
  'event_hash',
  'recorded_at',
];

for (const field of requiredFields) {
  if (!body[field]) {
    throw new Error(`River ingress success response is missing ${field}.`);
  }
}

if (body.workspace_id !== event.workspace_id) {
  throw new Error('River durable receipt workspace mismatch.');
}
if (body.source_system !== event.source_system) {
  throw new Error('River durable receipt source-system mismatch.');
}
if (body.source_event_ref !== event.source_event_ref) {
  throw new Error('River durable receipt source-event mismatch.');
}
if (body.event_hash !== event.event_hash) {
  throw new Error('River durable receipt event-hash mismatch.');
}

const durableReceipt = {
  version: 'BANK-CONNECTION-001/R0.8',
  contractId: request.contract_id,
  runId,
  riverEventRef: body.river_event_ref,
  riverReceiptRef: body.river_receipt_ref,
  workspaceId: body.workspace_id,
  sourceSystem: body.source_system,
  sourceEventRef: body.source_event_ref,
  eventHash: body.event_hash,
  recordedAt: body.recorded_at,
  idempotentReplay: body.idempotent_replay === true,
  bankNativeTruthRetainedByProvider: true,
  rawFinancialInformationPersisted: false,
};

fs.writeFileSync(
  durableReceiptPath,
  JSON.stringify(durableReceipt, null, 2) + '\n',
  { mode: 0o600 }
);

console.log(
  JSON.stringify(
    {
      ok: true,
      mode,
      runId,
      riverEventRef: durableReceipt.riverEventRef,
      riverReceiptRef: durableReceipt.riverReceiptRef,
      eventHash: durableReceipt.eventHash,
      idempotentReplay: durableReceipt.idempotentReplay,
      durableReceiptPath,
      durableRiverWritePerformed: true,
    },
    null,
    2
  )
);
