import process from 'node:process';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const environment = required('SETU_AA_ENVIRONMENT');
if (environment !== 'sandbox') {
  throw new Error('Lifecycle runner is sandbox-only.');
}

const action = required('SETU_AA_ACTION');
const productInstanceId = required('SETU_AA_PRODUCT_INSTANCE_ID');
const accessToken = required('SETU_AA_ACCESS_TOKEN');
const wardenDecisionRef = required('WARDEN_DECISION_REF');
const baseUrl = 'https://fiu-sandbox.setu.co';

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
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
    console.error(
      JSON.stringify(
        {
          ok: false,
          action,
          status: response.status,
          errorCode: body.errorCode,
          errorMsg: body.errorMsg,
          traceId: body.traceId ?? body.txnid,
          wardenDecisionRef,
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  return body;
}

if (action === 'status') {
  const consentId = required('SETU_AA_CONSENT_ID');
  const consent = await request(`/consents/${encodeURIComponent(consentId)}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        action,
        consentId: consent.id,
        status: consent.status,
        traceId: consent.traceId,
        wardenDecisionRef,
      },
      null,
      2
    )
  );
} else if (action === 'session') {
  const consentId = required('SETU_AA_CONSENT_ID');
  const consent = await request(`/consents/${encodeURIComponent(consentId)}`);

  if (consent.status !== 'ACTIVE') {
    throw new Error(
      `FI session creation refused: consent status is ${consent.status}, expected ACTIVE.`
    );
  }

  const from = required('SETU_AA_DATA_FROM');
  const to = required('SETU_AA_DATA_TO');

  const session = await request('/sessions', {
    method: 'POST',
    body: JSON.stringify({
      consentId,
      dataRange: { from, to },
      format: 'json',
    }),
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        action,
        consentId,
        sessionId: session.id,
        status: session.status,
        traceId: session.traceId,
        wardenDecisionRef,
        next:
          'Wait for a correlated FI notification with PARTIAL or COMPLETED status; the subsequent provider GET is the trust upgrade.',
      },
      null,
      2
    )
  );
} else if (action === 'fetch') {
  const sessionId = required('SETU_AA_SESSION_ID');
  const notificationStatus = required('SETU_AA_FI_READY_STATUS');
  const notificationCorrelationRef = required(
    'SETU_AA_NOTIFICATION_CORRELATION_REF'
  );

  if (!['PARTIAL', 'COMPLETED'].includes(notificationStatus)) {
    throw new Error(
      'FI fetch refused: correlated notification status must be PARTIAL or COMPLETED.'
    );
  }

  const fi = await request(`/sessions/${encodeURIComponent(sessionId)}`);

  const fipCount = Array.isArray(fi.fips) ? fi.fips.length : 0;
  const accountCount = Array.isArray(fi.fips)
    ? fi.fips.reduce(
        (sum, fip) => sum + (Array.isArray(fip?.accounts) ? fip.accounts.length : 0),
        0
      )
    : 0;

  console.log(
    JSON.stringify(
      {
        ok: true,
        action,
        sessionId,
        status: fi.status,
        fipCount,
        accountCount,
        traceId: fi.traceId,
        notificationCorrelationRef,
        wardenDecisionRef,
        rawFinancialInformationLogged: false,
        next:
          'Pass the in-memory FI response through the privacy-minimizing normalizer and River writer; do not log Profile/KYC data.',
      },
      null,
      2
    )
  );
} else {
  throw new Error(
    'SETU_AA_ACTION must be one of: status, session, fetch'
  );
}
