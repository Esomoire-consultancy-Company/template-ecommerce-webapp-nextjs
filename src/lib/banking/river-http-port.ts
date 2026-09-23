import {
  RiverExternalEvidenceIngressPort,
  RiverExternalEvidenceIngressRequest,
  RiverExternalEvidenceIngressResponse,
} from './river-ingestion';

export interface HttpRiverIngressConfig {
  endpoint: string;
  authorization?: string;
  requestTimeoutMs?: number;
}

/**
 * Thin transport adapter for RIVER-EXTERNAL-EVIDENCE-INGRESS-001.
 *
 * The endpoint is supplied by deployment/runtime configuration. This module
 * does not assume a particular RiverOS hostname, route, gateway, or database.
 */
export class HttpRiverExternalEvidenceIngressPort
  implements RiverExternalEvidenceIngressPort
{
  constructor(private readonly config: HttpRiverIngressConfig) {}

  async ingest(
    request: RiverExternalEvidenceIngressRequest
  ): Promise<RiverExternalEvidenceIngressResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.requestTimeoutMs ?? 15000
    );

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.authorization
            ? { Authorization: this.config.authorization }
            : {}),
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      const body = (await response.json().catch(() => ({
        accepted: false,
        failure_code: 'INGEST_FAILED',
        reason: 'River ingress returned a non-JSON response.',
      }))) as RiverExternalEvidenceIngressResponse;

      if (!response.ok) {
        return {
          accepted: false,
          failure_code: body.failure_code ?? 'INGEST_FAILED',
          reason:
            body.reason ??
            `River ingress HTTP request failed with status ${response.status}`,
        };
      }

      return body;
    } catch (error) {
      return {
        accepted: false,
        failure_code: 'INGEST_FAILED',
        reason:
          error instanceof Error
            ? error.message
            : 'River ingress transport failed.',
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
