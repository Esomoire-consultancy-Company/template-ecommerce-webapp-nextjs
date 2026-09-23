export type ProviderNotificationVerificationState =
  | 'VERIFIED'
  | 'REJECTED'
  | 'UNSUPPORTED';

export interface ProviderNotificationEnvelope {
  provider: string;
  receivedAt: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  wardenDecisionRef: string;
}

export interface ProviderNotificationVerification {
  state: ProviderNotificationVerificationState;
  provider: string;
  eventType?: string;
  providerEventRef?: string;
  payloadHash?: string;
  reason?: string;
  riverReservationRef?: string;
}

export interface ProviderNotificationVerifier {
  readonly providerId: string;

  verify(
    envelope: ProviderNotificationEnvelope
  ): Promise<ProviderNotificationVerification>;
}

/**
 * Fail-closed default. Provider-specific signature/MAC verification must be
 * implemented only from the provider's current documented contract.
 */
export class DisabledProviderNotificationVerifier
  implements ProviderNotificationVerifier
{
  readonly providerId = 'disabled';

  async verify(
    envelope: ProviderNotificationEnvelope
  ): Promise<ProviderNotificationVerification> {
    return {
      state: 'REJECTED',
      provider: envelope.provider,
      reason:
        'No provider notification verifier is configured. Notification rejected fail-closed.',
    };
  }
}

export function requireVerifiedNotification(
  result: ProviderNotificationVerification
): void {
  if (result.state !== 'VERIFIED') {
    throw new Error(
      `Provider notification is not verified: ${result.reason ?? result.state}`
    );
  }
}
