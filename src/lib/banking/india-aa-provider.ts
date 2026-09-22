import {
  AaConsentProjection,
  AaConsentRequest,
  AaFinancialInformationSession,
  AaProviderObservation,
} from './india-aa';

export interface IndiaAaProviderReceipt {
  provider: string;
  providerRequestRef?: string;
  providerSessionRef?: string;
  providerReceiptRef?: string;
  observedAt: string;
  payloadHash?: string;
}

export interface IndiaAaProvider {
  readonly providerId: string;

  createConsent(input: {
    request: AaConsentRequest;
  }): Promise<{
    consent: AaConsentProjection;
    authorizationUrl: string;
    receipt: IndiaAaProviderReceipt;
  }>;

  processConsentCallback(input: {
    callbackParams: Record<string, string | string[] | undefined>;
    wardenDecisionRef: string;
  }): Promise<{
    consent: AaConsentProjection;
    receipt: IndiaAaProviderReceipt;
  }>;

  requestFinancialInformation(input: {
    consent: AaConsentProjection;
    wardenDecisionRef: string;
  }): Promise<{
    session: AaFinancialInformationSession;
    receipt: IndiaAaProviderReceipt;
  }>;

  fetchFinancialInformation(input: {
    consent: AaConsentProjection;
    session: AaFinancialInformationSession;
    wardenDecisionRef: string;
  }): Promise<{
    observation: AaProviderObservation;
    receipt: IndiaAaProviderReceipt;
  }>;

  revokeConsent(input: {
    consent: AaConsentProjection;
    wardenDecisionRef: string;
  }): Promise<{
    consent: AaConsentProjection;
    receipt: IndiaAaProviderReceipt;
  }>;
}

/**
 * Default implementation intentionally fails closed.
 * Production enablement requires a verified provider adapter plus participant
 * eligibility, consent, secret storage, callback verification and Warden scope.
 */
export class DisabledIndiaAaProvider implements IndiaAaProvider {
  readonly providerId = 'disabled-india-aa';

  private unavailable(): never {
    throw new Error(
      'India AA provider is disabled. Configure an approved provider adapter before use.'
    );
  }

  async createConsent(): Promise<never> {
    return this.unavailable();
  }

  async processConsentCallback(): Promise<never> {
    return this.unavailable();
  }

  async requestFinancialInformation(): Promise<never> {
    return this.unavailable();
  }

  async fetchFinancialInformation(): Promise<never> {
    return this.unavailable();
  }

  async revokeConsent(): Promise<never> {
    return this.unavailable();
  }
}
