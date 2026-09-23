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

        if (!txn) {
          throw new Error(
            'Setu FI normalization failed: transaction record is not an object.'
          );
        }

        const amountMinor = rupeesToMinor(txn.amount);
        const direction = text(txn.type)?.toUpperCase();
        const providerTransactionRef = text(txn.txnId) ?? text(txn.reference);
        const observedAt = text(txn.transactionTimestamp) ?? text(txn.valueDate);

        if (
          amountMinor === undefined ||
          !providerTransactionRef ||
          !observedAt ||
          !['CREDIT', 'DEBIT'].includes(direction)
        ) {
          throw new Error(
            'Setu FI normalization failed: transaction is missing a valid amount, reference, timestamp, or CREDIT/DEBIT direction.'
          );
        }

        observations.push({
          bankConnectionRef,
          providerTransactionRef,
          observedAt,
          bookedAt: text(txn.valueDate),
          amountMinor,
          currency: 'INR',
          direction,
          description: text(txn.narration),
        });
      }
    }
  }

  return observations.sort((a, b) => {
    const byRef = a.providerTransactionRef.localeCompare(
      b.providerTransactionRef
    );
    if (byRef !== 0) return byRef;

    const byObserved = a.observedAt.localeCompare(b.observedAt);
    if (byObserved !== 0) return byObserved;

    if (a.amountMinor !== b.amountMinor) {
      return a.amountMinor - b.amountMinor;
    }

    return a.direction.localeCompare(b.direction);
  });
}

function buildExpected() {
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

  return expected;
}

function readToleranceMinor() {
  const raw = optional('BANK_EXPECTED_TOLERANCE_MINOR') ?? '0';
  const parsed = Number(raw);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(
      'BANK_EXPECTED_TOLERANCE_MINOR must be a finite non-negative integer.'
    );
  }

  return parsed;
}

function selectObservation(observations, expected) {
  const requestedTxnRef = optional('BANK_PROVIDER_TRANSACTION_REF');

  if (requestedTxnRef) {
    return observations.find(
      (item) => item.providerTransactionRef === requestedTxnRef
    );
  }

  return observations.find(
    (item) =>
      item.amountMinor === expected.amountMinor &&
      item.currency === expected.currency &&
      item.direction === expected.direction
  );
}

function assertProviderFiReady(fi) {
  const status = text(fi?.status);
  if (!['PARTIAL', 'COMPLETED'].includes(status)) {
    throw new Error(
      `Provider FI session status is ${status ?? 'UNKNOWN'}; expected PARTIAL or COMPLETED before observation use.`
    );
  }
  return status;
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

async function requireActiveConsent() {
  const consentId = state.consent?.id;
  if (!consentId) {
    throw new Error('No known consent exists for this run.');
  }

  const consent = await request(
    `/consents/${encodeURIComponent(consentId)}`
  );
  const status = text(consent.status);

  if (!status) {
    throw new Error('Provider consent response is missing a valid status.');
  }

  state.consent = {
    ...state.consent,
    status,
    traceId: text(consent.traceId),
    observedAt: new Date().toISOString(),
  };

  if (status !== 'ACTIVE') {
    writeState(state);
    throw new Error(
      `Provider consent is ${status}; ACTIVE consent is required for FI access.`
    );
  }

  return consent;
}

if (state.environment !== 'sandbox' || state.provider !== 'setu-aa') {
  throw new Error('Run state is outside the admitted sandbox/provider boundary.');
}

if (action === 'attach-consent') {
  const consentId = required('SETU_AA_CONSENT_ID');
  const consent = await request(`/consents/${encodeURIComponent(consentId)}`);
  const consentStatus = text(consent.status);
  if (!consentStatus) {
    throw new Error('Provider consent response is missing a valid status.');
  }

  state.consent = {
    id: consent.id ?? consentId,
    status: consentStatus,
    traceId: consent.traceId,
    observedAt: new Date().toISOString(),
  };
  state.stage =
    consentStatus === 'ACTIVE' ? 'CONSENT_ACTIVE' : 'CONSENT_OBSERVED';
  writeState(state);
  safePrint({ ok: true, runId, stage: state.stage, consent: state.consent });
} else if (action === 'create-session') {
  await requireActiveConsent();

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

  await requireActiveConsent();
  const fi = await request(`/sessions/${encodeURIComponent(state.session.id)}`);
  const providerFiStatus = assertProviderFiReady(fi);
  const bankConnectionRef = optional('BANK_CONNECTION_REF') ?? `SETU-SANDBOX-${runId}`;
  const observations = normalizeTransactions(fi, bankConnectionRef);

  state.providerVerification = {
    resource: 'FI_SESSION',
    providerRef: state.session.id,
    status: providerFiStatus,
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

  const expected = buildExpected();

  // Re-check ACTIVE consent and re-fetch provider FI rather than persisting raw data.
  await requireActiveConsent();
  const fi = await request(`/sessions/${encodeURIComponent(state.session.id)}`);
  assertProviderFiReady(fi);
  const bankConnectionRef = optional('BANK_CONNECTION_REF') ?? `SETU-SANDBOX-${runId}`;
  const observations = normalizeTransactions(fi, bankConnectionRef);
  const observed = selectObservation(observations, expected);
  const toleranceMinor = readToleranceMinor();
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

  if (fs.existsSync(receiptPath)) {
    throw new Error(
      'Reconciliation receipt already exists. Corrections must create a superseding run/receipt rather than overwrite evidence.'
    );
  }

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
} else if (action === 'replay') {
  if (state.stage !== 'RECONCILED' || !state.reconciliation?.receiptPath) {
    throw new Error('Replay requires a completed reconciliation receipt.');
  }
  if (state.notification?.status !== 'COMPLETED') {
    throw new Error('Provider-backed replay requires final COMPLETED FI readiness.');
  }
  if (!fs.existsSync(state.reconciliation.receiptPath)) {
    throw new Error('Stored reconciliation receipt is unavailable.');
  }

  const prior = JSON.parse(
    fs.readFileSync(state.reconciliation.receiptPath, 'utf8')
  );
  const expected = buildExpected();

  if (sha256(expected) !== prior.expectationHash) {
    throw new Error('Replay expectation does not match the original expectation hash.');
  }

  await requireActiveConsent();
  const fi = await request(`/sessions/${encodeURIComponent(state.session.id)}`);
  assertProviderFiReady(fi);
  const bankConnectionRef = optional('BANK_CONNECTION_REF') ?? `SETU-SANDBOX-${runId}`;
  const observations = normalizeTransactions(fi, bankConnectionRef);
  const observed = selectObservation(observations, expected);
  const toleranceMinor = Number(optional('BANK_EXPECTED_TOLERANCE_MINOR') ?? '0');
  const result = reconcile(expected, observed, toleranceMinor);

  const observationSetHash = sha256(observations);
  const reconciliationHash = sha256(result);
  const deterministic =
    observationSetHash === prior.observationSetHash &&
    reconciliationHash === prior.reconciliationHash;

  if (!deterministic) {
    throw new Error(
      'Provider-backed replay changed observation or reconciliation hashes; create a superseding receipt instead of rewriting prior evidence.'
    );
  }

  state.replay = {
    deterministic: true,
    observationSetHash,
    reconciliationHash,
    replayedAt: new Date().toISOString(),
  };
  state.stage = 'REPLAY_VERIFIED';
  writeState(state);

  safePrint({
    ok: true,
    runId,
    stage: state.stage,
    deterministic: true,
    observationSetHash,
    reconciliationHash,
    rawFinancialInformationPersisted: false,
  });
} else if (action === 'show') {
  safePrint({
    ...state,
    statePath,
  });
} else {
  throw new Error(
    'SETU_AA_EVIDENCE_ACTION must be one of: init, attach-consent, create-session, record-notification, fetch, reconcile, replay, show'
  );
}
