# `src/server/routes` complexity — patterns found, 2026-08-20

Handoff from the first refactor pass (98 → 62 violations) so the next agent reuses what was
learned instead of rediscovering it. Extracted from the agent's own commit bodies, which record
the technique per file.

## ⚠️ THE SINGLE BIGGEST LEVER: `?.` counts as a branch

ESLint's `complexity` rule counts **every optional-chaining `?.`** as a branch point, not just
`??` and `||`. **Two independent agents hit this today**, in different subtrees:

- routes: `registerAdminMediaUpdateRoute` was cyc 26 from `req.body?.field` repeated across
  seven fields. Fix: **read `req.body` ONCE into a local, then parse fields off the local.**
  Handler went to cyc 9 / cog 0.
- long-tail: an already-extracted flat merge helper in `src/media/provider-credential-store.ts`
  still failed at cyc 11 purely from five `?.` accesses. Extraction alone did nothing; it had to
  hoist the sealed/keyTail **pair** into one `resolveSealedKeyPair()`.

**Consequence:** for a FLAT_WIRING file (cyclomatic high, cognitive 0), extracting a function is
often useless — the branches move with the code. You must **collapse the accesses**, not relocate
them. Read the object once; resolve related fields as a unit.

This same pattern recurs in `menus/update-tree.ts` (six `req.body?.field` sites),
`users/write-policy-permission.ts`, and `database/timeline.ts` (six `req.query?.field` ternaries).

## Shared helpers that ALREADY EXIST — reuse, do not reinvent

| module | exports | use for |
|---|---|---|
| `admin/settings/shared.ts` | `SettingsErrorMapping`, `respondToSettingsError`, `SET_ERROR_MAPPINGS`, `CLEAR_ERROR_MAPPINGS` | table-driven instanceof→HTTP error mapping |
| `admin/redirects/shared.ts` | `RedirectErrorMapping`, `respondToRedirectError`, `REDIRECT_WRITE_ERROR_MAPPINGS` | same pattern, redirect write chokepoints |
| `admin/media/parse.ts` | `parseOptionalStringField`, `parseOptionalNullableField` | undefined-means-omitted vs null-means-clear body fields |
| `admin/assistant/execution-request-fields.ts` | `readOptionalString`, `SUPPORTED_EXECUTION_PROTOCOLS`, `validateSupportedProtocol` | protocol/baseUrl/apiKey/apiVersion parse+validate |

**The bar for adding a new shared helper was 2+ REAL consumers, not speculative reuse.** Keep it.

## The five recurring shapes, and the fix for each

1. **The instanceof error-mapper chain.** settings (×3 routes), redirects (×2), menus, users,
   media all carried their own 5-6 branch `if (err instanceof X) ... else if (err instanceof Y)`.
   Fix: a `{errorClass, status, code}` mapping table + one `respondToXError(res, err, mappings)`.
   A route with an extra case prepends its own mapping to the shared array
   (`update.ts` prepends `RedirectNotFoundError`).

2. **`req.body?.field` / `req.query?.field` repeated per field.** See the `?.` section above.
   Fix: read once into a local, extract `parseXRequestFields(body)`.

3. **for-loop with inline if/else-if per-field validation.** Fix: a
   `fieldName -> {ok, message}` lookup table, so the loop body is one call and a fifth field
   later does not grow the branching. Example: `validateExecutionCredentialField`.

4. **provided-vs-existing ternary merge across N fields.** Fix: extract a merge function, and
   **type it off the repo port's own return type** (e.g. `NewsletterCampaignRepoPort`'s
   `findById`) rather than hand-rolling an interface. Example: `mergeCampaignPatchFields`.

5. **An outcome object branched on inline to build its own HTTP response.** Fix: split the
   decision from the effect — `verifyApiKeyCandidate()` returns the outcome,
   `respondToVerifyFailure()` writes it, so the caller never re-nests on `outcome.kind`.

## Files already COMPLETED — do not redo

```
admin/assistant/execution-request-fields.ts   admin/assistant/list-models.ts
admin/assistant/put-execution-credential.ts   admin/assistant/test-connection.ts
admin/connectors/put-config.ts                admin/database/timeline.ts
admin/forms/update.ts                         admin/media/parse.ts
admin/media/update.ts                         admin/media/upload.ts
admin/menus/update-tree.ts                    admin/newsletter/update-campaign.ts
admin/plugins/deps.ts                         admin/plugins/set-enabled.ts
admin/plugins/uninstall.ts                    admin/redirects/create.ts
admin/redirects/shared.ts                     admin/redirects/update.ts
admin/settings/clear.ts                       admin/settings/register-definitions.ts
admin/settings/set.ts                         admin/settings/shared.ts
admin/users/write-policy-permission.ts        routes/types.ts
```

## Verification standard it held to

Every commit re-ran that file's own test suite before AND after, and reported the count
(e.g. "all 28 tests across admin-connectors-routes.test.ts and admin-connectors-oauth.test.ts
pass unchanged"). No behavior changes; every fix was a pure extraction, hoist, or table
substitution. Keep this standard — it is what makes a 60-file mechanical sweep trustworthy.

## Why the agent was rotated

Context reached ~400k with 62 violations left; continuing would have cost 600-700k. Work was
complete and committed at handoff. This is a cost rotation, not a quality problem.

---

## Pattern E — `.find()` loses the narrowing you need. Use `for...of` in a resolver.

Found 2026-08-20 while collapsing two structurally identical rate-limit guards in
`routes/members/sign-in.ts`. **The first thing anyone reaches for here is `.find()`, and it does
not typecheck.**

`Array.prototype.find`'s predicate narrows the value INSIDE the predicate, but that narrowing is
**not reflected in `.find()`'s return type** — it stays the original union element type. So:

```ts
// FAILS: `hit` is RateLimitResult, not the allowed:false branch,
// so `retryAfterSeconds` (which only exists on that branch) is a type error.
const hit = checks.find((c) => !c.result.allowed);
res.set("Retry-After", String(hit.result.retryAfterSeconds));
```

TypeScript does have a type-predicate overload (`find<S extends T>(p: (v: T) => v is S): S | undefined`),
but a plain boolean predicate like `!c.result.allowed` does not produce one, so you get the wide type.

**Fix — a plain `for...of` inside a dedicated resolver function**, where narrowing works normally:

```ts
function findExceededRateLimit(checks: readonly Check[]): Exceeded | undefined {
  for (const check of checks) {
    if (!check.result.allowed) return { ...check, result: check.result };
  }
  return undefined;
}
```

This matters specifically because "collapse N repeated guard blocks into one array + one lookup" is
**the** move for FLAT_WIRING files (Pattern C's territory), so this trap sits directly in the path
of the technique this doc recommends most.

### The rest of the closing pass, for reference

| file | before | after | technique |
|---|--:|--:|---|
| `members/sign-in.ts` | cyc 11 | cyc 9 | `findExceededRateLimit` + read `req.body` once |
| `site/comments-submit.ts` | cyc 11 | cyc 3 | `buildCommentSubmission` typed against the real `CommentSubmission` port type, `buildIngressContext` split out so neither helper sits ON the ceiling |
| `site/media-rendition.ts` | cyc 11 | cyc 8 | `resolveTransformSpec` returning `{transformName, version}` or `{errorMessage}`, narrowed via `"errorMessage" in parsed` |

Two details worth copying: the helper was typed against the **existing port type** rather than a
hand-rolled interface, and helpers were split so none landed exactly ON 9 — leaving no headroom for
the next edit is how a file returns to the debt list a week later.

**`src/server/routes` finished at 0 violations** (excluding `admin/plugins/uninstall.ts`, owned by a
concurrent session and deliberately untouched), down from 98.
