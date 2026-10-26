Code Inspection(Review): **Code Inspection + Security** personas loaded for correctness, lifecycle, consent, and secrets review.

Reviewed `0f99fd440` → `c45c14251`. **Five Required findings:**

1. **High — Configured providers cannot boot.** `apps/website/src/server/runtime/composition/deps.ts:1997` loads providers before `const routeDeps` initializes at :2249. SDK construction calls `getPluginHost()` (:1237; `plugin-runtime.ts:369`), triggering a temporal-dead-zone `ReferenceError`; providers fall back to noop. **Smallest fix:** defer the lookup or inject an already-constructed lookup dependency.

2. **High — Disabled providers remain callable.** `apps/website/src/server/runtime/composition/provider-plugins.ts:162` retains `lease.port` and discards `lease.isCurrent()`. Disable/quarantine disposes resources, but composed ports still forward subsequent events to them. **Smallest fix:** retain leases and gate new calls on `isCurrent()`, returning the contract’s noop behavior after retirement.

3. **Medium — Required site attribution is missing.** `apps/website/src/server/runtime/composition/provider-plugins.ts:59` supplies service identity and credentials, without site id/slug, environment, or project id. Once boot works, OTel resources, PostHog events, and Langfuse metadata cannot reliably distinguish sites sharing a backend. **Smallest fix:** inject site identity at composition and carry it through provider resource attributes, event properties/groups, and trace metadata.

4. **Medium — Provider loading is unbounded.** `apps/website/src/server/runtime/composition/provider-plugins.ts:152` awaits plugin import/setup before creating the host’s initialization timeout. A stalled import or asynchronous setup blocks site boot indefinitely. **Smallest fix:** bound each load and revoke its selection on timeout so late setup cannot publish contributions.

5. **Medium — Plugin settings cards remain unfinished.** `apps/website/src/server/runtime/composition/deps.ts:1999` resolves generic credentials by `plugin:<id>` labels; :2751 exposes mail credential cards only. Owners cannot configure these providers through their required plugin settings cards. **Smallest fix:** connect code-plugin settings cards to the existing sealed vault and inject those saved values into factories.

Static checks confirmed principal IDs on all five owner-action captures, consent-guarded analytics delivery, shutdown disposal registration, HTTP/assistant/publish/outbox instrumentation, the SDK `providers` type, and removal of old production subpath wiring.

No edits, tests, or servers. CCN and step-0e test results were not independently verified.
