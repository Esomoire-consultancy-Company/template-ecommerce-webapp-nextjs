export interface SetuAaClientConfig {
  environment: 'sandbox' | 'production';
  productInstanceId: string;
  /**
   * Access token must be injected by the runtime secret/auth layer.
   * It must never be committed to source or persisted in client-visible code.
   */
  accessToken: string;
}

export interface SetuConsentResponse {
  id: string;
  url?: string;
  status: string;
  traceId?: string;
  [key: string]: unknown;
}

export interface SetuSessionResponse {
  id: string;
  consentId: string;
  status: string;
  format?: string;
  traceId?: string;
  [key: string]: unknown;
}

export interface SetuFiResponse {
  traceId?: string;
  [key: string]: unknown;
}

export class SetuAaClient {
  private readonly baseUrl: string;

  constructor(private readonly config: SetuAaClientConfig) {
    this.baseUrl =
      config.environment === 'sandbox'
        ? 'https://fiu-sandbox.setu.co'
        : 'https://fiu.setu.co';
  }

  private async request<T>(
    path: string,
    init: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.accessToken}`,
        'x-product-instance-id': this.config.productInstanceId,
        ...(init.headers ?? {}),
      },
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        `Setu AA request failed (${response.status}): ${JSON.stringify(body)}`
      );
    }

    return body as T;
  }

  createConsent(payload: Record<string, unknown>): Promise<SetuConsentResponse> {
    return this.request<SetuConsentResponse>('/consents', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  getConsent(consentRequestId: string): Promise<SetuConsentResponse> {
    return this.request<SetuConsentResponse>(
      `/consents/${encodeURIComponent(consentRequestId)}`
    );
  }

  revokeConsent(consentRequestId: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      `/v2/consents/${encodeURIComponent(consentRequestId)}/revoke`,
      { method: 'POST' }
    );
  }

  createDataSession(payload: {
    consentId: string;
    dataRange: { from: string; to: string };
    format: 'json' | 'xml';
  }): Promise<SetuSessionResponse> {
    return this.request<SetuSessionResponse>('/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  fetchFinancialInformation(
    sessionId: string
  ): Promise<SetuFiResponse> {
    return this.request<SetuFiResponse>(
      `/sessions/${encodeURIComponent(sessionId)}`
    );
  }
}
