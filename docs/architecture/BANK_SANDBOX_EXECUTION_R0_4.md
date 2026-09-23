# BANK-CONNECTION-001 R0.4 — Sandbox Execution Harness

## Purpose

Prove the ecommerce → consented banking observation → settlement reconciliation path without production credentials, live customer financial data, or money movement.

R0.4 is deliberately offline-first. The default acceptance harness runs only synthetic fixtures. Provider sandbox calls may be added after credentials are injected through an approved runtime secret store.

## Harness topology

```text
Synthetic commerce settlement
        |
        v
Settlement expectation
        |
        +---------------------+
        |                     |
        v                     v
Synthetic bank           Provider sandbox
observation              (optional later)
        |                     |
        +----------+----------+
                   v
          normalization boundary
                   |
                   v
       deterministic reconciliation
                   |
                   v
              River envelope
                   |
                   v
           acceptance result
```

## Current executable acceptance check

Run:

```bash
yarn bank:sandbox:verify
```

The script:

1. refuses a fixture unless `synthetic=true`;
2. evaluates exact matches;
3. evaluates configured amount tolerances;
4. detects amount and direction differences;
5. detects missing observations;
6. exits non-zero on any unexpected result.

No network request is made by this script.

## Notification verification

Provider notifications are represented by `ProviderNotificationEnvelope`.

The default verifier rejects every notification. A provider-specific verifier may return `VERIFIED` only after implementing the provider's current documented verification mechanism.

This prevents a webhook body from becoming accepted bank state merely because it reached an HTTP endpoint.

```text
HTTP receipt != verified provider notification
verified provider notification != accounting treatment
```

## Warden sandbox matrix

R0.4 may admit, when an unexpired Warden decision explicitly allows the requested capability:

- `BANK_CONNECTION_REQUEST`
- `BANK_ACCOUNT_METADATA_READ`
- `BANK_BALANCE_READ`
- `BANK_TRANSACTION_READ`
- `BANK_SETTLEMENT_RECONCILE`
- `BANK_CONSENT_REVOKE`
- `BANK_PROVIDER_NOTIFICATION_ACCEPT`

R0.4 structurally denies:

- `BANK_PAYMENT_INITIATE`
- `BANK_PAYOUT_INITIATE`
- `BANK_BENEFICIARY_CREATE`

R0.4 also refuses production banking operations. `BANK_PROVIDER_PRODUCTION_ENABLE` is reserved for a later production-promotion contract and is not self-authorizing.

## Synthetic test vectors

Fixture:

`fixtures/banking/r0.4-reconciliation-vectors.json`

Initial cases:

- exact settlement match;
- match within configured tolerance;
- amount mismatch;
- debit/credit direction mismatch;
- no bank observation.

Additional provider sandbox fixtures must remain clearly marked synthetic unless generated from an explicitly approved test account and then handled under the applicable data-retention/evidence policy.

## River execution envelope

A future execution adapter should emit or reserve evidence for:

- DigitalMe/actor reference;
- merchant/entity reference;
- Warden decision reference;
- provider and environment;
- consent reference;
- FI/session reference where applicable;
- provider notification verification result;
- source observation hash;
- settlement expectation hash;
- reconciliation result;
- runtime/compiler version;
- observed timestamp;
- supersession/retry lineage.

Secrets, OTPs, access tokens, refresh tokens and raw bank credentials are excluded.

## Failure behavior

The harness fails closed when:

- Warden outcome is DENY;
- authority is expired;
- a money-movement capability is requested;
- a production operation is requested;
- a provider notification is unverified;
- consent is revoked/expired before fetch;
- a provider observation cannot be normalized;
- reconciliation output differs from its expected deterministic test vector.

## Promotion gate

```text
R0.4 synthetic harness PASS
   -> provider sandbox credentials injected outside Git
   -> sandbox consent lifecycle
   -> notification verification implementation
   -> sandbox FI fetch
   -> normalization
   -> reconciliation
   -> River receipt
   -> replay/determinism check
   -> R0.5 production-readiness review
```

R0.4 completion does not authorize a live bank account.
