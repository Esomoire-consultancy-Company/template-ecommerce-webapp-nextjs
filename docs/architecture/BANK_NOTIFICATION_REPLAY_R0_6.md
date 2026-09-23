# BANK-CONNECTION-001 R0.6 — Notification Verification & Replay

## Decision

Setu's current Account Aggregator notification documentation specifies consent and FI webhook payloads, but does not document a cryptographic AA webhook signature verification scheme.

Other Setu product families may document signed webhooks; those rules must not be transplanted into AA without provider documentation.

Therefore R0.6 uses:

```text
notification received
      |
      v
schema parse
      |
      v
known consent/session correlation
      |
      v
CORRELATED, NOT AUTHENTICATED
      |
      v
provider API re-verification
      |
      +--> consent GET confirms state
      |
      +--> FI GET confirms/fetches provider data
      |
      v
PROVIDER_CONFIRMED
      |
      v
River receipt
```

A raw or merely correlated webhook never becomes `VERIFIED`.

## Consent notifications

For consent updates:

1. parse the notification;
2. ensure its consent reference matches the runtime's known consent;
3. query `GET /consents/:id`;
4. compare claimed webhook status with provider API status;
5. only matching provider state may be recorded as provider-confirmed evidence.

## FI notifications

Setu documents FI notifications with combined session states such as `PARTIAL` and `COMPLETED`.

R0.6 treats those notifications as readiness hints tied to a known session. Provider confirmation occurs when the runtime successfully calls `GET /sessions/:id`.

This removes the earlier circular assumption that a notification had to be independently cryptographically verified before FI fetch when the AA provider does not publish such a verification mechanism.

The fetch still requires:

- a known session created by this runtime;
- an active Warden decision;
- correlated notification readiness of PARTIAL or COMPLETED, or an explicitly approved polling workflow;
- sandbox environment in R0.6.

## Privacy

Provider FI data is handled in-memory, then normalized. Profile/KYC material is not copied into commerce reconciliation state.

## Replay

R0.6 introduces canonical SHA-256 checkpoints over:

1. provider source input;
2. normalized observations;
3. reconciliation output.

Re-running the same evidence through the same normalization/reconciliation version must reproduce the same hashes.

```text
same source evidence
      +
same normalizer version
      +
same reconciliation rules
      =
same replay hashes
```

A changed result must be represented as a new version/superseding receipt rather than silently rewriting earlier evidence.

## Production boundary

R0.6 does not:

- certify FIU eligibility;
- provision Setu production credentials;
- authorize a real customer bank account;
- authorize payments, payouts or beneficiary creation.

Production remains a separate promotion decision.
