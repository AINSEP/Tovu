Code Inspection(Review Mode): Personas used: code-inspection, security, tdd.

Reviewed `review/cov-J1` at `83fbafa6`. Findings are source-verified; no tests, builds, or modifying commands were run.

| Sev | repo:file:line | Problem | Concrete fix |
|---|---|---|---|
| HIGH | `jini:packages/chat/src/core/user-text-redaction.ts:28` | Removing the Slack rule weakens credential protection. Diagnostics actually reuses `SECRET_SHAPE_PATTERNS`, whose Slack lookbehind rejects a preceding hyphen (`packages/core/src/redact.ts:59`). Thus a token in `https://example.test/-xoxb-<example-token: 12 digits-12 digits-24 letters>` survives; the entropy fallback explicitly exempts URLs. The previous chat rule caught it. This boundary feeds SQL storage and model history. | Restore the additional rule until the shared implementation covers its behavior. Add regression cases for hyphen-prefixed tokens inside URLs, asserting complete removal and the redaction signal. |
| MEDIUM | `jini:packages/agent-runtime/src/skills/web-clone/scripts/asset-harvest.mjs:261` | Font-CSS assembly removed the per-file recovery catch. A downloaded stylesheet becoming unreadable now aborts harvesting before `asset-manifest.json` is written, discarding the mapping for otherwise successful downloads. Previously that stylesheet was skipped and processing continued. | Restore per-stylesheet recovery while retaining readable CSS and recon font-face rules. Verify that an injected read failure still produces the manifest. |
| MEDIUM | `jini:packages/agent-runtime/src/skills/web-clone/scripts/lib/main-guard.mjs:39` | New public APIs violate the mandated two-object signature: this export takes three arguments, including positional values. Newly exported script helpers repeat this; `loadAnthropicLiveModels` also adds a fourth argument (`anthropic-live-models.ts:166`). | Use `(requiredObj, optionalObj = {})` for the new or materially changed boundaries and update their callers. |

**Rules check** — assessed against changed product code:

- Plugins never import each other: **OK**; no new cross-plugin import found.
- Generic code in Jini, site-specific code in Tovu: **OK**.
- Two-object API signatures: **violated**, `lib/main-guard.mjs:39`.
- Dependencies injected as ports: **OK** for the introduced seams.
- React data supplied through props: **OK**; no new violation found.
- Cyclomatic complexity ≤10: **UNVERIFIED**; no analyzer execution permitted.
- Existing “why” comments preserved: **OK**; inspected rationale was retained or moved.
- Schema changes through ADR-066 TypeScript migrations: **OK**; no schema changes.
- No data loss: **OK** for persistent storage; harvest output recovery regresses as reported above.
- No unflagged `TEMP: replaced by shared helper`: **OK**; no matches under `packages/`.

**Verdict: MERGEABLE AFTER FIXES** — restore credential protection and harvest recovery, and correct the API boundary violations.
