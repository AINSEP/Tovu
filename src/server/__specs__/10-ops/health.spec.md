# Spec: Health Route

## Goal

Provide a lightweight operational route that confirms the server process is alive without exercising domain mutations or depending on feature-specific state.

## Endpoint

`GET /health`

## Contract

### Current Minimum

The route returns:

```json
{ "ok": true }
```

with HTTP `200`.

### Future Extension

As the platform grows, `GET /health` remains a liveness check only. Richer readiness checks should move to a separate readiness surface rather than making `/health` expensive or brittle.

## Rules

- No authentication is required.
- The route must not trigger domain writes.
- The route must not flush the outbox.
- The route must not fail because a non-critical feature module is unavailable.
- In safe mode, this route must still succeed if the process is able to accept operator traffic.

## Failure Behavior

- If the transport runtime itself cannot respond, the route effectively fails by process unavailability.
- If a future readiness route is added, it may return `503`; `/health` should not become the readiness route by accident.

## Acceptance Checks

- `/health` responds in all normal runtime modes.
- `/health` does not require database mutation capability.
- `/health` remains independent of workspace lifecycle state.

## Non-goals (current)

- Deep adapter dependency checks
- Background worker health
- Extension compatibility status
