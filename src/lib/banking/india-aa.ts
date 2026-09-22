import {
  BankAccountProjection,
  BankConnectionScope,
  BankTransactionObservation,
} from './types';

export type IndiaBankingRail =
  | 'AA_FIU'
  | 'BANK_DIRECT'
  | 'PAYMENT_PROVIDER_SETTLEMENT'
  | 'TSP_MEDIATED';

export type AaEligibilityState =
  | 'UNASSESSED'
  | 'ELIGIBLE_REGULATED_ENTITY'
  | 'ELIGIBILITY_BLOCKED'
  | 'PROVIDER_ONLY';

export type AaConsentState =
  | 'REQUESTED'
  | 'PENDING_CUSTOMER_ACTION'
  | 'ACTIVE'
  | 'PAUSED'
  | 'REVOKED'
  | 'EXPIRED'
  | 'REJECTED'
  | 'ERROR';

export interface AaParticipantProfile {
  rail: IndiaBankingRail;
  eligibilityState: AaEligibilityState;
  regulator?: 'RBI' | 'SEBI' | 'IRDAI' | 'PFRDA';
  regulatedEntityRef?: string;
  fiuId?: string;
  aaId?: string;
  tspRef?: string;
}

export interface AaConsentPurpose {
  purposeCode: string;
  description: string;
  dataLifeSeconds: number;
  frequencyPerUnit: number;
  frequencyUnit: 'HOUR' | 'DAY' | 'MONTH' | 'YEAR';
  fetchFrom: string;
  fetchTo: string;
}

export interface AaConsentRequest {
  digitalMeRef: string;
  merchantRef: string;
  participant: AaParticipantProfile;
  scopes: Exclude<BankConnectionScope, 'PAYMENT_INITIATE'>[];
  purpose: AaConsentPurpose;
  wardenDecisionRef: string;
  riverReservationRef?: string;
}

export interface AaConsentProjection {
  consentRef: string;
  providerConsentRef: string;
  state: AaConsentState;
  aaId: string;
  fiuId?: string;
  purposeCode: string;
  validFrom?: string;
  validTo?: string;
  dataLifeSeconds?: number;
  consentArtifactHash?: string;
  wardenDecisionRef: string;
  riverReceiptRef?: string;
}

export interface AaFinancialInformationSession {
  consentRef: string;
  providerSessionRef: string;
  requestedAt: string;
  state:
    | 'REQUESTED'
    | 'DATA_PENDING'
    | 'READY'
    | 'FETCHED'
    | 'FAILED'
    | 'EXPIRED';
  providerReceiptRef?: string;
}

export interface AaProviderObservation {
  consent: AaConsentProjection;
  account: BankAccountProjection;
  transactions: BankTransactionObservation[];
  fetchedAt: string;
  providerReceiptRef?: string;
  riverReceiptRef?: string;
}

/**
 * AA access is account-data access, not payment initiation.
 * The ecommerce runtime must use a separate payment rail for movement of funds.
 */
export function assertAaReadOnlyScopes(scopes: BankConnectionScope[]): void {
  if (scopes.includes('PAYMENT_INITIATE')) {
    throw new Error(
      'PAYMENT_INITIATE is not admissible through the Account Aggregator read/reconciliation profile.'
    );
  }
}

/**
 * A technical service provider does not itself make an unregulated ecommerce
 * company an eligible FIU. Production enablement requires a verified
 * participant/regulatory basis.
 */
export function assertAaEligibility(
  participant: AaParticipantProfile
): void {
  if (
    participant.rail === 'AA_FIU' &&
    participant.eligibilityState !== 'ELIGIBLE_REGULATED_ENTITY'
  ) {
    throw new Error(
      'AA FIU production access is blocked until regulated-entity eligibility is verified.'
    );
  }
}
