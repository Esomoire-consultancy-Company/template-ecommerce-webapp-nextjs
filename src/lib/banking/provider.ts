import {
  BankAccountProjection,
  BankConnectionRequest,
  BankConsentSession,
  BankTransactionObservation,
} from './types';

export interface BankConnectionProvider {
  readonly providerId: string;

  createConsentSession(
    request: BankConnectionRequest
  ): Promise<BankConsentSession>;

  exchangeCallback(input: {
    consentSessionRef: string;
    callbackParams: Record<string, string | string[] | undefined>;
    wardenDecisionRef: string;
  }): Promise<BankAccountProjection>;

  listTransactionObservations(input: {
    bankConnectionRef: string;
    from: string;
    to: string;
  }): Promise<BankTransactionObservation[]>;

  revokeConnection(input: {
    bankConnectionRef: string;
    wardenDecisionRef: string;
  }): Promise<void>;
}

/**
 * Safe default for local/bootstrap environments.
 * No bank API calls are made until an approved provider adapter is configured.
 */
export class DisabledBankConnectionProvider
  implements BankConnectionProvider
{
  readonly providerId = 'disabled';

  private unavailable(): never {
    throw new Error(
      'Bank connection provider is disabled. Configure an approved provider adapter and Warden scope before use.'
    );
  }

  async createConsentSession(): Promise<BankConsentSession> {
    return this.unavailable();
  }

  async exchangeCallback(): Promise<BankAccountProjection> {
    return this.unavailable();
  }

  async listTransactionObservations(): Promise<
    BankTransactionObservation[]
  > {
    return this.unavailable();
  }

  async revokeConnection(): Promise<void> {
    return this.unavailable();
  }
}
