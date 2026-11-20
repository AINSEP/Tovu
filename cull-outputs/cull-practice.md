# Cull of r62t-practice (§N engineering practice, one folder per AI CLI/vendor, 72 model ids)

Input `cull-inputs/designs/r62t-practice.md`. Base Tovu `776ce6d0f` (merge-6), Jini `d3e78b387` (merge-6). Read-only; checked with `git show` and single-symbol `git grep`.

**Counts (5 READY sheets → 4 after the merge):** **KEEP 2** (N-audit-J, N-age-leaves-T) · **CUT-TO 2** (N-audit-T absorbs N-audit-desktop-T; M-Q3-T) · DROP 0 · **NEEDS-DECISION 4** · **BLOCKED 7** (K-R8, K-Codex, K-Claude, K-OpenCode, K-Antigravity, K-Pi, K-Gemini, all on R8b) · **CLOUD 2** (K-vendors/M-Q4; M-Q3-T golden refresh). Agree with every RETIRE row (spot-checked below).

## Verdicts

| Sheet | Verdict | Base | Reason |
|---|---|---|---|
| N-audit-J (Jini CI) | **KEEP** | merge-6 | `ci.yml:61` is `pnpm install --frozen-lockfile`. There is no `audit` step anywhere in Jini CI. One report-only step. Cut the "mutation" (CI YAML has no test; the combine reads the first CI log). |
| N-age-leaves-T (Tovu) | **KEEP** | merge-6 | Root `.npmrc:2–3` holds the policy. `apps/{admin,desktop,site-chat}/.npmrc` do not exist, and npm reads the project `.npmrc` at the install prefix, not the repo root. Three copied two-line files. Acceptance (a young version refused) needs installs, so it is a combine check. |
| N-audit-T + N-audit-desktop-T (Tovu CI) | **CUT-TO** (one sheet) | merge-6 | Same change in two workflow files, so one sheet. Anchors hold (`ci.yml:85` root `npm ci`; `desktop.yml:79–80` desktop install). Cut both "mutations" ("verify the scope check detects the duplicate root audit"): no such scope check exists. Place the root steps **before** the `GATES BELOW ARE continue-on-error + id` comment block (`ci.yml:87–90`), and give them **no `id:`**, so the Gate summary never counts them. |
| M-Q3-T (Tovu media) | **CUT-TO** | merge-6 (golden refresh: needs `r62t-tests` repair) | Bug confirmed (BUGS 1). Keep the design's fix: one marker read and a catalog-order match, with no decrypt. Cut the tests to **one** case (the explicit-model path is unchanged and already covered). The `moved-tools.golden.json` byte refresh is a combine step after the `r62t-tests` repair, not executor work. |
| K-R8 / K-Codex | **BLOCKED** on R8b (+ CLOUD for the `smol-toml` dependency move) | — | Agree. |
| K-Claude / K-OpenCode / K-Antigravity / K-Pi / K-Gemini | **BLOCKED** on R8b | — | Agree with the moves of daemon `agent-executor/<cli>/*` into `agent-runtime/src/defs/<cli>/`. **Cut** "consolidate `defs/<cli>.ts` into `defs/<cli>/index.ts`". All ~30 defs use the `x.ts` + `x/` pair (`defs/` tree), so renaming five of them is churn that breaks the pattern (NEEDS-DECISION 1). **Cut** the AIHubMix "one provider implementation" idea (speculative). **Gap:** the inventory omits daemon `agent-executor/mimo/constants.ts` (imported by `mcp-bridge.ts:6`). It moves with the OpenCode/MiMo env-merge unit. |
| K-vendors / M-Q4 | **CLOUD** | after R7 | Agree on the move to `provider-plugins/src/xai/`. **Split** M-Q4 (a saved search model in the connect card + removing `DEFAULT_SEARCH_MODEL = 'grok-4.20-reasoning'`, `http/xai.ts:162,254,737`) out of the move. A move changes no behaviour; M-Q4 is a feature with a new failure mode (NEEDS-DECISION 3). |
| M-Nano-renderer | NEEDS-DECISION | — | See below. |
| 72 model-id hits | agree RETIRE | — | 66 agent-runtime CLI fallback catalogs + 5 integrations catalog/capability rows are data owned by their CLI or provider; only `nanobanana.ts:35` is a runtime fallback. |
| N-age-root, N-API, N-property, N-SAST, N-Renovate, M-catalog/alias | agree RETIRE | — | Checked: Jini `package.json:13–14` (`api:check/update`), `ci.yml:78` (`pnpm api:check`), `ci.yml:162` (`quality:properties`), `ci.yml:227` (semgrep), `pnpm-workspace.yaml:28–30` (14-day age + `@jini-ai/*` exclusion). |

## Exact cut text

### N-audit-J · Jini · merge-6
"In `.github/workflows/ci.yml`, job `quality-gates`, insert right after `- run: pnpm install --frozen-lockfile` (`:61`):
```yaml
      - name: Dependency audit (report-only)
        run: pnpm audit
        continue-on-error: true
```
Nothing else. No `id:`."

### N-age-leaves-T · Tovu · merge-6
"Create `apps/admin/.npmrc`, `apps/desktop/.npmrc` and `apps/site-chat/.npmrc`, each holding exactly root `.npmrc` lines 1–3 (comment + `min-release-age=14` + `min-release-age-exclude[]=@jini-ai/*`). No lock edits."

### N-audit-T · Tovu · merge-6 (absorbs N-audit-desktop-T)
"In `.github/workflows/ci.yml`, right after the `Install root dependencies` step (`run: npm ci`, `:85`) and **before** the `GATES BELOW ARE …` comment, insert three steps. Each has `run: npm audit --package-lock-only` and `continue-on-error: true`, and none has an `id:`:
- `name: Dependency audit (root)`
- `name: Dependency audit (admin)` with `working-directory: apps/admin`
- `name: Dependency audit (site chat)` with `working-directory: apps/site-chat`

In `.github/workflows/desktop.yml`, right after `Install desktop dependencies` (`:79–80`), insert `name: Dependency audit (desktop)`, `working-directory: apps/desktop`, `run: npm audit --package-lock-only`, `continue-on-error: true`. No other edits."

### M-Q3-T · Tovu · merge-6
"In `apps/website/src/features/media-generation/tool-registrations.ts`:
- Add `getMediaProviderCredentials,` to the existing `from "../media/index.js"` import list.
- In `resolveDefaultImageModel`, before `const checkedProviders`, add:
```ts
  const saved = await getMediaProviderCredentials({ repo: routeDeps.mediaProviderCredentialRepo }, { workspaceId: routeDeps.workspaceId });
  const savedModel = imageModelIds.find((id) => {
    const entry = saved[routeDeps.mediaProviderRegistry.findModel({ id })?.provider ?? ""];
    return entry?.apiKeyConfigured === true && entry.model === id;
  });
  if (savedModel) return savedModel;
```
Add one sentence to its doc: `A saved credential's own image model (Admin -> Media providers) wins first, in catalog order.` Leave the rest of the function, `requireImageModel` and the dispatch unchanged.
- In `agent-tools.ts` (`model` description, `:51`), replace `"When omitted, the first model in this list whose vendor has a credential configured is used; if no vendor "` with `"When omitted, the model saved with a vendor's credential is used; otherwise the first model in this list whose vendor has a credential configured; if no vendor "`. The enum and validation stay unchanged.

**Test (write it first):** in `__tests__/tool-registrations.test.ts`, beside the omitted-model cases (`:431–451`), add **one** case. Save an OpenAI credential with `model: "dall-e-3"` via the existing `saveMediaProviderCredentials` fixture, call with no `model`, and assert the dispatched request model is `"dall-e-3"`. Keep the existing cases. Mutation (combine): delete `if (savedModel) return savedModel;`. **Combine (CLOUD):** after the `r62t-tests` golden repair, refresh only this description's byte delta in `assistant/__tests__/fixtures/moved-tools.golden.json`. **Chrome look owed:** save a model in Admin → Media providers, then ask the assistant for an image without naming a model."

## BUGS (confirmed on merge-6)
1. Tovu `apps/website/src/features/media-generation/tool-registrations.ts:217–230` (`resolveDefaultImageModel`) ignores the model saved with a media credential. `resolveCredentialForProvider` (`:186–193`) also drops `saved.model` from the resolved credential, so the OpenAI adapter (Jini `dispatch/providers/openai.ts:145`, wire model only) never sees the saved choice. Fix: M-Q3-T.
2. Not sheeted, for the owner: on providers whose adapter prefers `credentials.model` (aihubmix `:76`, imagerouter `:57`, openrouter `:65`, nanobanana `:104`, custom-image `:48`), a caller that passed a saved model would override an explicit agent choice. Today Tovu never forwards it (see 1), so there is no live bug. Do NOT "fix" BUGS 1 by forwarding `saved.model` into the credential.

## NEEDS-DECISION (one line each, with recommendation)
1. **Folder shape:** convert `defs/<cli>.ts` + `defs/<cli>/` into `defs/<cli>/index.ts`? **No**: keep the existing pair (one name per CLI already). Move only the daemon per-CLI files into `defs/<cli>/` after R8b.
2. **M-Nano-renderer:** replace the fixed `NANOBANANA_DEFAULT_MODEL` fallback (`nanobanana.ts:35,104`)? **No change now**: `RenderContext.wireModel` is a required string (`dispatch/types.ts:155`), so the fallback fires only for a direct caller passing `''`. Revisit with the vendor cutover.
3. **M-Q4 (xAI saved search model):** ship it inside the provider move? **No**: move first, verbatim. M-Q4 follows as its own sheet, with a plain-words error when no model is saved.
4. **Report-only audits:** make the four audit steps blocking later? **Yes, after the H2-PKG lock job clears the critical and high advisories.** Until then, report-only.

## Jobs
- **`j-pr-jini-DRAFT.md`** (Jini, base merge-6 `d3e78b387`, 1 sheet): N-audit-J. Batch with other Jini sheets.
- **`j-tv-pr-DRAFT.md`** (Tovu, base merge-6 `776ce6d0f`, 3 sheets): N-age-leaves-T → N-audit-T → M-Q3-T. M-Q3-T's code is on merge-6; only the golden refresh waits for `r62t-tests`.
- **Combine owes:** first CI run log for the four audits, a young-version install refusal in one leaf, the M-Q3-T mutation + golden refresh + Chrome look.
- **Blocked/Cloud:** the K moves after R8b (with the cuts above, plus `mimo/constants.ts` added), and the xAI move after R7 (M-Q4 split out).
- **Dropped:** both CI "scope-check" mutations, the separate desktop sheet, the explicit-model test, `x.ts → x/index.ts` consolidation, AIHubMix unification.
