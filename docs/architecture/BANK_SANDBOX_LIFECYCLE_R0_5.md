# BANK-CONNECTION-001 R0.5 — Provider Sandbox Lifecycle

## Objective

Extend the accepted R0.4 synthetic harness into a controlled provider-sandbox lifecycle while preserving the rule that sandbox capability does not imply production or payment authority.

## Verified external sequence

Current Setu AA documentation defines:

1. create consent;
2. redirect user to approve/reject;
3. read consent status with `GET /consents/:id`;
4. only after consent is active, create a data session with `POST /sessions`;
5. receive FI notifications;
6. fetch FI data with `GET /sessions/:id` when the combined session status is `PARTIAL` or `COMPLETED`.

## Alpha commands

Consent creation:

```bash
yarn bank:setu:sandbox-smoke
```

Consent status:

```bash
SETU_AA_ACTION=status yarn bank:setu:sandbox-lifecycle
```

Create FI session after ACTIVE consent:

```bash
SETU_AA_ACTION=session yarn bank:setu:sandbox-lifecycle
```

Fetch FI data only after a verified provider notification:

```bash
SETU_AA_ACTION=fetch yarn bank:setu:sandbox-lifecycle
```

The fetch action requires both:

- `SETU_AA_FI_READY_STATUS=PARTIAL|COMPLETED`
- `SETU_AA_VERIFIED_NOTIFICATION_RECEIPT=<River/provider verification ref>`

This deliberately prevents the runtime from treating an unverified webhook, UI message or manually assumed readiness as sufficient authority to fetch data.

## Privacy boundary

Setu FI payloads can contain Profile, Summary and Transactions. The ecommerce reconciliation layer does not need full Profile/KYC material.

`normalizeSetuDepositTransactions` therefore extracts only:

- provider transaction reference;
- observed/booked timestamp;
- amount;
- currency;
- CREDIT/DEBIT direction;
- narration where present.

It intentionally ignores names, PAN, DOB, mobile, email, address, nominee and other Profile fields.

## River boundary

The runtime compiles a secret-free `BankExecutionReceiptDraft`. Durable storage remains River's responsibility.

The envelope can carry:

- actor and merchant refs;
- Warden decision ref;
- consent/session/provider request refs;
- verified notification receipt ref;
- observation count;
- reconciliation ref;
- source hash;
- supersession lineage.

It must never carry provider access tokens, client secrets, OTPs or raw bank credentials.

## R0.5 acceptance

R0.5 sandbox execution is accepted only when all of the following are observed:

```text
latest repository CI green
+ Setu sandbox credential injection outside Git
+ sandbox consent request created
+ consent ACTIVE
+ FI session created
+ FI notification verified
+ FI fetch PARTIAL or COMPLETED
+ privacy-minimizing normalization
+ deterministic settlement reconciliation
+ River provider receipt
+ replay produces same reconciliation result
```

Until then, R0.5 remains SOURCE-READY / EXECUTION-PENDING.
