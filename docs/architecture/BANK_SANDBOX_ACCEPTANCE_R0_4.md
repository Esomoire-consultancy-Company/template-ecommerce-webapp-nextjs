# BANK-CONNECTION-001 R0.4 — Acceptance Receipt

## Result

**PASS — synthetic/offline sandbox contract**

Accepted commit:

`e3dc0aed7b90dfde0da03aebeee54c2ec9ea0e49`

GitHub Actions evidence:

- Bank Sandbox R0.4 — run `35770494390` — **success**
- ESLint & TSC — run `35770494192` — **success**
- CodeQL Scan for GitHub Actions Workflows — run `35770494239` — **success**

## What this PASS proves

- banking TypeScript contracts compile;
- synthetic settlement reconciliation vectors pass deterministically;
- the dedicated banking CI gate executes successfully;
- the repository's existing ESLint/TSC gate passes;
- the GitHub Actions workflow is accepted by CodeQL;
- money-movement capabilities remain structurally unavailable in the R0.4 Warden matrix;
- production banking operations remain blocked;
- the Setu adapter paths are aligned to the current documented consent and FI-session split.

## What this PASS does NOT prove

- Setu Bridge onboarding;
- possession or validity of Setu sandbox credentials;
- a real Setu sandbox consent creation;
- approval/rejection through the consent UI;
- provider notification authenticity;
- FI data readiness/fetch from the Setu sandbox;
- normalization of a provider FI payload;
- a live bank account connection;
- FIU eligibility, certification or production onboarding;
- payment or payout initiation.

## External provider gate

Current Setu documentation requires a configured FIU product on Bridge and exposes sandbox credentials after configuration. A Setu AA consent is created with `POST /consents`, becomes usable for FI data after approval/ACTIVE state, and FI data sessions are created with `POST /sessions`.

The next execution gate is therefore credentialed sandbox execution, not production promotion.

## Promotion state

```text
R0.4 synthetic acceptance           PASS
Setu sandbox credentials            REQUIRED
Setu sandbox consent create         PENDING
Consent approval/status             PENDING
Notification verification           PENDING
FI session                           PENDING
FI fetch                             PENDING
Normalization                       PENDING
Settlement reconciliation           PENDING
River provider receipt              PENDING
R0.5 production-readiness review    BLOCKED
```
