---
name: opentelemetry
description: Connect the site's traces to an OpenTelemetry backend such as Grafana Cloud or Honeycomb. Use when the person says "set up OpenTelemetry", "send traces to Grafana", "connect Honeycomb", "add tracing" or "add observability", or asks whether tracing is working.
---

# OpenTelemetry (Grafana Cloud, Honeycomb…)

Tovu exports traces through its OpenTelemetry provider plugin, `observability-opentelemetry`, to any
OTLP/HTTP endpoint. This plugin only knows how to set it up; it holds no key and runs no code.

It is part of `observability-opentelemetry` and turns on and off with it: there is no separate switch for this plugin.

## Set it up

1. Check status: `provider_status {pluginId:"observability-opentelemetry"}`.
   - Not listed: the provider plugin is not installed. Say so in one line; `plugins_list` shows what is.
   - `enabled: false`: offer `plugins_set_enabled {family:"site-runtime", pluginId:"observability-opentelemetry", enabled:true}`.
   - `configured: true`: say it is already connected. Open the card again only if they ask to change it.
2. Say in one sentence what the card is for, then open it:
   `credential_save {kind:"plugin-provider", target:"opentelemetry"}`.
3. What goes in each field:
   - **Grafana Cloud:** your stack → OpenTelemetry → Configure. Endpoint like
     `https://otlp-gateway-prod-us-east-0.grafana.net/otlp`, Username = the instance ID (a number),
     Token = the access-policy token it creates. Tovu builds the Basic auth header; no base64 by hand.
   - **Honeycomb:** endpoint `https://api.honeycomb.io`, Username and Token blank, Extra headers
     `x-honeycomb-team=<ingest API key>` (Honeycomb reads its key from that header).
   - **Anything else:** its OTLP/HTTP base URL; traces go to `/v1/traces` under it.
4. After it saves: saved for every site in this project; takes effect the next time the site starts.

## Rules

- Never ask for a token in chat and never put one in any tool argument. The card is the only way in.
- Changing the endpoint or username needs the saved token and extra headers entered again; the card says so if they try.
