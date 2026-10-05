# Observability: sending Tovu traces to Datadog or Grafana

Tovu exports OpenTelemetry traces over OTLP/HTTP. It is **off by default** and costs nothing while
off: no SDK is loaded, the DB kernel and HTTP clients are not wrapped. Setting an OTLP endpoint turns
it on. There is no vendor-specific code; configuration is the standard `OTEL_*` variables.

| Variable | Meaning |
| --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collector base URL. `/v1/traces` is appended. |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | Full traces URL, used as is. Wins over the base. |
| `OTEL_EXPORTER_OTLP_HEADERS` | `key=value,...` sent with every export (auth). URL-encode spaces as `%20`. |
| `OTEL_SERVICE_NAME` | Service name on every span. Default `tovu`. |

## What is traced

| Span | Kind | Name | Key attributes |
| --- | --- | --- | --- |
| Inbound request | server | `GET /api/admin/posts/:id` | `http.route`, `http.status_code`, `http.target` (path, redacted) |
| DB query (kernel `run`/`transaction`/`query`/`execute`) | client | `SELECT posts`, `TRANSACTION` | `db.system.name`, `db.operation.name`, `db.collection.name` |
| Outbound HTTP (guarded clients: mail APIs, custom credentials, media import, publish peers, deploy ops) | client | `POST api.example.com` | `http.request.method`, `server.address`, `server.port`, `url.scheme`, `http.response.status_code` |
| Admin-chat agent run (API-side finalizer) | internal, own trace | `invoke_agent` | `agent.run.id`, `agent.run.status`, `gen_ai.conversation.id` |

DB and outbound spans made while serving a request are children of that request's span. Errors set
span status ERROR, `error.type`, and an `exception` event (type only). Outbound 4xx/5xx and
`failed`/`interrupted` runs are errors; inbound only 5xx.

**Never exported:** SQL text or bound values, URL paths/query strings/userinfo of outbound calls,
query strings of inbound requests, request/response bodies, headers, error messages.
Secret-shaped values in an inbound path (vendor keys, JWTs) are blanked. Ids and route templates
are kept.

## Datadog

Enable OTLP ingest on the Datadog Agent (`DD_OTLP_CONFIG_RECEIVER_PROTOCOLS_HTTP_ENDPOINT=0.0.0.0:4318`),
then point Tovu at the Agent:

```
OTEL_EXPORTER_OTLP_ENDPOINT=http://datadog-agent:4318
OTEL_SERVICE_NAME=tovu
```

## Grafana

Through Alloy or a Tempo OTLP receiver: `OTEL_EXPORTER_OTLP_ENDPOINT=http://alloy:4318`.

Grafana Cloud (OTLP gateway, from the stack's "OpenTelemetry" tile):

```
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-<zone>.grafana.net/otlp
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic%20<base64 instanceId:token>
```

## Not covered yet

Admin browser timings and Web Vitals (no browser export path), BYOK/AG-UI runs (not watched by the
finalizer), and the agent daemon process itself. Raw `fetch` calls outside the guarded clients
(deploy host kit, source control, S3, the daemon loopback) are not traced.
