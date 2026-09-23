# BANK-CONNECTION-001 R0.9 — River External Evidence Ingress Binding

## Purpose

Bind the ecommerce banking runtime to the canonical River external-evidence service contract without granting the ecommerce application direct database write access.

Canonical River contract:

`RIVER-EXTERNAL-EVIDENCE-INGRESS-001 / 0.1`

River foundation source branch:

`river-external-evidence-ingress-r0-1`

River foundation PR:

`virtual-silk-road-platform#175`

The River contract is source-defined but not deployed.

## Binding

`ExternalIngressRiverEventWriter` implements the ecommerce `RiverEventWriter` port by submitting:

```text
contract_id      RIVER-EXTERNAL-EVIDENCE-INGRESS-001
contract_version 0.1
event            <R0.8 canonical River event candidate>
```

The transport is intentionally unspecified. The ingress may later be implemented through a controlled service/RPC without changing the banking domain contract.

## Success requirements

The ecommerce writer accepts a successful ingest only if the response includes:

- canonical River event reference;
- canonical River receipt reference;
- workspace ID;
- source system;
- source event reference;
- event hash;
- recorded timestamp.

It then verifies that:

```text
response.workspace_id      == submitted.workspace_id
response.source_system     == submitted.source_system
response.source_event_ref  == submitted.source_event_ref
response.event_hash        == submitted.event_hash
```

A mismatch fails closed.

## Idempotent replay

A successful response may state:

`idempotent_replay = true`

That means the ingress converged on the already-durable canonical River event/receipt for the same source identity and hash.

It does not create a second fact.

## Failure semantics

The commerce writer recognizes bounded ingress failures such as:

- `SOURCE_NOT_ADMITTED`
- `ENVIRONMENT_NOT_ADMITTED`
- `ROUTE_NOT_FOUND`
- `AUTHORITY_REQUIRED`
- `HASH_MISMATCH`
- `IDEMPOTENCY_CONFLICT`
- `PROHIBITED_PAYLOAD`
- `SEMANTIC_SCOPE_VIOLATION`
- `INGEST_FAILED`

No failure is translated into a payment, settlement, accounting or fraud conclusion.

## Security boundary

The ecommerce application does not receive:

- INSERT/UPDATE/DELETE privileges on canonical River tables;
- a generic River service-role database credential;
- Warden authority by virtue of calling the ingress;
- permission to alter prior River history.

The ingress is responsible for canonical validation and durable append.

## Current state

```text
R0.8 canonical event compiler     PASS
R0.8 offline River contract       PASS
R0.9 ingress contract binding     SOURCE READY
River ingress service deployment  PENDING
Actual durable bank River receipt PENDING
Production banking                BLOCKED
Money movement                    BLOCKED
```

A real `RiverExternalEvidenceIngressPort` implementation must not be configured until the River-side contract is reviewed, implemented and deployed under its own evidence/authority gate.
