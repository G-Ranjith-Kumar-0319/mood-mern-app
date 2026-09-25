/**
 * OpenTelemetry tracing — loaded *before* the app with `node --import ./dist/instrumentation.js`.
 *
 * Instrumentations work by patching libraries (http, express, mongodb…) as they
 * are imported, so this file must run first. For ES modules that also needs a
 * loader hook, registered with `module.register`.
 *
 * Opt-in: without OTEL_EXPORTER_OTLP_ENDPOINT this file does nothing, so there is
 * zero overhead unless you run a collector (e.g. Jaeger in the observability profile).
 */
import { register } from 'node:module';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (endpoint) {
  register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);

  const [
    { NodeSDK },
    { OTLPTraceExporter },
    { resourceFromAttributes },
    { ATTR_SERVICE_NAME },
    { HttpInstrumentation },
    { ExpressInstrumentation },
    { MongoDBInstrumentation },
    { MongooseInstrumentation },
    { PinoInstrumentation },
    { RedisInstrumentation },
  ] = await Promise.all([
    import('@opentelemetry/sdk-node'),
    import('@opentelemetry/exporter-trace-otlp-http'),
    import('@opentelemetry/resources'),
    import('@opentelemetry/semantic-conventions'),
    import('@opentelemetry/instrumentation-http'),
    import('@opentelemetry/instrumentation-express'),
    import('@opentelemetry/instrumentation-mongodb'),
    import('@opentelemetry/instrumentation-mongoose'),
    import('@opentelemetry/instrumentation-pino'),
    import('@opentelemetry/instrumentation-redis'),
  ]);

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'expression-api',
    }),
    // Reads OTEL_EXPORTER_OTLP_ENDPOINT (e.g. http://jaeger:4318) and appends /v1/traces.
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      new HttpInstrumentation({
        // Probes and scrapes every few seconds would drown the real traffic.
        ignoreIncomingRequestHook: (request) =>
          /^\/(api\/v1\/health|metrics)/.test(request.url ?? ''),
      }),
      new ExpressInstrumentation(),
      new MongoDBInstrumentation(),
      new MongooseInstrumentation(),
      // Adds trace_id/span_id to every log line, linking logs and traces.
      new PinoInstrumentation(),
      new RedisInstrumentation(),
    ],
  });
  sdk.start();

  // Flush buffered spans before the process exits.
  const shutdown = () => void sdk.shutdown().catch(() => undefined);
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
