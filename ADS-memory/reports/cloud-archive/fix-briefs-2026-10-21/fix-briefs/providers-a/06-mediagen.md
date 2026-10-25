Code Inspection(Review): Personas used: code-inspection, security, tdd.

| Sev | repo:file:line | Problem | Concrete fix |
|---|---|---|---|
| HIGH | `jini:packages/integrations/src/media-providers/dispatch/media-provider-registry.ts:95` | Collision checks allow different vendors to reuse a model ID across surfaces, but `findModel` selects globally by ID at line 138. A plugin video model named `gpt-image-2` therefore resolves to OpenAI during dispatch. Plugin `order: -1` can reverse the misrouting. | Reject model IDs owned by another provider across all surfaces, or make lookup surface-aware throughout dispatch and credential selection. Extend the cross-route test at `dispatch/__tests__/media-provider-registry.test.ts:141` to verify dispatch. |
| HIGH | `tovu:apps/website/src/features/media/provider-credential-store.ts:385` | Omitted plugin credentials survive only while their provider remains registered. Disable the plugin and restart, or encounter a loader fault, then save the built-in admin form: the stored plugin key is deleted. | Preserve omitted non-built-in rows independently of registry availability; require explicit deletion. Test saving after the provider disappears from the registry. |
| HIGH | `jini:packages/integrations/src/media-providers/dispatch/media-provider-registry.ts:75` | `models: [undefined]` passes validation because `.find()` returns `undefined` both for that invalid element and for no match. Collision validation then dereferences it and throws. Tovu contributes outside its recovery block at `media-provider-registry.ts:66`, so malformed plugin data can fail boot. | Validate every model with a predicate that distinguishes invalid elements from absence. Assert refusal without throwing, then verify subsequent valid contributions still load. |
| MEDIUM | `tovu:apps/website/src/features/media-generation/media-provider-registry.ts:43` | The contribution definition supplies no per-plugin read/import recovery policy. A manifest read fault or module containment I/O fault propagates to the outer catch, discarding every otherwise valid plugin provider. | Supply `onReadError` and `importErrorReason` through the existing loader. Test valid providers before and after a faulty contribution. |
| MEDIUM | `tovu:apps/website/src/features/media-generation/media-provider-registry.ts:98` | New public APIs violate the mandated two-object signature: `parseMediaProvidersFile(raw)` takes a scalar; `imageModelIdsFrom` and `buildMediaGenerationAgentToolCatalog` also omit the optional object (`agent-tools.ts:81`, `:129`). | Use `(requiredObj, optionalObj = {})`, including `{ raw }` for parsing, and update callers. |

**Rules check**

- Plugins never import each other: **OK**.
- Generic code in Jini; site-specific wiring in Tovu: **OK**.
- API signatures `(requiredObj, optionalObj = {})`: **violated**, locations above.
- Dependencies injected as ports: **OK**.
- React components receive data through props: **OK** — no component changes.
- Cyclomatic complexity ≤10: **OK by manual inspection**; mechanical measurement not run.
- Existing “why” comments preserved or updated: **OK**.
- Schema changes only through ADR-066 TypeScript migrations: **OK** — no schema changes.
- No data loss: **violated**, `provider-credential-store.ts:385`.
- `// TEMP: replaced by shared helper`: **OK** — none added.

Static review only; no tests, builds, installs, servers, or browsers run. Architecture sections 13 and 14 were unavailable at the supplied paths and reviewed tip.

**Verdict: MERGEABLE AFTER FIXES** — provider misrouting, credential deletion, and malformed-contribution boot failure require correction.
