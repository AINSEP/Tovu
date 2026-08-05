# Finding: model-discovery effect transmits the saved API key on every baseUrl keystroke

**Date:** 2026-08-04
**Status:** CONFIRMED by Coordinator (read of source, both repos). NOT FIXED.
**Severity:** moderate-to-high — credential transmission to unintended hosts.
**Origin:** surfaced by the `byok-audit-provider` agent as a debounce//"request spam" observation
while working item #9 (Azure). The Coordinator escalated the framing after verifying the payload.

## Where

`Jini/packages/ui/src/features/execution/react/components/ExecutionTab.tsx`

```
112    loadModels(config.byok);
114  }, [config.mode, port, loadModels, config.byok.protocol, config.byok.baseUrl, config.byok.providerId]);
```

`config.byok.baseUrl` is a dependency, there is no debounce, and the call passes the **entire**
`ByokConfig` — `loadModels: (config: ByokConfig) => void`
(`packages/ui/src/features/execution/react/hooks/useExecutionTab.ts:36`), which carries `apiKey`.

**Note this lives in Jini, not Tovu.** A fix is a cross-repo change.

## Why the original framing understated it

The agent reported this as "fires one POST per keystroke — harmless for azure (short-circuits
before egress), but would spam a REAL provider for other protocols." That is true and is a real
rate-limit/noise problem. It is not the main problem.

`apiKey` is **not** in the dependency array, so typing the *key* does not re-fire. But the key is
read at fire time from `config.byok`. The consequence is:

> **Key already saved + operator edits `baseUrl` ⇒ the real API key is sent to every intermediate
> prefix of the hostname being typed.**

Typing `https://api.example.com` transmits the key to `https://a`, `https://ap`, `https://api`, …
Each prefix that happens to resolve is a distinct third party that receives a live credential the
operator never intended to send it. Pasting is safe; typing is not.

This composes badly with an already-recorded design decision: the SSRF guard **allows loopback with
no port restriction** by design (`development/e2e/byok-ssrf-guard.spec.ts`, "the real blast
radius"). Prefixes of a typed `http://localhost:NNNN` therefore reach a walk of local ports with the
key attached.

## Why Azure made it visible

Azure's preset ships a **blank** default `baseUrl` where every other preset pre-fills one, so
selecting Azure forces the operator to type a full endpoint from scratch — 30+ requests for a
38-char URL, measured live by the agent. Azure itself short-circuits before egress, so Azure is the
one protocol where this is harmless. It is the messenger, not the bug.

## Status of test coverage

Pinned as KNOWN-BAD (current over-eager behavior, explicitly not fixed) in the last describe block
of `development/e2e/byok-azure-path.spec.ts`, which is 6/6 green. That spec pins the
*request-count* behavior. The *credential-transmission* consequence is routed to the
`byok-audit-state` agent under audit item #6 (key handling + leakage) for its own regression spec.

## Not yet answered

- Does `redactSecrets` cover any error surfaced from one of these prefix requests?
- Is there any upper bound / cancellation on in-flight discovery requests, or do all 30 race?
- Correct fix shape: debounce, drop `apiKey` from the discovery payload, require an explicit
  "discover" action, or gate the effect on a committed/blurred `baseUrl`. Owner decision — see
  the handoff's §8.
