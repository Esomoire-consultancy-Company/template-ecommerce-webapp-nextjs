import http from 'node:http';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const runId = 'ci-r0-8-http';
const baseDir = path.resolve(process.cwd(), '.local/banking');
const eventPath = path.join(baseDir, `${runId}.river-event.json`);
const durableReceiptPath = path.join(
  baseDir,
  `${runId}.river-durable-receipt.json`
);

fs.mkdirSync(baseDir, { recursive: true });

const event = {
  workspace_id: '00000000-0000-4000-8000-000000000801',
  event_type: 'BANK_SETTLEMENT_RECONCILED',
  event_version: '0.2',
  action: 'RECONCILE_BANK_SETTLEMENT',
  source_system: 'setu-aa',
  source_environment: 'sandbox',
  source_event_ref: 'bank:ci-r0-8-http:reconciliation-hash',
  idempotency_key: 'bank:ci-r0-8-http:reconciliation-hash',
  actor_type: 'service',
  actor_id: 'service:bank-ci',
  object_type: 'bank_settlement_reconciliation',
  object_id: 'SETTLEMENT-CI-HTTP-001',
  previous_state: null,
  new_state: {
    outcome: 'MATCH',
    reasons: ['Synthetic contract fixture'],
    observationSetHash: 'observation-hash',
    expectationHash: 'expectation-hash',
    reconciliationHash: 'reconciliation-hash',
    replayVerified: true,
  },
  authority_basis: { wardenDecisionRef: 'WARDEN-CI-HTTP-001' },
  consent_context: { consentRef: 'CONSENT-CI-HTTP-001' },
  commercial_relevance: true,
  settlement_eligibility: 'not_applicable',
  lifecycle_status: 'VERIFIED',
  occurred_at: '2026-09-23T00:00:00+05:30',
  observed_at: '2026-09-23T00:01:00+05:30',
  metadata: {
    bankingContractVersion: 'BANK-CONNECTION-001/R0.8',
    merchantRef: 'merchant:ci',
    runId,
    rawFinancialInformationPersisted: false,
    bankNativeTruthRetainedByProvider: true,
  },
};

function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
    .join(',')}`;
}

const { createHash } = await import('node:crypto');
event.event_hash = createHash('sha256')
  .update(canonicalize(event))
  .digest('hex');

fs.writeFileSync(eventPath, JSON.stringify(event, null, 2) + '\n');

let seenRequest;

const server = http.createServer((req, res) => {
  let data = '';

  req.on('data', (chunk) => {
    data += chunk;
  });

  req.on('end', () => {
    seenRequest = JSON.parse(data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        accepted: true,
        river_event_ref: 'RIVER-EVENT-CI-HTTP-001',
        river_receipt_ref: 'RIVER-RECEIPT-CI-HTTP-001',
        workspace_id: event.workspace_id,
        source_system: event.source_system,
        source_event_ref: event.source_event_ref,
        event_hash: event.event_hash,
        recorded_at: '2026-09-23T00:02:00+05:30',
        idempotent_replay: false,
      })
    );
  });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();

const child = spawnSync(
  process.execPath,
  ['scripts/bank-river-ingest.mjs'],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      BANK_RUN_ID: runId,
      RIVER_INGEST_MODE: 'http',
      RIVER_INGEST_URL: `http://127.0.0.1:${address.port}/ingest`,
      RIVER_API_TOKEN: 'ci-only-token',
    },
    encoding: 'utf8',
  }
);

await new Promise((resolve) => server.close(resolve));

if (child.status !== 0) {
  process.stderr.write(child.stderr || child.stdout);
  process.exit(child.status ?? 1);
}

if (
  seenRequest?.contract_id !== 'RIVER-EXTERNAL-EVIDENCE-INGRESS-001' ||
  seenRequest?.event?.event_hash !== event.event_hash
) {
  throw new Error('HTTP ingress request contract mismatch.');
}

if (!fs.existsSync(durableReceiptPath)) {
  throw new Error('Durable River receipt was not written.');
}

const durableReceipt = JSON.parse(
  fs.readFileSync(durableReceiptPath, 'utf8')
);

if (
  durableReceipt.riverEventRef !== 'RIVER-EVENT-CI-HTTP-001' ||
  durableReceipt.riverReceiptRef !== 'RIVER-RECEIPT-CI-HTTP-001' ||
  durableReceipt.eventHash !== event.event_hash ||
  durableReceipt.rawFinancialInformationPersisted !== false ||
  durableReceipt.bankNativeTruthRetainedByProvider !== true
) {
  throw new Error('Durable River receipt contract mismatch.');
}

console.log(
  JSON.stringify(
    {
      ok: true,
      version: 'BANK-CONNECTION-001/R0.8',
      httpIngressContractVerified: true,
      riverEventRef: durableReceipt.riverEventRef,
      riverReceiptRef: durableReceipt.riverReceiptRef,
      durableRiverWritePerformedInCI: false,
    },
    null,
    2
  )
);

for (const p of [eventPath, durableReceiptPath]) {
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
