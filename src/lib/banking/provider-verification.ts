import { SetuAaClient } from './setu-aa-client';

export type ProviderVerificationState =
  | 'PROVIDER_CONFIRMED'
  | 'PROVIDER_REJECTED'
  | 'PROVIDER_UNAVAILABLE';

export interface ProviderStateVerification {
  provider: 'setu-aa';
  state: ProviderVerificationState;
  resource: 'CONSENT' | 'FI_SESSION';
  providerRef: string;
  providerStatus?: string;
  traceId?: string;
  observedAt: string;
  reason?: string;
}

/**
 * Re-verify a correlated consent notification against Setu's authoritative API.
 */
export async function verifySetuConsentState(input: {
  client: SetuAaClient;
  consentId: string;
  claimedStatus?: string;
}): Promise<ProviderStateVerification> {
  try {
    const consent = await input.client.getConsent(input.consentId);

    if (typeof consent.status !== 'string' || consent.status.length === 0) {
      return {
        provider: 'setu-aa',
        state: 'PROVIDER_REJECTED',
        resource: 'CONSENT',
        providerRef: input.consentId,
        traceId: consent.traceId,
        observedAt: new Date().toISOString(),
        reason: 'Provider consent response is missing a valid status.',
      };
    }

    if (
      input.claimedStatus &&
      input.claimedStatus !== consent.status
    ) {
      return {
        provider: 'setu-aa',
        state: 'PROVIDER_REJECTED',
        resource: 'CONSENT',
        providerRef: input.consentId,
        providerStatus: consent.status,
        traceId: consent.traceId,
        observedAt: new Date().toISOString(),
        reason: 'Webhook status differs from provider API status.',
      };
    }

    return {
      provider: 'setu-aa',
      state: 'PROVIDER_CONFIRMED',
      resource: 'CONSENT',
      providerRef: input.consentId,
      providerStatus: consent.status,
      traceId: consent.traceId,
      observedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      provider: 'setu-aa',
      state: 'PROVIDER_UNAVAILABLE',
      resource: 'CONSENT',
      providerRef: input.consentId,
      observedAt: new Date().toISOString(),
      reason: error instanceof Error ? error.message : 'Provider verification failed',
    };
  }
}

/**
 * FI readiness is ultimately confirmed by Setu when GET /sessions/:id succeeds.
 * The returned FI body should then be normalized in-memory and raw Profile/KYC
 * fields should not be copied into the commerce reconciliation layer.
 */
export async function verifyAndFetchSetuFiSession(input: {
  client: SetuAaClient;
  sessionId: string;
}): Promise<{
  verification: ProviderStateVerification;
  fi?: unknown;
}> {
  try {
    const fi = await input.client.fetchFinancialInformation(input.sessionId);
    const providerStatus =
      typeof fi.status === 'string' ? fi.status : undefined;

    if (!providerStatus || !['PARTIAL', 'COMPLETED'].includes(providerStatus)) {
      return {
        verification: {
          provider: 'setu-aa',
          state: 'PROVIDER_REJECTED',
          resource: 'FI_SESSION',
          providerRef: input.sessionId,
          providerStatus,
          traceId: typeof fi.traceId === 'string' ? fi.traceId : undefined,
          observedAt: new Date().toISOString(),
          reason:
            'Provider FI response is missing an admissible PARTIAL/COMPLETED status.',
        },
      };
    }

    return {
      verification: {
        provider: 'setu-aa',
        state: 'PROVIDER_CONFIRMED',
        resource: 'FI_SESSION',
        providerRef: input.sessionId,
        providerStatus,
        traceId: typeof fi.traceId === 'string' ? fi.traceId : undefined,
        observedAt: new Date().toISOString(),
      },
      fi,
    };
  } catch (error) {
    return {
      verification: {
        provider: 'setu-aa',
        state: 'PROVIDER_UNAVAILABLE',
        resource: 'FI_SESSION',
        providerRef: input.sessionId,
        observedAt: new Date().toISOString(),
        reason:
          error instanceof Error ? error.message : 'Provider FI verification failed',
      },
    };
  }
}
