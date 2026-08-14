# Port/dependencies/hook consistency audit — apps/admin, 2026-08-14

**Scope:** every `<thing>-port.hooks.ts` / `<thing>-dependencies.hooks.ts` / `use-<thing>.hooks.ts`
trio created or modified in `git log 1c30c1e..HEAD -- apps/admin/src` (15 commits). Read-only audit —
no source file was edited. Question asked: *given the ones that exist, are they consistent and
correct?* (Coverage — which hooks still lack a port — is `2026-08-14-class-d-port-coverage.md`,
a different report; not duplicated here.)

**Method:** every file below was read in full, not sampled. Two checks were run exhaustively rather
than spot-checked, because both are the kind of defect a green test suite does not surface: (1) a
multi-line-aware grep for a bare `api` binding (not `type api`) in every hook/dependencies file, to
confirm exactly one file per trio imports the real client; (2) every `useEffect`/`useCallback`/
`useMemo` call site in all 8 hook files, with its dependency array read and checked for `port`.

## Trios audited (8 — matches "eight agents")

| # | Feature | Port file | Hook |
|---|---|---|---|
| 1 | `ai-assistant` | `visitor-credential-form-port.hooks.ts` | `use-visitor-credential-form.hooks.ts` |
| 2 | `database` | `migrate-forward-section-port.hooks.ts` | `use-migrate-forward-section.hooks.ts` |
| 3 | `database` | `restore-points-section-port.hooks.ts` | `use-restore-points-section.hooks.ts` |
| 4 | `database` | `timeline-section-port.hooks.ts` | `use-timeline-section.hooks.ts` |
| 5 | `recovery` | `recovery-port.hooks.ts` | `use-recovery.hooks.ts` |
| 6 | `recovery` | `restore-flow-port.hooks.ts` | `use-restore-flow.hooks.ts` |
| 7 | `roles` | `roles-port.hooks.ts` | `use-roles.hooks.ts` |
| 8 | `users` | `users-port.hooks.ts` | `use-users.hooks.ts` |

Trios 7–8 are mine (this session's own batch); audited against the identical criteria as the other
six rather than assumed clean. `features/comments/hooks/use-comment-{queue,settings}.hooks.ts` and
`use-comments.hooks.ts` were also touched in this commit range (`1563c13`) but only to add a
component-side DI-seam prop to two already-ported sub-components — no port/dependencies file changed
and no hook logic changed, so they're out of this report's scope (checked, not just skipped).

---

## Two corrections to the brief's own examples

Both were named in the dispatch as known issues. Checked against HEAD; neither reproduces.

**1. The claimed "partial-seam" bug in `use-visitor-credential-form.hooks.ts` is not present at
HEAD.** The file imports `lib/api` once, type-only (`import type { SiteAssistantCredential,
SiteAssistantCredentialPatch }`, line 13). The one line that looks like a hit on a naive grep —
`await deps.api.setAssistantSiteCredential(patch)` (line 119, inside `saveVisitorCredential`) — is
`deps.api`, the **injected `VisitorCredentialFormPort` parameter**, not the module singleton; the
call site (line 379) passes `apiRef.current`, itself seeded from the `credentialPort` argument
`useVisitorCredentialForm` received. `AiAssistant.tsx` has no `api` import at all and composes the
seam correctly (`useVisitorCredentialFormHook = useWiredVisitorCredentialForm`, `AiAssistant.tsx:504`).
The other two hooks touched in the same commit (`use-admin-execution-mode.hooks.ts`,
`use-admin-assistant-switch.hooks.ts`) are pure/no-I/O by design and don't import `api` either.
Multi-line-aware grep (below) confirms zero bare `api` bindings in any of the three. If this bug was
real earlier today, it's already fixed by the current HEAD — but as written today's HEAD is clean.

**2. No `<thing>-list-port.hooks.ts` exists among today's 8 trios.** `git diff --name-status
1c30c1e..HEAD -- apps/admin/src | grep -i "list-port\|list-dependencies"` returns nothing. The
`-list-` naming variant does exist in the codebase (`features/posts/hooks/posts-list-port.hooks.ts`),
but that file predates `1c30c1e` and wasn't touched in this range — it's not one of the 8 trios in
scope, so it isn't naming drift *in today's batch*. All 8 audited trios name consistently (table
below, Finding 6).

---

## Severity: BUGS

**None found.** Both mandatory checks below were run against all 8 trios, not sampled.

### Check 1 — dep-array trap (`port` in a `useCallback`/`useEffect`/`useMemo` array)

Every dependency array in every hook file, enumerated:

| File | Effect/memo | Deps array | `port` present? |
|---|---|---|---|
| `use-visitor-credential-form.hooks.ts:266` | `useMemo` (preset) | `[config]` | No |
| `use-visitor-credential-form.hooks.ts:309` | `useEffect` (hydrate) | `[]` | No |
| `use-visitor-credential-form.hooks.ts:344` | `useEffect` (stored-key discovery) | `[stored?.isSet, baseUrl, protocol]` | No |
| `use-visitor-credential-form.hooks.ts:389` | `useMemo` (presetSuppliedEndpoint) | `[baseUrl]` | No |
| `use-visitor-credential-form.hooks.ts:400` | `useEffect` (debounced discovery) | `[apiKey, baseUrl, protocol, presetSuppliedEndpoint]` | No |
| `use-migrate-forward-section.hooks.ts` | — | no `useEffect`/`useCallback`/`useMemo` at all (all I/O via `useFetchMutation`) | n/a |
| `use-restore-points-section.hooks.ts` | — | same — all via `useFetchQuery`/`useFetchMutation` | n/a |
| `use-timeline-section.hooks.ts:153` | `useEffect` (filtersRef sync) | `[appliedFilters]` | No |
| `use-timeline-section.hooks.ts:159` | `useEffect` (moreCursor sync) | `[firstPage.data]` | No |
| `use-recovery.hooks.ts:78` | `useEffect(load, [])` | `[]` | No |
| `use-recovery.hooks.ts:83` | `useEffect` (deep-link resolve) | `[points]` | No |
| `use-restore-flow.hooks.ts:77` | `useEffect` (reset-on-point-change + disclosure fetch) | `[props.point.id]` | No |
| `use-roles.hooks.ts` | — | no raw effects (all via `useFetchQuery`/`useFetchMutation`) | n/a |
| `use-users.hooks.ts` | — | same | n/a |

Zero hits. Every hook either has no raw effect at all (routes I/O through `lib/fetch-query`, which
takes a fresh closure every render by contract and needs no memoized `port`), or keeps `port` out of
every array it does have. This is the check the brief called highest-value; it came back clean
everywhere.

### Check 2 — hook file still importing the real `api` singleton (partial seam)

Naive single-line greps under-count here (an import spanning multiple lines hides the binding from a
same-line pattern — the exact trap `2026-08-14-usewired-migration-catalog.md` §"Method lesson"
documents from its own scan). Re-run multi-line-aware, over every hook AND dependencies file in all 8
trios:

```
features/database/hooks/migrate-forward-section-dependencies.hooks.ts: VALUE import of api found
features/database/hooks/restore-points-section-dependencies.hooks.ts: VALUE import of api found
features/database/hooks/timeline-section-dependencies.hooks.ts: VALUE import of api found
features/recovery/hooks/recovery-dependencies.hooks.ts: VALUE import of api found
features/recovery/hooks/restore-flow-dependencies.hooks.ts: VALUE import of api found
features/ai-assistant/hooks/visitor-credential-form-dependencies.hooks.ts: VALUE import of api found
features/roles/hooks/roles-dependencies.hooks.ts: VALUE import of api found
features/users/hooks/users-dependencies.hooks.ts: VALUE import of api found
```

Exactly 8 hits — the 8 `*-dependencies.hooks.ts` files, and nothing else. No `use-*.hooks.ts` file in
any trio imports `api` as a value; every one of their `lib/api` imports is either `import type` or
the pure helper function `describeApiError` (not the client object — used identically to
`users/rules.ts`'s own import of the same helper, not a seam violation). Confirmed one-file-per-trio,
all 8.

### Port narrowing (criterion 1)

All 8 port files are single `import type { ... } from "…/lib/api"` lines, nothing else imported, and
every method matches something the hook actually calls (verified by reading each hook body against
its port interface) — none re-export a wider slice of the client than the hook uses.

---

## Severity: Convention drift

### Finding A — missing `@param`/`@returns` TSDoc tags (5 of 8 trios)

The brief requires "Explicit return types + TSDoc on every exported hook, with `@param`/`@returns`."
Return types are explicit everywhere (16/16 functions — every `useX`/`useWiredX` across all 8 trios
declares its return type; not one relies on inference). The tag requirement is where it splits:

| Trio | `useX` has `@param`/`@returns`? | `useWiredX` has `@returns`? |
|---|---|---|
| `use-visitor-credential-form.hooks.ts:241` (`useVisitorCredentialForm`) | **Yes** — `@param deps`, `@returns`, `@complexity` (lines 235–239) | **Yes** (line 511) |
| `use-migrate-forward-section.hooks.ts:68` (`useMigrateForwardSection`) | No — no doc comment above the function at all | No — `useWiredMigrateForwardSection` (line 148) has prose, no `@returns` tag |
| `use-restore-points-section.hooks.ts:45` (`useRestorePointsSection`) | No — none | No — `useWiredRestorePointsSection` (line 90) prose only |
| `use-timeline-section.hooks.ts:115` (`useTimelineSection`) | No — none | No — `useWiredTimelineSection` (line 213) prose only |
| `use-recovery.hooks.ts:59` (`useRecovery`) | No — none | No — `useWiredRecovery` (line 109) prose only |
| `use-restore-flow.hooks.ts:61` (`useRestoreFlow`) | No — none | Partial — `useWiredRestoreFlow` (line 168) has `@param props`, still no `@returns` |
| `use-roles.hooks.ts:170` (`useRoles`) | **Yes** | **Yes** |
| `use-users.hooks.ts:169` (`useUsers`) | **Yes** | **Yes** |

Not a bug — every file has substantial prose documentation, and `useMigrateForwardSection`/
`useRestorePointsSection`/`useTimelineSection`/`useRecovery`/`useRestoreFlow` all have file-level
`@file` headers explaining the same things `@param`/`@returns` would. But it's a real, repeated spec
deviation across 5 of 8 authors, worth a follow-up pass to add the tags for consistency with the
`@link`-based cross-referencing the fully-compliant three already use.

### Finding B — `useRestoreFlow`'s two-positional-argument shape

`use-restore-flow.hooks.ts:61`: `useRestoreFlow(props: { point: AdminRestorePoint }, port:
RestoreFlowPort)` — a business input as its own first argument, `port` as a bare second argument,
rather than the single `{ port }` (or `{ port, ...otherDeps }`) object every other trio in this audit
uses. This is NOT invented by this file: `features/forms/hooks/use-form-submissions.hooks.ts:60`
(`useFormSubmissions(props: { formId: string }, port: FormSubmissionsPort)`) is a real, pre-existing
precedent for exactly this shape, and `use-restore-flow.hooks.ts`'s own header cites it by name. Not a
finding against this specific file so much as a note that the codebase currently carries two accepted
dependency-argument shapes (`(deps)` and `(props, port)`) rather than one — worth a decision on
whether to standardize, not something any one agent today should be blamed for.

---

## Severity: Cosmetic

### Finding C — `use-recovery.hooks.ts:78` sidesteps `exhaustive-deps` via indirection

```ts
useEffect(load, []);
```

`load` is a named function declared in the hook body (closes over `port`/`t`/`locale`), passed to
`useEffect` by reference rather than as an inline arrow. ESLint's `react-hooks/exhaustive-deps` rule
only analyzes inline function expressions, so it cannot see `load`'s body and raises nothing here —
in effect the same outcome as an `eslint-disable-next-line` comment, but without one. Every other
`useEffect` in this audit that omits `port` from its deps (visitor-credential-form's discovery
effects, timeline-section, restore-flow) does so with an inline arrow, and two of them carry an
explicit `// eslint-disable-next-line react-hooks/exhaustive-deps` comment stating why. Behaviorally
this is fine — `[]` genuinely means mount-once, which is what `load` needs — but the pattern
obscures the same "was this omission reviewed" signal the explicit-disable convention exists to
answer. Smallest fix: inline the arrow and add the same disable-comment convention, or leave as-is
and note in the file header that the indirection is deliberate.

### Fake-port statefulness inventory (as requested, not itself a finding)

| Trio | Style |
|---|---|
| `users` (mine) | Stateful — mutates an in-memory `users` array, exposes it (`port.users`) |
| `roles` (mine) | Stateful — mutates `roles`/`policies` arrays, exposes both |
| `visitor-credential-form` | Stateful — mutates a closed-over `current` credential, exposes it via a getter |
| `restore-points-section` | Stateful — mutates `points`, exposes it |
| `timeline-section` | Static return + call-log (`calls`) — records requested filters/cursor per call for assertion, per its own doc: filter/cursor bookkeeping lives in the caller, not the port |
| `recovery` | Static `status`/`points` + call-log (`deepLinkCalls`) for the one write method |
| `migrate-forward-section` | Static — fixed/seeded return per call, no cross-call state (steps are mutually exclusive by construction in the hook, so nothing needs a state machine in the fake) |
| `restore-flow` | Static — same reasoning as migrate-forward-section, explicitly cross-referenced in its own doc comment |

Split: 3 stateful, 2 static+call-log, 2 pure-static. Both pure-static ones back a plan→confirm→execute
ceremony hook where the mutual-exclusion is enforced in the *hook*, not the port, so a stateless fake
is a correct match rather than a missed opportunity — noted per the brief's "not necessarily wrong,
but I want the inventory" instruction.

### Finding D — naming (criterion 6)

All 8 trios are fully consistent: `<thing>-port.hooks.ts` / `<thing>-dependencies.hooks.ts` /
`default<X>Port` / `createFake<X>Port`, "thing" matching the hook's own name in every case
(`visitor-credential-form`, `migrate-forward-section`, `restore-points-section`, `timeline-section`,
`recovery`, `restore-flow`, `roles`, `users`). Zero naming deviations found in this batch — see the
correction above regarding the one example named in the brief.

---

## Summary

- **Bugs: 0.** Both checks the brief flagged as highest-value (dep-array trap, partial-seam api
  import) were run exhaustively across all 8 trios and came back clean, including on the one file
  named as a known example — which is not reproducible at current HEAD.
- **Convention drift: 2.** Missing `@param`/`@returns` tags on 5/8 trios (Finding A); two accepted
  dependency-argument shapes coexisting in the codebase, not a defect in any one file (Finding B).
- **Cosmetic: 2.** One effect sidesteps lint analysis via named-function indirection instead of an
  explicit disable comment (Finding C); fake-statefulness inventory delivered as requested, no action
  implied (not Finding D — that's a clean-naming confirmation, not a defect).

No file was edited to produce this report.
