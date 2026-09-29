// otel-signoz plugin template — Angular 15+ (see references/angular-frontend.md for NgModule/class-based setups).
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
// Zone.js-based Angular: use the *peer-dep* build (reuses the app's own zone.js; the plain "context-zone"
// package ships a second zone.js).
// Zoneless app: swap this for `new StackContextManager()` from '@opentelemetry/sdk-trace-web'.
import { ZoneContextManager } from '@opentelemetry/context-zone-peer-dep';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { environment } from '../../environments/environment';

export type DeploymentEnvironment = 'development' | 'homolog' | 'production';

export interface ObservabilityConfig {
  enabled: boolean;
  /** E.g.: https://ingest.us.signoz.cloud:443 (no /v1/... suffix). */
  endpoint: string;
  /** __SIGNOZ_INGESTION_KEY__ placeholder in the repo; the real value is injected by the pipeline. */
  ingestionKey: string;
  /** Identical across every environment — the environment itself goes in deployment.environment. */
  serviceName: string;
  serviceNamespace?: string;
  /** __APP_VERSION__ placeholder (vYYYYMMDD.HHMM), substituted by the pipeline. */
  serviceVersion?: string;
  environment: DeploymentEnvironment;
  /** Base URLs of this project's OWN API and Auth server. Never a third-party domain. */
  propagateTo: string[];
  /** Click spans. Turn off if nobody uses them (cost). */
  captureUserInteractions?: boolean;
}

const PLACEHOLDER = /^__.+__$/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Matches the exact base URL and its subpaths — "https://api.x.com" does NOT match "https://api.x.com.evil.com". */
function baseUrlPattern(url: string): RegExp {
  return new RegExp(`^${escapeRegExp(url.replace(/\/+$/, ''))}([/?#]|$)`, 'i');
}

@Injectable({ providedIn: 'root' })
export class TelemetryService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private initialized = false;

  initialize(): void {
    const cfg = (environment as { observability?: ObservabilityConfig }).observability;
    if (!this.isBrowser || this.initialized || !cfg?.enabled || !cfg.ingestionKey || PLACEHOLDER.test(cfg.ingestionKey)) return;

    try {
      const endpoint = cfg.endpoint.replace(/\/+$/, '');
      const attributes: Record<string, string> = {
        'service.name': cfg.serviceName,
        'service.version': cfg.serviceVersion && !PLACEHOLDER.test(cfg.serviceVersion) ? cfg.serviceVersion : 'unknown',
        'deployment.environment': cfg.environment,      // used by SigNoz's environment filters
        'deployment.environment.name': cfg.environment, // current OpenTelemetry semantic convention
      };
      if (cfg.serviceNamespace) attributes['service.namespace'] = cfg.serviceNamespace;

      const exporter = new OTLPTraceExporter({
        url: `${endpoint}/v1/traces`,
        headers: { 'signoz-ingestion-key': cfg.ingestionKey },
      });

      const provider = new WebTracerProvider({
        resource: resourceFromAttributes(attributes),
        spanProcessors: [new BatchSpanProcessor(exporter)],
      });
      provider.register({ contextManager: new ZoneContextManager() });

      const propagateTraceHeaderCorsUrls = cfg.propagateTo.filter(Boolean).map(baseUrlPattern);
      const ignoreUrls = [baseUrlPattern(endpoint)]; // don't instrument sending telemetry to itself

      registerInstrumentations({
        instrumentations: [
          new DocumentLoadInstrumentation(),
          ...(cfg.captureUserInteractions === false ? [] : [new UserInteractionInstrumentation()]),
          new FetchInstrumentation({ propagateTraceHeaderCorsUrls, ignoreUrls, clearTimingResources: true }),
          new XMLHttpRequestInstrumentation({ propagateTraceHeaderCorsUrls, ignoreUrls, clearTimingResources: true }),
        ],
      });

      this.initialized = true;
    } catch (error) {
      // Telemetry must never take the app down.
      console.warn('[telemetry] failed to initialize', error);
    }
  }
}
