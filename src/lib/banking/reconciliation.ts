import { BankTransactionObservation } from './types';

export type CommerceSettlementKind =
  | 'ORDER_PAYMENT'
  | 'REFUND'
  | 'PAYMENT_PROVIDER_PAYOUT'
  | 'PAYMENT_PROVIDER_FEE'
  | 'CHARGEBACK'
  | 'OTHER';

export interface CommerceSettlementExpectation {
  expectationRef: string;
  kind: CommerceSettlementKind;
  amountMinor: number;
  currency: string;
  direction: 'CREDIT' | 'DEBIT';
  expectedFrom?: string;
  expectedTo?: string;
  providerReference?: string;
  orderRef?: string;
  payoutRef?: string;
}

export type ReconciliationOutcome =
  | 'MATCH'
  | 'MATCH_WITH_TOLERANCE'
  | 'AMOUNT_DIFFERENCE'
  | 'DIRECTION_DIFFERENCE'
  | 'CURRENCY_DIFFERENCE'
  | 'DATE_OUTSIDE_WINDOW'
  | 'REFERENCE_MISMATCH'
  | 'NO_MATCH';

export interface ReconciliationResult {
  expectationRef: string;
  providerTransactionRef?: string;
  outcome: ReconciliationOutcome;
  amountVarianceMinor?: number;
  reasons: string[];
  wardenDecisionRef?: string;
  riverReceiptRef?: string;
}

/**
 * Deterministic first-pass matcher.
 *
 * This does not create accounting entries or legal/economic conclusions.
 * It only compares a commerce settlement expectation with a bank/provider
 * observation. Professional/accounting treatment is downstream.
 */
export function reconcileSettlement(
  expected: CommerceSettlementExpectation,
  observed?: BankTransactionObservation,
  toleranceMinor = 0
): ReconciliationResult {
  if (!observed) {
    return {
      expectationRef: expected.expectationRef,
      outcome: 'NO_MATCH',
      reasons: ['No provider transaction observation supplied'],
    };
  }

  const reasons: string[] = [];

  if (expected.currency !== observed.currency) {
    reasons.push('Currency differs');
    return {
      expectationRef: expected.expectationRef,
      providerTransactionRef: observed.providerTransactionRef,
      outcome: 'CURRENCY_DIFFERENCE',
      reasons,
    };
  }

  if (expected.direction !== observed.direction) {
    reasons.push('Credit/debit direction differs');
    return {
      expectationRef: expected.expectationRef,
      providerTransactionRef: observed.providerTransactionRef,
      outcome: 'DIRECTION_DIFFERENCE',
      reasons,
    };
  }

  const variance = observed.amountMinor - expected.amountMinor;

  if (Math.abs(variance) > toleranceMinor) {
    reasons.push('Observed amount is outside configured tolerance');
    return {
      expectationRef: expected.expectationRef,
      providerTransactionRef: observed.providerTransactionRef,
      outcome: 'AMOUNT_DIFFERENCE',
      amountVarianceMinor: variance,
      reasons,
    };
  }

  if (
    expected.providerReference &&
    observed.description &&
    !observed.description.includes(expected.providerReference)
  ) {
    reasons.push('Provider reference not found in observation text');
    return {
      expectationRef: expected.expectationRef,
      providerTransactionRef: observed.providerTransactionRef,
      outcome: 'REFERENCE_MISMATCH',
      amountVarianceMinor: variance,
      reasons,
    };
  }

  return {
    expectationRef: expected.expectationRef,
    providerTransactionRef: observed.providerTransactionRef,
    outcome: variance === 0 ? 'MATCH' : 'MATCH_WITH_TOLERANCE',
    amountVarianceMinor: variance,
    reasons:
      variance === 0
        ? ['Amount, currency and direction match']
        : ['Matched within configured amount tolerance'],
  };
}
