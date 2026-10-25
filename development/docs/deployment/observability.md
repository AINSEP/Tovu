# Observability: sending Tovu traces to Datadog or Grafana

Tovu exports OpenTelemetry traces over OTLP/HTTP through the **`observability-opentelemetry`
provider plugin** (from `@jini-ai/provider-plugins`). It is **off by default** and costs nothing
while off: Tovu core contains no OTel SDK, and the DB kernel and HTTP clients are not wrapped. Since
2026-10-25 the `OTEL_*` environment variables no longer turn it on.

To turn it on (all three are required; checked at boot, before the site serves requests):

1. **Install** the plugin folder (`plugins/observability-opentelemetry/<version>/` from the
   `@jini-ai/provider-plugins` package) through the admin Plugins screen.
2. **Enable** it.
3. **Configure** its key card: save an API credential labelled exactly
   `plugin:observability-opentelemetry` with
   - Base URL: the collector's OTLP/HTTP endpoint (`/v1/traces` is appended);
   - Token: the collector's credential; with a Username it is sent as HTTP Basic
     (`username:token`), otherwise as `Authorization: Bearer <token>`.

Restart the site after enabling (a provider plugin initializes once, at boot); disabling it stops
export at once. The service name on every span is `tovu`. A Sentry error tracker
(`observability-sentry`, card `plugin:observability-sentry`, Token = the DSN) can run alongside;
both receive every signal.

## What is traced

| Span | Kind | Name | Key attributes |
| --- | --- | --- | --- |
| Inbound request | server | `GET /api/admin/posts/:id` | `http.route`, `http.status_code`, `http.target` (path, redacted) |
| DB query (kernel `run`/`transaction`/`query`/`execute`) | client | `SELECT posts`, `TRANSACTION` | `db.system.name`, `db.operation.name`, `db.collection.name` |
| Outbound HTTP (guarded clients: mail APIs, custom credentials, media import, publish peers, deploy ops) | client | `POST api.example.com` | `http.request.method`, `server.address`, `server.port`, `url.scheme`, `http.response.status_code` |
| Admin-chat agent run (API-side finalizer) | internal, own trace | `invoke_agent` | `agent.run.id`, `agent.run.status`, `gen_ai.conversation.id` |
| Static publish run | internal | `site.publish` | `publish.target`, `operation.outcome` (`published` or the failure code) |
| Background outbox delivery | internal | `outbox.deliver` | `event.name`, `operation.outcome` |

DB and outbound spans made while serving a request are children of that request's span. Errors set
span status ERROR, `error.type`, and an `exception` event (type only). Outbound 4xx/5xx and
`failed`/`interrupted` runs are errors; inbound only 5xx.

**Never exported:** SQL text or bound values, URL paths/query strings/userinfo of outbound calls,
query strings of inbound requests, request/response bodies, headers, error messages.
Secret-shaped values in an inbound path (vendor keys, JWTs) are blanked. Ids and route templates
are kept.

## Datadog

Enable OTLP ingest on the Datadog Agent (`DD_OTLP_CONFIG_RECEIVER_PROTOCOLS_HTTP_ENDPOINT=0.0.0.0:4318`),
then set the plugin card's Base URL to the Agent: `http://datadog-agent:4318`.

## Grafana

Through Alloy or a Tempo OTLP receiver: Base URL `http://alloy:4318`.

Grafana Cloud (OTLP gateway, from the stack's "OpenTelemetry" tile): Base URL
`https://otlp-gateway-<zone>.grafana.net/otlp`, Username = the instance id, Token = the access token.

## Not covered yet

Admin browser timings and Web Vitals (no browser export path), BYOK/AG-UI runs (not watched by the
finalizer), and the agent daemon process itself. Raw `fetch` calls outside the guarded clients
(deploy host kit, source control, S3, the daemon loopback) are not traced.
