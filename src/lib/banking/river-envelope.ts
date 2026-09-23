export interface BankExecutionReceiptDraft {
  receiptType:
    | 'BANK_CONSENT_STATUS'
    | 'BANK_FI_SESSION_CREATED'
    | 'BANK_FI_FETCH_OBSERVED'
    | 'BANK_SETTLEMENT_RECONCILED';
  provider: string;
  environment: 'sandbox' | 'production';
  actorRef: string;
  merchantRef: string;
  wardenDecisionRef: string;
  providerRequestRef?: string;
  consentRef?: string;
  sessionRef?: string;
  verifiedNotificationReceiptRef?: string;
  observationCount?: number;
  reconciliationRef?: string;
  occurredAt: string;
  sourceHash?: string;
  supersedesReceiptRef?: string;
}

/**
 * River owns durable evidence. This helper only compiles a secret-free draft
 * envelope for handoff to the River writer.
 */
export function compileBankExecutionReceiptDraft(
  input: BankExecutionReceiptDraft
): BankExecutionReceiptDraft {
  if (!input.wardenDecisionRef) {
    throw new Error('Warden decision reference is required for River handoff.');
  }

  if (input.environment === 'production') {
    throw new Error(
      'BANK-CONNECTION-001 R0.4/R0.5 sandbox runtime cannot compile production receipts.'
    );
  }

  return { ...input };
}
