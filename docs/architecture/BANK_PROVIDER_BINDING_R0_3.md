# BANK-CONNECTION-001 R0.3 — Provider Binding

## Selected first sandbox rail

**Setu AA Gateway sandbox** is the first concrete provider binding for development.

This choice is an implementation adapter, not an architectural dependency. Setu remains replaceable behind the provider-neutral interfaces already defined in R0.1/R0.2.

## Why this provider is suitable for the sandbox

Current Setu AA documentation exposes:

- sandbox base URL `https://fiu-sandbox.setu.co`,
- production base URL `https://fiu.setu.co`,
- consent creation/status/revocation flows,
- financial-information data sessions and fetch,
- notification/webhook-driven state changes,
- product-instance scoping,
- multi-AA routing.

The repository must not assume production eligibility merely because sandbox APIs are technically reachable.

## Runtime boundary

```text
Storefront / merchant workflow
        |
        v
BankConnectionProvider
        |
        v
IndiaAaProvider
        |
        v
SetuAaClient
        |
        v
Setu AA Gateway
        |
        v
licensed AA / FIP network
```

## Authentication boundary

The source tree may contain only configuration keys/names.

Actual credentials belong in the runtime secret store:

- client identifier,
- client secret,
- product instance identifier where treated as sensitive by deployment policy,
- access token,
- webhook verification secret/material,
- any provider signing material.

The `SetuAaClient` receives an already-obtained access token from the runtime auth/secret layer. Token acquisition is intentionally not hard-coded until the exact provider onboarding contract is provisioned.

## Warden gates

Sandbox capabilities:

- `BANK_CONNECTION_REQUEST`
- `BANK_ACCOUNT_METADATA_READ`
- `BANK_TRANSACTION_READ`
- `BANK_SETTLEMENT_RECONCILE`
- `BANK_CONSENT_REVOKE`

Production requires an additional explicit environment gate:

- `BANK_PROVIDER_PRODUCTION_ENABLE`

Not enabled:

- `BANK_PAYMENT_INITIATE`
- `BANK_PAYOUT_INITIATE`
- `BANK_BENEFICIARY_CREATE`

## Promotion rule

```text
sandbox configured
  -> consent flow verified
  -> webhook/notification verification
  -> mock FI fetch
  -> deterministic reconciliation
  -> River evidence
  -> participant eligibility verified
  -> provider production onboarding/certification
  -> Warden production admission
  -> production enablement
```

## Acceptance criteria

R0.3 passes when:

1. no financial credential is present in Git history;
2. sandbox provider selection is explicit;
3. consent create/status/revoke are reachable through the adapter;
4. a data session can be represented and fetched through the provider contract;
5. provider observations feed the reconciliation matcher;
6. a failed/expired/revoked consent cannot fetch data;
7. payment initiation remains structurally unavailable;
8. production cannot be enabled by changing only a UI flag;
9. every consequential provider call can be paired with Warden and River references.


## Current external references

Re-verify these before changing provider behavior or promoting to production:

- Setu AA Gateway quickstart: https://docs.setu.co/data/account-aggregator/quickstart
- Setu AA consent flow and revocation: https://docs.setu.co/data/account-aggregator/api-integration/consent-flow
- Setu AA account-availability/authentication reference: https://docs.setu.co/data/account-aggregator/api-integration/account-availability-apis

At the time of R0.3 materialization, Setu documents the AA sandbox at `https://fiu-sandbox.setu.co`, production at `https://fiu.setu.co`, Bearer access-token authorization for AA calls, and `x-product-instance-id` scoping. Setu's quickstart also exposes FIU product credentials through its Bridge workflow. These are provider details, not VSR constitutional rules.
