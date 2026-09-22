export type BankEnvironment = 'sandbox' | 'production';

export type BankRuntimeCapability =
  | 'BANK_CONNECTION_REQUEST'
  | 'BANK_ACCOUNT_METADATA_READ'
  | 'BANK_BALANCE_READ'
  | 'BANK_TRANSACTION_READ'
  | 'BANK_SETTLEMENT_RECONCILE'
  | 'BANK_CONSENT_REVOKE'
  | 'BANK_PROVIDER_NOTIFICATION_ACCEPT'
  | 'BANK_PROVIDER_PRODUCTION_ENABLE'
  | 'BANK_PAYMENT_INITIATE'
  | 'BANK_PAYOUT_INITIATE'
  | 'BANK_BENEFICIARY_CREATE';

export interface WardenBankDecision {
  decisionRef: string;
  outcome: 'ALLOW' | 'DENY';
  capability: BankRuntimeCapability;
  environment: BankEnvironment;
  expiresAt?: string;
}

const R0_4_SANDBOX_ALLOWED = new Set<BankRuntimeCapability>([
  'BANK_CONNECTION_REQUEST',
  'BANK_ACCOUNT_METADATA_READ',
  'BANK_BALANCE_READ',
  'BANK_TRANSACTION_READ',
  'BANK_SETTLEMENT_RECONCILE',
  'BANK_CONSENT_REVOKE',
  'BANK_PROVIDER_NOTIFICATION_ACCEPT',
]);

const MONEY_MOVEMENT = new Set<BankRuntimeCapability>([
  'BANK_PAYMENT_INITIATE',
  'BANK_PAYOUT_INITIATE',
  'BANK_BENEFICIARY_CREATE',
]);

export function admitBankSandboxOperation(
  decision: WardenBankDecision,
  now = new Date()
): void {
  if (decision.outcome !== 'ALLOW') {
    throw new Error(`Warden denied ${decision.capability}`);
  }

  if (decision.expiresAt && new Date(decision.expiresAt) <= now) {
    throw new Error(`Warden decision expired for ${decision.capability}`);
  }

  if (MONEY_MOVEMENT.has(decision.capability)) {
    throw new Error(
      `${decision.capability} is structurally unavailable in BANK-CONNECTION-001 R0.4`
    );
  }

  if (decision.environment === 'production') {
    if (decision.capability !== 'BANK_PROVIDER_PRODUCTION_ENABLE') {
      throw new Error(
        'R0.4 harness does not admit production banking operations.'
      );
    }

    throw new Error(
      'BANK_PROVIDER_PRODUCTION_ENABLE requires a later production-promotion contract.'
    );
  }

  if (!R0_4_SANDBOX_ALLOWED.has(decision.capability)) {
    throw new Error(
      `${decision.capability} is not admitted by the R0.4 sandbox capability matrix`
    );
  }
}
