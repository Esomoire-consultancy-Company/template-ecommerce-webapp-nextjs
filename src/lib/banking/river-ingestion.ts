import { canonicalSha256 } from './replay';

export interface BankSettlementRiverHandoff {
  receiptType: 'BANK_SETTLEMENT_RECONCILED';
  version: 'BANK-CONNECTION-001/R0.7';
  provider: 'setu-aa';
  environment: 'sandbox';
  runId: string;
  actorRef: string;
  merchantRef: string;
  wardenDecisionRef: string;
  consentRef?: string;
  sessionRef?: string;
  notificationCorrelationRef?: string;
  providerTraceId?: string;
  providerTransactionRef?: string;
  expectationRef: string;
  observationSetHash: string;
  expectationHash: string;
  reconciliation: {
    outcome: string;
    amountVarianceMinor?: number;
    reasons: string[];
  };
  reconciliationHash: string;
  occurredAt: string;
  rawFinancialInformationPersisted: false;
}

export interface RiverBankIngestionContext {
  workspaceId: string;
  streamId?: string;
  digitalMePrincipal?: string;
  organisationId?: string;
  workflowId?: string;
  correlationId?: string;
  causationId?: string;
}

export interface RiverEventInsertCandidate {
  stream_id?: string;
  workspace_id: string;
  event_type: 'BANK_SETTLEMENT_RECONCILED';
  event_version: '0.2';
  action: 'RECONCILE_BANK_SETTLEMENT';
  source_system: 'setu-aa';
  source_environment: 'sandbox';
  source_event_ref: string;
  idempotency_key: string;
  actor_type: 'user' | 'agent' | 'system' | 'service';
  actor_id: string;
  digitalme_principal?: string;
  organisation_id?: string;
  workflow_id?: string;
  object_type: 'bank_settlement_reconciliation';
  object_id: string;
  previous_state: null;
  new_state: {
    outcome: string;
    amountVarianceMinor?: number;
    reasons: string[];
    providerTransactionRef?: string;
    observationSetHash: string;
    expectationHash: string;
    reconciliationHash: string;
    replayVerified: true;
  };
  authority_basis: {
    wardenDecisionRef: string;
  };
  consent_context: {
    consentRef?: string;
    notificationCorrelationRef?: string;
  };
  commercial_relevance: true;
  settlement_eligibility: 'not_applicable';
  lifecycle_status: 'VERIFIED';
  correlation_id?: string;
  causation_id?: string;
  occurred_at: string;
  observed_at: string;
  event_hash: string;
  metadata: {
    bankingContractVersion: 'BANK-CONNECTION-001/R0.8';
    providerSessionRef?: string;
    providerTraceId?: string;
    merchantRef: string;
    runId: string;
    rawFinancialInformationPersisted: false;
    bankNativeTruthRetainedByProvider: true;
  };
}

export interface RiverEventWriteReceipt {
  riverEventId: string;
  workspaceId: string;
  sourceEventRef: string;
  eventHash: string;
  recordedAt: string;
}

export interface RiverEventWriter {
  appendBankEvidenceEvent(
    candidate: RiverEventInsertCandidate
  ): Promise<RiverEventWriteReceipt>;
}

export function validateBankRiverHandoff(
  handoff: BankSettlementRiverHandoff
): void {
  if (handoff.receiptType !== 'BANK_SETTLEMENT_RECONCILED') {
    throw new Error('Unsupported bank River handoff receipt type.');
  }
  if (handoff.version !== 'BANK-CONNECTION-001/R0.7') {
    throw new Error('Unsupported bank handoff version.');
  }
  if (handoff.provider !== 'setu-aa' || handoff.environment !== 'sandbox') {
    throw new Error('R0.8 only admits Setu AA sandbox evidence.');
  }
  if (!handoff.runId || !handoff.wardenDecisionRef || !handoff.expectationRef) {
    throw new Error('Handoff is missing required authority/object lineage.');
  }
  if (
    !handoff.observationSetHash ||
    !handoff.expectationHash ||
    !handoff.reconciliationHash
  ) {
    throw new Error('Handoff is missing deterministic evidence hashes.');
  }
  if (handoff.rawFinancialInformationPersisted !== false) {
    throw new Error('River handoff must not claim persisted raw FI.');
  }

  const computed = canonicalSha256(handoff.reconciliation);
  if (computed !== handoff.reconciliationHash) {
    throw new Error('Reconciliation hash does not match the receipt payload.');
  }
}

export function compileBankRiverEvent(input: {
  handoff: BankSettlementRiverHandoff;
  context: RiverBankIngestionContext;
  replayVerified: boolean;
  observedAt?: string;
}): RiverEventInsertCandidate {
  validateBankRiverHandoff(input.handoff);

  if (!input.replayVerified) {
    throw new Error('Provider-backed replay must be verified before River ingest.');
  }

  if (!input.context.workspaceId) {
    throw new Error('River workspaceId is required.');
  }

  const sourceEventRef =
    `bank:${input.handoff.runId}:${input.handoff.reconciliationHash}`;
  const idempotencyKey = sourceEventRef;

  const core = {
    stream_id: input.context.streamId,
    workspace_id: input.context.workspaceId,
    event_type: 'BANK_SETTLEMENT_RECONCILED' as const,
    event_version: '0.2' as const,
    action: 'RECONCILE_BANK_SETTLEMENT' as const,
    source_system: 'setu-aa' as const,
    source_environment: 'sandbox' as const,
    source_event_ref: sourceEventRef,
    idempotency_key: idempotencyKey,
    actor_type: 'service' as const,
    actor_id: input.handoff.actorRef,
    digitalme_principal: input.context.digitalMePrincipal,
    organisation_id: input.context.organisationId,
    workflow_id: input.context.workflowId,
    object_type: 'bank_settlement_reconciliation' as const,
    object_id: input.handoff.expectationRef,
    previous_state: null,
    new_state: {
      outcome: input.handoff.reconciliation.outcome,
      amountVarianceMinor: input.handoff.reconciliation.amountVarianceMinor,
      reasons: input.handoff.reconciliation.reasons,
      providerTransactionRef: input.handoff.providerTransactionRef,
      observationSetHash: input.handoff.observationSetHash,
      expectationHash: input.handoff.expectationHash,
      reconciliationHash: input.handoff.reconciliationHash,
      replayVerified: true as const,
    },
    authority_basis: {
      wardenDecisionRef: input.handoff.wardenDecisionRef,
    },
    consent_context: {
      consentRef: input.handoff.consentRef,
      notificationCorrelationRef:
        input.handoff.notificationCorrelationRef,
    },
    commercial_relevance: true as const,
    settlement_eligibility: 'not_applicable' as const,
    lifecycle_status: 'VERIFIED' as const,
    correlation_id: input.context.correlationId,
    causation_id: input.context.causationId,
    occurred_at: input.handoff.occurredAt,
    observed_at: input.observedAt ?? new Date().toISOString(),
    metadata: {
      bankingContractVersion: 'BANK-CONNECTION-001/R0.8' as const,
      providerSessionRef: input.handoff.sessionRef,
      providerTraceId: input.handoff.providerTraceId,
      merchantRef: input.handoff.merchantRef,
      runId: input.handoff.runId,
      rawFinancialInformationPersisted: false as const,
      bankNativeTruthRetainedByProvider: true as const,
    },
  };

  return {
    ...core,
    event_hash: canonicalSha256(core),
  };
}

/**
 * Fail-closed default: compiling a River event is not the same as durably
 * ingesting it. A real River writer must bind to the canonical River runtime.
 */
export class DisabledRiverEventWriter implements RiverEventWriter {
  async appendBankEvidenceEvent(): Promise<RiverEventWriteReceipt> {
    throw new Error(
      'River durable writer is disabled. Bind to the canonical RiverOS ingestion runtime.'
    );
  }
}
