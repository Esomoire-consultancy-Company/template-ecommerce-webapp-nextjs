# BANK-CONNECTION-001 R0.7 — Provider-backed Evidence Run

## Purpose

R0.7 is the first resumable execution harness for a real Setu AA sandbox evidence chain.

It is designed for ALPHA-NODE-001 and deliberately persists **only execution metadata, provider references, hashes and reconciliation receipts**.

It does not persist:

- Setu access tokens or client secrets;
- VUA values;
- raw FI payloads;
- Profile/KYC data;
- OTPs;
- bank credentials.

## Local evidence workspace

Runtime state is stored under:

```text
.local/banking/
```

This path is ignored by Git.

Each run creates:

```text
.local/banking/<BANK_RUN_ID>.json
.local/banking/<BANK_RUN_ID>.receipt.json   # after reconciliation
```

The state file may contain consent/session IDs, statuses, trace references, Warden/DigitalMe/merchant refs, observation hashes and reconciliation metadata.

## State machine

```text
INITIALIZED
  |
  v
CONSENT_OBSERVED / CONSENT_ACTIVE
  |
  v
FI_SESSION_CREATED
  |
  v
FI_NOTIFICATION_CORRELATED
  |
  v
FI_PROVIDER_CONFIRMED
  |
  v
RECONCILED
```

The notification step is correlation only. Provider trust is upgraded by the subsequent authoritative Setu API read.

## Commands

Initialize:

```bash
SETU_AA_EVIDENCE_ACTION=init yarn bank:setu:evidence
```

Attach and re-read a consent already created through the sandbox consent flow:

```bash
SETU_AA_EVIDENCE_ACTION=attach-consent yarn bank:setu:evidence
```

Create a session only after provider-confirmed ACTIVE consent:

```bash
SETU_AA_EVIDENCE_ACTION=create-session yarn bank:setu:evidence
```

Record a correlated FI readiness notification:

```bash
SETU_AA_EVIDENCE_ACTION=record-notification yarn bank:setu:evidence
```

Fetch and normalize in memory:

```bash
SETU_AA_EVIDENCE_ACTION=fetch yarn bank:setu:evidence
```

Reconcile against one explicitly supplied commerce expectation:

```bash
SETU_AA_EVIDENCE_ACTION=reconcile yarn bank:setu:evidence
```

Inspect the secret-free local run state:

```bash
SETU_AA_EVIDENCE_ACTION=show yarn bank:setu:evidence
```

## Reconciliation input

The reconciliation stage accepts only an explicit expected settlement and optionally a chosen provider transaction reference.

Required:

- `BANK_EXPECTATION_REF`
- `BANK_EXPECTED_AMOUNT_MINOR`
- `BANK_EXPECTED_DIRECTION=CREDIT|DEBIT`

Optional:

- `BANK_EXPECTED_CURRENCY` (defaults to INR)
- `BANK_EXPECTED_PROVIDER_REFERENCE`
- `BANK_EXPECTED_TOLERANCE_MINOR`
- `BANK_PROVIDER_TRANSACTION_REF`

If no provider transaction ref is supplied, the runner selects the first observation matching amount, currency and direction.

## River handoff

The generated receipt is a local **River handoff candidate**, not a claim that River has already durably stored it.

A later River writer may ingest the receipt after:

1. validating its Warden decision lineage;
2. confirming the provider/session refs;
3. recomputing relevant hashes;
4. assigning the durable River receipt identity.

## Acceptance rule

R0.7 becomes provider-backed PASS only when a single run reaches `RECONCILED` using:

- sandbox credentials injected outside Git;
- a real sandbox consent;
- provider-confirmed ACTIVE consent;
- a Setu sandbox FI session;
- correlated FI readiness;
- successful provider FI fetch;
- privacy-minimizing normalization;
- deterministic reconciliation;
- a generated local River handoff receipt;
- replay producing the same reconciliation hash.

Until then the repository is source-ready and the provider execution remains pending.
