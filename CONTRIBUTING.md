# Contributor Note

This repository is the source-of-deployment for the e-commerce environment. Contributions are welcome across storefronts, commerce workflows, provider adapters, tests, observability, documentation, and developer tooling.

Before contributing, preserve these architecture boundaries:

- **GitHub is implementation and deployment lineage, not business or financial authority.**
- **Provider-native systems remain authoritative for their own state.** A bank remains authoritative for account, balance, transaction, consent, settlement, and revocation state.
- **DigitalMe identifies the actor; Warden governs purpose, scope, consent, and consequential execution; RiverOS records evidence and receipts; Synnergyze orchestrates workflows; SILK may represent economic entitlements or settlement context.**
- A provider adapter must remain replaceable. Do not make one bank, PSP, commerce provider, cloud, or protocol constitutional to the application.
- Never commit passwords, OTPs, API secrets, access/refresh tokens, private keys, signing material, full bank-account numbers, production credentials, or customer financial data.
- Use opaque provider references and masked display values wherever possible.
- Read, reconciliation, settlement-reference, and payment-initiation capabilities must remain separately scoped. Adding account connectivity does **not** automatically authorize movement of money.
- Observations must not silently become accounting, legal, tax, or professional determinations.
- Corrections must preserve prior observations and introduce explicit new state rather than rewriting history.
- Any production-affecting capability should have a clear authority path, provider receipt, verification step, and evidence trail.

For bank integrations specifically, implement against `src/lib/banking/provider.ts` rather than coupling application code directly to a bank SDK. New adapters should support explicit consent, callback verification, revocation/expiry, transaction observation where permitted, and auditable provider receipts.

Contributor attribution remains in Git history and pull-request lineage. Where a contribution materially introduces a new provider, protocol, architectural contract, or operational capability, document the contributor and source/provenance in the relevant PR and architecture note.

---

# Introduction

We appreciate any community contributions to this project, whether in the form of issues or Pull Requests.

This document outlines what we'd like you to follow in terms of commit messages and code style.

It also explains what to do in case you want to set up the project locally.

If you have any questions or concerns please reach out to us either by filing an issue in the relevant repository or posting in the [Contentful Community Slack](https://www.contentful.com/slack/).

## How Can I Contribute?

Before creating a new issue; please check out the open issues as someone might have already created one for you! Please use the recommended templates for each section as helps us resolve issues faster.

### Reporting Bugs

Bugs are tracked as [GitHub issues](https://guides.github.com/features/issues/). If you are sure there's currently not an issue that describes the bug you're experiencing, create an issue on the repository and provide the following information by filling in [the template](https://github.com/contentful/template-ecommerce-webapp-nextjs/tree/main/.github/ISSUE_TEMPLATE/bug-report.md).

> **Note:** If you find a **Closed** issue that seems like it is the same thing that you're experiencing, open a new issue and include a link to the original issue in the body of your new one.

### Proposals

Want to make an enhancement proposal, including completely new features and minor improvements to existing functionality? Please create an issue with [the proposal template](https://github.com/contentful/template-ecommerce-webapp-nextjs/tree/main/.github/ISSUE_TEMPLATE/proposal.md).

### General feedback

Not experiencing a bug or wanting to make a proposal, but still want to reach out? A lot of our colleagues are hanging out in [Contentful Community Slack](https://www.contentful.com/slack/) and might be able to help. Can't find your answer there? You can file a feedback issue through [this template](https://github.com/contentful/template-ecommerce-webapp-nextjs/tree/main/.github/ISSUE_TEMPLATE/feedback.md).

## Pull Requests

The process described here has several goals:

- Maintain the quality of the repository
- Fix problems that are important to users
- Enable a sustainable system for the maintainers from Contentful to review contributions

Please follow these steps to have your contribution considered by the maintainers:

1. Follow all instructions in [the template](https://github.com/contentful/template-ecommerce-webapp-nextjs/tree/main/.github/PULL_REQUEST_TEMPLATE.md)
2. After you submit your pull request, verify that all [status checks](https://help.github.com/articles/about-status-checks/) are passing <details><summary>What if the status checks are failing?</summary>If a status check is failing, and you believe that the failure is unrelated to your change, please leave a comment on the pull request explaining why you believe the failure is unrelated. A maintainer will re-run the status check for you. If we conclude that the failure was a false positive, then we will open an issue to track that problem with our status check suite.</details>

While the prerequisites above must be satisfied prior to having your pull request reviewed, the reviewer(s) may ask you to complete additional design work, tests, or other changes before your pull request can be ultimately accepted.
