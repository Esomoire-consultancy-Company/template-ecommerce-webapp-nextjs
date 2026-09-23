import {
  ProviderNotificationEnvelope,
  ProviderNotificationVerification,
} from './notification';

type UnknownRecord = Record<string, unknown>;

export type SetuAaNotificationKind =
  | 'CONSENT_STATUS_UPDATE'
  | 'SESSION_STATUS_UPDATE'
  | 'FI_DATA_READY'
  | 'UNKNOWN';

export interface SetuAaNotificationObservation {
  kind: SetuAaNotificationKind;
  consentId?: string;
  sessionId?: string;
  status?: string;
  timestamp?: string;
  success?: boolean;
}

function record(value: unknown): UnknownRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function boolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function parseSetuAaNotification(
  rawBody: string
): SetuAaNotificationObservation {
  const root = record(JSON.parse(rawBody));
  if (!root) return { kind: 'UNKNOWN' };

  const data = record(root.data);
  const explicitType = string(root.type);
  const consentId = string(root.consentId) ?? string(root.id);
  const sessionId =
    string(root.dataSessionId) ??
    string(root.sessionId) ??
    string(data?.dataSessionId);
  const status = string(data?.status) ?? string(root.status);

  let kind: SetuAaNotificationKind = 'UNKNOWN';

  if (explicitType === 'SESSION_STATUS_UPDATE') {
    kind = 'SESSION_STATUS_UPDATE';
  } else if (explicitType === 'FI_DATA_READY') {
    kind = 'FI_DATA_READY';
  } else if (
    consentId &&
    ['ACTIVE', 'REJECTED', 'REVOKED', 'PAUSED', 'EXPIRED'].includes(
      status ?? ''
    )
  ) {
    kind = 'CONSENT_STATUS_UPDATE';
  }

  return {
    kind,
    consentId,
    sessionId,
    status,
    timestamp: string(root.timestamp),
    success: boolean(root.success),
  };
}

export interface SetuNotificationCorrelationContext {
  expectedConsentId?: string;
  expectedSessionId?: string;
}

/**
 * Setu's current AA notification documentation describes callback payloads but
 * does not document a cryptographic signature contract for AA webhooks.
 *
 * Therefore correlation alone MUST NOT return VERIFIED. It returns
 * UNSUPPORTED after validating that the notification matches known local
 * consent/session state. Trust is upgraded only after provider API
 * re-verification (for example GET /consents/:id or a successful FI fetch).
 */
export async function correlateSetuAaNotification(input: {
  envelope: ProviderNotificationEnvelope;
  context: SetuNotificationCorrelationContext;
}): Promise<ProviderNotificationVerification & {
  observation?: SetuAaNotificationObservation;
}> {
  let observation: SetuAaNotificationObservation;

  try {
    observation = parseSetuAaNotification(input.envelope.rawBody);
  } catch {
    return {
      state: 'REJECTED',
      provider: 'setu-aa',
      reason: 'Notification body is not valid JSON.',
    };
  }

  if (observation.kind === 'UNKNOWN') {
    return {
      state: 'REJECTED',
      provider: 'setu-aa',
      reason: 'Unrecognized Setu AA notification shape.',
      observation,
    };
  }

  if (
    input.context.expectedConsentId &&
    observation.consentId !== input.context.expectedConsentId
  ) {
    return {
      state: 'REJECTED',
      provider: 'setu-aa',
      reason: 'Notification consent reference does not match runtime context.',
      observation,
    };
  }

  if (
    input.context.expectedSessionId &&
    observation.sessionId !== input.context.expectedSessionId
  ) {
    return {
      state: 'REJECTED',
      provider: 'setu-aa',
      reason: 'Notification session reference does not match runtime context.',
      observation,
    };
  }

  return {
    state: 'UNSUPPORTED',
    provider: 'setu-aa',
    eventType: observation.kind,
    providerEventRef: observation.sessionId ?? observation.consentId,
    reason:
      'Notification correlated to known runtime state but is not cryptographically authenticated. Re-verify through the Setu provider API before trusting provider state.',
    observation,
  };
}
