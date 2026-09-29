// Merge into EVERY src/environments/environment*.ts (per-environment values). __X__ placeholders are
// substituted by the pipeline — never commit a real key. Locally: enabled=false (or a dev key kept out of git).
export const environment = {
  // ...existing properties (apiUrl etc.)...
  observability: {
    enabled: true,
    endpoint: 'https://ingest.__REGION__.signoz.cloud:443',
    ingestionKey: '__SIGNOZ_INGESTION_KEY__',
    serviceName: '__SERVICE_NAME__',          // e.g. intranet-ui — IDENTICAL across every environment
    serviceNamespace: '__SERVICE_NAMESPACE__', // e.g. intranet
    serviceVersion: '__APP_VERSION__',         // vYYYYMMDD.HHMM
    environment: 'production' as const,        // development | homolog | production
    propagateTo: ['https://api.example.com', 'https://auth.example.com'], // OWN API/Auth server ONLY
    captureUserInteractions: true,
  },
  support: {
    email: 'support@example.com',
    ticketUrl: '',
  },
};
