import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optional(name) {
  return process.env[name] || undefined;
}

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

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function rupeesToMinor(value) {
  const raw = text(value);
  if (!raw || !/^-?\d+(?:\.\d{1,2})?$/.test(raw)) return undefined;
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, fraction = ''] = unsigned.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor)) return undefined;
  return negative ? -minor : minor;
}

function normalizeTransactions(fi, bankConnectionRef) {
  const root = record(fi);
  const observations = [];

  for (const fipValue of array(root?.fips)) {
    const fip = record(fipValue);

    for (const accountValue of array(fip?.accounts)) {
      const account = record(accountValue);
      const data = record(account?.data);
      const accountData = record(data?.account);
      const transactions = record(accountData?.transactions);

      for (const txnValue of array(transactions?.transaction)) {
        const txn = record(txnValue);
        const amountMinor = rupeesToMinor(txn?.amount);
        const direction = text(txn?.type)?.toUpperCase();
        const providerTransactionRef = text(txn?.txnId) ?? text(txn?.reference);
        const observedAt = text(txn?.transactionTimestamp) ?? text(txn?.valueDate);

        if (
          amountMinor === undefined ||
          !providerTransactionRef ||
          !observedAt ||
          !['CREDIT', 'DEBIT'].includes(direction)
        ) continue;

        observations.push({
          bankConnectionRef,
          providerTransactionRef,
          observedAt,
          bookedAt: text(txn?.valueDate),
          amountMinor,
          currency: 'INR',
          direction,
          description: text(txn?.narration),
        });
      }
    }
  }

  return observations;
}

function reconcile(expected, observed, toleranceMinor = 0) {
  if (!observed) return { outcome: 'NO_MATCH', reasons: ['No selected observation'] };
  if (expected.currency !== observed.currency) {
    return { outcome: 'CURRENCY_DIFFERENCE', reasons: ['Currency differs'] };
  }
  if (expected.direction !== observed.direction) {
    return { outcome: 'DIRECTION_DIFFERENCE', reasons: ['Direction differs'] };
  }

  const variance = observed.amountMinor - expected.amountMinor;
  if (Math.abs(variance) > toleranceMinor) {
    return {
      outcome: 'AMOUNT_DIFFERENCE',
      amountVarianceMinor: variance,
      reasons: ['Amount is outside tolerance'],
    };
  }

  if (
    expected.providerReference &&
    observed.description &&
    !observed.description.includes(expected.providerReference)
  ) {
    return {
      outcome: 'REFERENCE_MISMATCH',
      amountVarianceMinor: variance,
      reasons: ['Provider reference not found in narration'],
    };
  }

  return {
    outcome: variance === 0 ? 'MATCH' : 'MATCH_WITH_TOLERANCE',
    amountVarianceMinor: variance,
    reasons: [variance === 0 ? 'Exact amount/direction/currency match' : 'Matched within tolerance'],
  };
}

const environment = required('SETU_AA_ENVIRONMENT');
if (environment !== 'sandbox') throw new Error('Evidence runner is sandbox-only.');

const action = required('SETU_AA_EVIDENCE_ACTION');
const runId = required('BANK_RUN_ID');
const baseDir = path.resolve(process.cwd(), '.local/banking');
const statePath = path.join(baseDir, `${runId}.json`);
fs.mkdirSync(baseDir, { recursive: true });

function readState() {
  if (!fs.existsSync(statePath)) throw new Error(`Run state not found: ${statePath}`);
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

function writeState(state) {
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
}

function safePrint(value) {
  console.log(JSON.stringify(value, null, 2));
}

if (action === 'init') {
  if (fs.existsSync(statePath)) throw new Error('Run state already exists; choose a new BANK_RUN_ID.');

  const state = {
    version: 'BANK-CONNECTION-001/R0.7',
    runId,
    provider: 'setu-aa',
    environment: 'sandbox',
    actorRef: required('BANK_ACTOR_REF'),
    merchantRef: required('BANK_MERCHANT_REF'),
    wardenDecisionRef: required('WARDEN_DECISION_REF'),
    stage: 'INITIALIZED',
    createdAt: new Date().toISOString(),
  };

  writeState(state);
  safePrint({ ok: true, stage: state.stage, runId, statePath });
  process.exit(0);
}

const productInstanceId = required('SETU_AA_PRODUCT_INSTANCE_ID');
const accessToken = required('SETU_AA_ACCESS_TOKEN');
const baseUrl = 'https://fiu-sandbox.setu.co';

async function request(apiPath, init = {}) {
  const response = await fetch(`${baseUrl}${apiPath}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'x-product-instance-id': productInstanceId,
      ...(init.headers ?? {}),
    },
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `Setu request failed ${response.status}: ${body.errorCode ?? ''} ${body.errorMsg ?? ''}`.trim()
    );
  }
  return body;
}

const state = readState();

if (state.environment !== 'sandbox' || state.provider !== 'setu-aa') {
  throw new Error('Run state is outside the admitted sandbox/provider boundary.');
}

if (action === 'attach-consent') {
  const consentId = required('SETU_AA_CONSENT_ID');
  const consent = await request(`/consents/${encodeURIComponent(consentId)}`);
  state.consent = {
    id: consent.id ?? consentId,
    status: consent.status,
    traceId: consent.traceId,
    observedAt: new Date().toISOString(),
  };
  state.stage = consent.status === 'ACTIVE' ? 'CONSENT_ACTIVE' : 'CONSENT_OBSERVED';
  writeState(state);
  safePrint({ ok: true, runId, stage: state.stage, consent: state.consent });
} else if (action === 'create-session') {
  if (state.consent?.status !== 'ACTIVE') {
    throw new Error('Cannot create FI session until provider-confirmed consent state is ACTIVE.');
  }

  const from = required('SETU_AA_DATA_FROM');
  const to = required('SETU_AA_DATA_TO');
  const session = await request('/sessions', {
    method: 'POST',
    body: JSON.stringify({
      consentId: state.consent.id,
      dataRange: { from, to },
      format: 'json',
    }),
  });

  state.session = {
    id: session.id,
    status: session.status,
    traceId: session.traceId,
    dataRange: { from, to },
    createdAt: new Date().toISOString(),
  };
  state.stage = 'FI_SESSION_CREATED';
  writeState(state);
  safePrint({ ok: true, runId, stage: state.stage, session: state.session });
} else if (action === 'record-notification') {
  if (!state.session?.id) throw new Error('No known FI session exists in this run.');

  const notificationStatus = required('SETU_AA_FI_READY_STATUS');
  if (!['PARTIAL', 'COMPLETED'].includes(notificationStatus)) {
    throw new Error('Notification readiness must be PARTIAL or COMPLETED.');
  }

  state.notification = {
    correlationRef: required('SETU_AA_NOTIFICATION_CORRELATION_REF'),
    status: notificationStatus,
    correlatedAt: new Date().toISOString(),
  };
  state.stage = 'FI_NOTIFICATION_CORRELATED';
  writeState(state);
  safePrint({ ok: true, runId, stage: state.stage, notification: state.notification });
} else if (action === 'fetch') {
  if (!state.session?.id) throw new Error('No known FI session exists.');
  if (!state.notification?.correlationRef) {
    throw new Error('No correlated FI notification is recorded.');
  }
  if (!['PARTIAL', 'COMPLETED'].includes(state.notification.status)) {
    throw new Error('Correlated FI notification does not indicate readiness.');
  }

  const fi = await request(`/sessions/${encodeURIComponent(state.session.id)}`);
  const bankConnectionRef = optional('BANK_CONNECTION_REF') ?? `SETU-SANDBOX-${runId}`;
  const observations = normalizeTransactions(fi, bankConnectionRef);

  state.providerVerification = {
    resource: 'FI_SESSION',
    providerRef: state.session.id,
    status: text(fi.status),
    traceId: text(fi.traceId),
    confirmedAt: new Date().toISOString(),
  };
  state.observations = {
    count: observations.length,
    hash: sha256(observations),
  };
  state.stage = 'FI_PROVIDER_CONFIRMED';
  writeState(state);

  safePrint({
    ok: true,
    runId,
    stage: state.stage,
    providerVerification: state.providerVerification,
    observationCount: state.observations.count,
    observationHash: state.observations.hash,
    rawFinancialInformationPersisted: false,
  });
} else if (action === 'reconcile') {
  if (!state.observations?.hash) throw new Error('Fetch/normalization stage has not completed.');

  const expected = {
    expectationRef: required('BANK_EXPECTATION_REF'),
    amountMinor: Number(required('BANK_EXPECTED_AMOUNT_MINOR')),
    currency: optional('BANK_EXPECTED_CURRENCY') ?? 'INR',
    direction: required('BANK_EXPECTED_DIRECTION'),
    providerReference: optional('BANK_EXPECTED_PROVIDER_REFERENCE'),
  };

  if (!Number.isSafeInteger(expected.amountMinor)) {
    throw new Error('BANK_EXPECTED_AMOUNT_MINOR must be an integer.');
  }
  if (!['CREDIT', 'DEBIT'].includes(expected.direction)) {
    throw new Error('BANK_EXPECTED_DIRECTION must be CREDIT or DEBIT.');
  }

  // Re-fetch provider FI rather than persisting raw data between stages.
  const fi = await request(`/sessions/${encodeURIComponent(state.session.id)}`);
  const bankConnectionRef = optional('BANK_CONNECTION_REF') ?? `SETU-SANDBOX-${runId}`;
  const observations = normalizeTransactions(fi, bankConnectionRef);

  const requestedTxnRef = optional('BANK_PROVIDER_TRANSACTION_REF');
  let observed;

  if (requestedTxnRef) {
    observed = observations.find(
      (item) => item.providerTransactionRef === requestedTxnRef
    );
  } else {
    observed = observations.find(
      (item) =>
        item.amountMinor === expected.amountMinor &&
        item.currency === expected.currency &&
        item.direction === expected.direction
    );
  }

  const toleranceMinor = Number(optional('BANK_EXPECTED_TOLERANCE_MINOR') ?? '0');
  const result = reconcile(expected, observed, toleranceMinor);

  const receipt = {
    receiptType: 'BANK_SETTLEMENT_RECONCILED',
    version: 'BANK-CONNECTION-001/R0.7',
    provider: 'setu-aa',
    environment: 'sandbox',
    runId,
    actorRef: state.actorRef,
    merchantRef: state.merchantRef,
    wardenDecisionRef: state.wardenDecisionRef,
    consentRef: state.consent?.id,
    sessionRef: state.session?.id,
    notificationCorrelationRef: state.notification?.correlationRef,
    providerTraceId: state.providerVerification?.traceId,
    providerTransactionRef: observed?.providerTransactionRef,
    expectationRef: expected.expectationRef,
    observationSetHash: sha256(observations),
    expectationHash: sha256(expected),
    reconciliation: result,
    reconciliationHash: sha256(result),
    occurredAt: new Date().toISOString(),
    rawFinancialInformationPersisted: false,
  };

  const receiptPath = path.join(baseDir, `${runId}.receipt.json`);
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });

  state.reconciliation = {
    expectationRef: expected.expectationRef,
    outcome: result.outcome,
    receiptPath,
    receiptHash: sha256(receipt),
  };
  state.stage = 'RECONCILED';
  writeState(state);

  safePrint({
    ok: true,
    runId,
    stage: state.stage,
    outcome: result.outcome,
    receiptPath,
    receiptHash: state.reconciliation.receiptHash,
    rawFinancialInformationPersisted: false,
  });
} else if (action === 'show') {
  safePrint({
    ...state,
    statePath,
  });
} else {
  throw new Error(
    'SETU_AA_EVIDENCE_ACTION must be one of: init, attach-consent, create-session, record-notification, fetch, reconcile, show'
  );
}
