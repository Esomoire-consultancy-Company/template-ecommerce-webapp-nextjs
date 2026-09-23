# BANK-CONNECTION-001 R0.8 — River Ingestion Adapter

## Purpose

Convert a provider-backed, replay-verified R0.7 banking reconciliation receipt into the canonical RiverOS event contract without making RiverOS the bank-native source of truth.

## Canonical River target

The existing RiverOS repository defines `riveros.events` as the append-only event ledger. New implementations should write to `riveros.events`; corrections/reversals/supersession are represented as new related events rather than mutation.

The banking adapter therefore targets the existing event contract instead of creating a parallel banking evidence database.

## Admission sequence

```text
R0.7 local handoff candidate
       |
       v
receipt structure validation
       |
       v
Warden decision ref present
       |
       v
provider/session/consent lineage present
       |
       v
reconciliation hash recomputed
       |
       v
R0.7 replay hashes compared
       |
       v
REPLAY_VERIFIED
       |
       v
compile RiverOS event candidate
       |
       v
canonical River writer
       |
       v
riveros.events
       |
       v
River event/receipt reference
```

## River event mapping

The compiled event uses:

- `event_type = BANK_SETTLEMENT_RECONCILED`
- `event_version = 0.2`
- `action = RECONCILE_BANK_SETTLEMENT`
- `source_system = setu-aa`
- `source_environment = sandbox`
- `source_event_ref = bank:<runId>:<reconciliationHash>`
- same value as the idempotency key;
- `object_type = bank_settlement_reconciliation`
- `object_id = expectationRef`
- Warden decision in `authority_basis`;
- consent reference/correlation in `consent_context`;
- reconciliation result/hashes in `new_state`;
- provider/session/run references in metadata;
- `lifecycle_status = VERIFIED`.

## Settlement boundary

The event explicitly sets:

```text
commercial_relevance = true
settlement_eligibility = not_applicable
```

This is intentional.

A bank reconciliation result can be economically relevant, but it does not itself:

- instruct a payment;
- authorize a payout;
- create a beneficiary;
- prove legal finality;
- create an accounting journal;
- declare a SILK obligation satisfied.

A later governed process may use River evidence when assessing any of those outcomes.

## Idempotency

The canonical source reference is:

```text
bank:<BANK_RUN_ID>:<reconciliationHash>
```

The current River schema enforces unique source refs/idempotency keys within workspace + source-system scope.

Repeated delivery of the same evidence should therefore converge rather than generate duplicate facts.

## Hash boundary

R0.8 recomputes:

- reconciliation hash;
- replay observation-set match;
- replay reconciliation match;
- River event hash.

If any source/replay hash does not match, ingestion fails closed.

## Durable writer

`RiverEventWriter` is the application-side port.

The default implementation is disabled.

Compiling or validating an event candidate does **not** mean River has durably ingested it. A real implementation must bind to the canonical RiverOS service/database and return the resulting River event/receipt identity after durable append.

## Local validation

Run:

```bash
yarn bank:river:validate
```

Required:

- a local R0.7 run in `REPLAY_VERIFIED`;
- its local reconciliation receipt;
- `RIVER_WORKSPACE_ID`.

The validator creates only:

```text
.local/banking/<BANK_RUN_ID>.river-event.json
```

This is still a local candidate and is ignored by Git.

## External truth

```text
Bank / Setu              provider-native financial truth
Warden                   authority/purpose
RiverOS                  canonical evidence chronology
SILK                     governed economic/settlement state
Commerce application     operational projection
GitHub                   source/deployment lineage
```

River evidence may prove what was observed and how it was reconciled. It does not replace the originating bank/provider record.
