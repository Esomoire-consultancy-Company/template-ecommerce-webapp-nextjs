import process from 'node:process';

const required = [
  'SETU_AA_ENVIRONMENT',
  'SETU_AA_PRODUCT_INSTANCE_ID',
  'SETU_AA_ACCESS_TOKEN',
  'SETU_AA_TEST_VUA',
  'WARDEN_DECISION_REF',
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

for (const name of required) requireEnv(name);

if (process.env.SETU_AA_ENVIRONMENT !== 'sandbox') {
  throw new Error(
    'Sandbox smoke runner refuses any environment other than SETU_AA_ENVIRONMENT=sandbox'
  );
}

if (process.env.BANK_PAYMENT_INITIATE === 'true') {
  throw new Error('Payment initiation is structurally disabled for this smoke run.');
}

const baseUrl = 'https://fiu-sandbox.setu.co';
const productInstanceId = requireEnv('SETU_AA_PRODUCT_INSTANCE_ID');
const accessToken = requireEnv('SETU_AA_ACCESS_TOKEN');
const vua = requireEnv('SETU_AA_TEST_VUA');
const wardenDecisionRef = requireEnv('WARDEN_DECISION_REF');

const now = new Date();
const dataTo = new Date(now.getTime() - 60 * 1000);
const dataFrom = new Date(dataTo.getTime() - 30 * 24 * 60 * 60 * 1000);

const payload = {
  consentDuration: {
    unit: 'DAY',
    value: '1',
  },
  vua,
  dataRange: {
    from: dataFrom.toISOString(),
    to: dataTo.toISOString(),
  },
  context: [],
  additionalParams: {
    tags: ['VSR_R0_4_SANDBOX'],
  },
};

const response = await fetch(`${baseUrl}/consents`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    'x-product-instance-id': productInstanceId,
  },
  body: JSON.stringify(payload),
});

const body = await response.json().catch(() => ({}));

if (!response.ok) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        stage: 'CONSENT_CREATE',
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

if (!body.id || !body.status) {
  throw new Error('Setu sandbox consent response is missing id/status.');
}

const maskedVua =
  vua.length <= 4 ? '****' : `${'*'.repeat(Math.max(4, vua.length - 4))}${vua.slice(-4)}`;

console.log(
  JSON.stringify(
    {
      ok: true,
      environment: 'sandbox',
      provider: 'setu-aa',
      stage: 'CONSENT_CREATED',
      consentRequestId: body.id,
      status: body.status,
      redirectUrl: body.url,
      traceId: body.traceId ?? body.txnid,
      testVua: maskedVua,
      wardenDecisionRef,
      next:
        'Complete consent approval in the provider sandbox, then query status before creating an FI session.',
    },
    null,
    2
  )
);
