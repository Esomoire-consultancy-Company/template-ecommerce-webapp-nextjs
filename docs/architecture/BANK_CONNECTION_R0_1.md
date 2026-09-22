# BANK-CONNECTION-001 R0.1

## Purpose

Connect an external bank account to the e-commerce environment without making GitHub, the application repository, or the commerce database the authority for bank state.

GitHub is the source-of-deployment for code and configuration contracts only.

## Authority boundaries

- **Bank / banking provider**: authoritative for account existence, balance, transactions, settlement status, consent and revocation.
- **GitHub**: source code, infrastructure contracts, tests and deployment lineage.
- **DigitalMe**: stable actor identity.
- **Warden**: purpose, consent, scope, authority and execution admission.
- **RiverOS**: evidence of consent, provider receipts, observations, reconciliation and revocation.
- **Synnergyze**: orchestrates connection, callback, ingestion and reconciliation workflows.
- **SILK**: may hold economic obligation/settlement context; it does not replace bank-native truth.

## Initial supported purposes

1. `ECOMMERCE_SETTLEMENT`
   - bind the merchant commerce environment to a provider-side settlement account reference.
   - store only opaque provider references and masked display metadata.

2. `RECONCILIATION`
   - ingest bounded account/balance/transaction observations where the provider and consent allow.
   - observations are reconciled to commerce orders, refunds, fees, payouts and ledger projections.

`PAYMENT_INITIATE` is not enabled by R0.1. It requires a distinct capability, provider implementation, user authority and Warden decision.

## Connection flow

```text
DigitalMe / Merchant
        |
        v
Bank connection request
        |
        v
Warden purpose + scope decision
        |
        v
Provider consent session
        |
        v
Bank/provider authorization surface
        |
        v
Provider callback
        |
        v
Opaque bank connection reference
        |
        +--> commerce projection
        |
        +--> River receipt
        |
        +--> reconciliation workflow
```

## Security invariants

- Never commit bank credentials, account passwords, OTPs, access tokens or refresh tokens to GitHub.
- Never store full account numbers when a provider reference or masked representation is sufficient.
- Secrets belong in the deployment secret store/provider vault.
- Provider callbacks must be verified before state is accepted.
- Revocation and expiry must be represented explicitly.
- A transaction observation is not an accounting entry.
- A bank connection does not by itself authorize a payout or payment.
- A GitHub commit does not confer financial authority.

## Canonical invariants

```text
GitHubSource != BankAuthority
BankConnection != PaymentAuthority
BankObservation != AccountingTreatment
ProviderReceipt != WardenDecision
WardenDecision != ProviderExecution
RiverEvidence != BankNativeTruth
```

## Runtime configuration

See `.env.example` for non-secret configuration names. Real secret values must be supplied through the runtime/deployment secret store.

## Next provider step

Implement one provider adapter behind `BankConnectionProvider`. The adapter must support:
- consent/session creation,
- callback exchange,
- opaque account reference projection,
- transaction observations for reconciliation where permitted,
- explicit revocation,
- provider receipt capture.

Provider selection is intentionally outside R0.1 so the application does not hard-code one bank or payment network.
