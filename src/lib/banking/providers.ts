export type BankingProviderKind =
  | 'DISABLED'
  | 'SETU_AA_SANDBOX'
  | 'SETU_AA_PRODUCTION'
  | 'BANK_DIRECT'
  | 'PAYMENT_PROVIDER_SETTLEMENT';

export interface BankingProviderDescriptor {
  id: string;
  kind: BankingProviderKind;
  environment: 'sandbox' | 'production' | 'external';
  capabilities: Array<
    | 'CONSENT_CREATE'
    | 'CONSENT_STATUS'
    | 'CONSENT_REVOKE'
    | 'FI_SESSION_CREATE'
    | 'FI_FETCH'
    | 'TRANSACTION_OBSERVE'
    | 'SETTLEMENT_RECONCILE'
  >;
  paymentInitiation: false;
}

export const BANKING_PROVIDERS: BankingProviderDescriptor[] = [
  {
    id: 'disabled',
    kind: 'DISABLED',
    environment: 'external',
    capabilities: [],
    paymentInitiation: false,
  },
  {
    id: 'setu-aa-sandbox',
    kind: 'SETU_AA_SANDBOX',
    environment: 'sandbox',
    capabilities: [
      'CONSENT_CREATE',
      'CONSENT_STATUS',
      'CONSENT_REVOKE',
      'FI_SESSION_CREATE',
      'FI_FETCH',
      'TRANSACTION_OBSERVE',
      'SETTLEMENT_RECONCILE',
    ],
    paymentInitiation: false,
  },
  {
    id: 'setu-aa-production',
    kind: 'SETU_AA_PRODUCTION',
    environment: 'production',
    capabilities: [
      'CONSENT_CREATE',
      'CONSENT_STATUS',
      'CONSENT_REVOKE',
      'FI_SESSION_CREATE',
      'FI_FETCH',
      'TRANSACTION_OBSERVE',
      'SETTLEMENT_RECONCILE',
    ],
    paymentInitiation: false,
  },
];

export function getBankingProviderDescriptor(
  providerId: string
): BankingProviderDescriptor {
  const provider = BANKING_PROVIDERS.find(({ id }) => id === providerId);

  if (!provider) {
    throw new Error(`Unknown banking provider: ${providerId}`);
  }

  return provider;
}
