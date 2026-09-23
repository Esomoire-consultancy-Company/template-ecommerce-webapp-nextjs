# BANK-CONNECTION-001 R0.2 — India Banking Profile

## Status

Design/runtime contract for India. Production bank access remains disabled until a real provider, regulatory basis, consent flow, secret store, callback verification and Warden admission are configured.

## Why this profile exists

The ecommerce environment needs two different banking functions:

1. **Settlement reconciliation** — identify whether orders, refunds, provider payouts, fees and chargebacks have actually appeared at the bank/provider layer.
2. **Optional consented account-data access** — where the legal/regulatory participant model permits it.

These are not the same thing as payment initiation.

## India rail model

```text
Ecommerce runtime
     |
     +-- PAYMENT_PROVIDER_SETTLEMENT
     |      provider payout/refund/fee webhooks
     |
     +-- BANK_DIRECT
     |      bank-supported merchant/account APIs
     |
     +-- AA_FIU
     |      consented financial-information access
     |      only where FIU eligibility is verified
     |
     +-- TSP_MEDIATED
            technical service provider implementation
            does not itself create regulatory eligibility
```

## Account Aggregator boundary

The RBI Account Aggregator framework is a consented financial-information sharing framework. The current ecosystem uses ReBIT technical standards and asynchronous consent/FI data flows.

For this repository:

- AA is a **read/reconciliation data rail**.
- AA is **not** the payment-initiation rail.
- The customer consent journey belongs to the AA/authorized AA client.
- The application stores only the minimum provider references and consent projections needed for orchestration and evidence.
- Revoked/expired consent blocks further fetches.
- Provider callbacks and consent artefacts must be verified before use.
- Financial information fetched under consent must be bounded to the approved purpose, scope, frequency and data-life conditions.

## Eligibility gate

Sahamati states that participants acting as FIPs/FIUs are currently entities registered and regulated by RBI, SEBI, IRDAI or PFRDA.

Therefore the ecommerce company must **not** self-declare itself an FIU merely because it can implement the APIs.

Production rule:

```text
AA_FIU access
  = verified regulated-entity eligibility
  + participant onboarding/certification
  + valid consent
  + Warden admission
  + provider execution
  + River evidence
```

A TSP can supply technology, but does not by itself confer FIU eligibility on an otherwise ineligible entity.

Where this eligibility does not exist, prefer a bank-direct merchant API or payment-provider settlement feed for ecommerce reconciliation.

## Consent lifecycle

```text
REQUESTED
  -> PENDING_CUSTOMER_ACTION
  -> ACTIVE
  -> PAUSED / REVOKED / EXPIRED

or

REQUESTED
  -> REJECTED / ERROR
```

Consent projection must carry:

- provider consent reference,
- AA/FIU identifiers where applicable,
- purpose code,
- validity window,
- data-life constraint,
- consent artefact hash/reference,
- Warden decision reference,
- River receipt reference.

The signed consent artefact remains provider/ecosystem-native truth.

## FI data flow

```text
Valid consent
   |
   v
FI request
   |
   v
provider session reference
   |
   v
asynchronous data-ready notification
   |
   v
FI fetch
   |
   v
normalized bank observations
   |
   v
settlement reconciliation
   |
   +--> MATCH
   +--> MATCH_WITH_TOLERANCE
   +--> AMOUNT_DIFFERENCE
   +--> DIRECTION_DIFFERENCE
   +--> CURRENCY_DIFFERENCE
   +--> REFERENCE_MISMATCH
   +--> NO_MATCH
   |
   v
River receipt
```

A reconciliation result is not an accounting entry and does not silently determine tax, accounting or legal treatment.

## Warden capability split

Recommended capabilities:

- `BANK_CONNECTION_REQUEST`
- `BANK_ACCOUNT_METADATA_READ`
- `BANK_BALANCE_READ`
- `BANK_TRANSACTION_READ`
- `BANK_SETTLEMENT_RECONCILE`
- `BANK_CONSENT_REVOKE`
- `BANK_PROVIDER_WEBHOOK_ACCEPT`

Explicitly separate:

- `BANK_PAYMENT_INITIATE`
- `BANK_PAYOUT_INITIATE`
- `BANK_BENEFICIARY_CREATE`

The latter three are outside R0.2.

## River receipts

At minimum preserve:

- actor/DigitalMe ref,
- merchant/entity ref,
- Warden decision ref,
- consent/provider reference,
- purpose/scope,
- provider request/session reference,
- provider callback/notification receipt,
- normalized observation hash,
- reconciliation input/output,
- revocation/expiry,
- supersession lineage.

Never write provider access tokens, OTPs or bank credentials to River.

## Source references

- RBI: Master Direction - Non-Banking Financial Company - Account Aggregator (Reserve Bank) Directions, 2016.
- ReBIT/Sahamati: NBFC-AA API Specification v2.0.0.
- Sahamati: Account Aggregator key resources, participation/certification and onboarding guidance.

These sources define the external framework. This repository remains a provider-neutral implementation surface and must track future revisions rather than embedding one provider as constitutional architecture.
