export type BankConnectionScope =
  | 'ACCOUNT_METADATA_READ'
  | 'BALANCE_READ'
  | 'TRANSACTION_READ'
  | 'SETTLEMENT_REFERENCE'
  | 'PAYMENT_INITIATE';

export type BankConnectionState =
  | 'REQUESTED'
  | 'CONSENT_PENDING'
  | 'CONNECTED'
  | 'SUSPENDED'
  | 'REVOKED'
  | 'EXPIRED'
  | 'ERROR';

export interface BankConnectionRequest {
  digitalMeRef: string;
  merchantRef: string;
  purpose: 'ECOMMERCE_SETTLEMENT' | 'RECONCILIATION';
  scopes: BankConnectionScope[];
  wardenDecisionRef: string;
  returnUrl: string;
}

export interface BankConsentSession {
  provider: string;
  consentSessionRef: string;
  authorizationUrl: string;
  expiresAt?: string;
}

export interface BankAccountProjection {
  bankConnectionRef: string;
  provider: string;
  providerAccountRef: string;
  institutionName?: string;
  accountLabel?: string;
  maskedAccount?: string;
  currency?: string;
  scopes: BankConnectionScope[];
  state: BankConnectionState;
  connectedAt?: string;
  consentExpiresAt?: string;
  wardenDecisionRef: string;
  riverReceiptRef?: string;
}

export interface BankTransactionObservation {
  bankConnectionRef: string;
  providerTransactionRef: string;
  observedAt: string;
  bookedAt?: string;
  amountMinor: number;
  currency: string;
  direction: 'CREDIT' | 'DEBIT';
  description?: string;
  counterpartyLabel?: string;
  sourceHash?: string;
}
