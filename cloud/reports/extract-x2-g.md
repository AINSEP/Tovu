# EXTRACT-X2-G — review fixes after X2-F

Branch `cloud/extract-s10` in both repos. Started from Tovu `f33c6310` (the X2-F report commit, on top of `3fca0eb4`) and Jini `3f693fd2`. Baseline: `cloud/combine`, Tovu `7cf9658e5` and Jini `e1b1bdbd6`. Raw output is in `cloud/reports/raw/extract-x2-g/`.

Setup: Node 24.22.2, Jini `pnpm install` and `pnpm --no-bail -r build` (exit 0), Tovu `npm ci` (exit 0), `@tovu/sdk` built, then `npm run link:jini` with `JINI_PACKAGES_DIR=/home/user/Jini/packages` (68 links).

## Summary

All four items are done. Item 1 took three commits (1a, 1b, 1c), and items 2–4 took one commit each.

**One deviation from the brief, in item 1c.** The brief expected only google-login to fail the class guard. github's overlay also repeats one fenced block, and that repeat is deliberate. The guard keeps one named exception for it. Details are under item 1c.

## Items

| Item | Repo | Commit | Red | Green |
|---|---|---|---|---|
| 1a test for the google-login overlay | Tovu | `d6985b9a` | 0/3 on the duplicated file (`1a-red.txt`) | 3/3 after 1b (`1b-green.txt`) |
| 1b rewrite GUIDANCE.md | Tovu | `9bf76a85` | — | 3/3 (`1b-green.txt`) |
| 1c class guard over every overlay | Tovu | `f538e604` | 0/1 on the pre-1b google-login file (`1c-red-on-pre-fix-guidance.txt`) | 1/1 (`1c-green.txt`) |
| 2 J-12 identity-namespace case | Jini | `abce5af9` | none: green at once, as expected | 5/5 (`2-green.txt`) |
| 3 J-8 type-only leaf | Jini | `ebc1e0c5` | none: a refactor; the gate is the cycle test plus tsc | tsc exit 0, type-cycles 7/7 (`3-tsc.txt`, `3-type-cycles.txt`) |
| 4 X2-F report corrections | Tovu | `9240cbe1` | — | — |

### 1a. Test: `content/agent-plugin-overlays/google-login/__tests__/guidance.test.mjs`

It reads `GUIDANCE.md` and splits it by `## ` section.

**Test 1** checks the `## Tovu members` section for the ten assertions that Jini `3f693fd2` dropped from `setup-guidance.test.mjs`. Each uses the same regex as before:
- `configured canonical address`
- `const callback = new URL(configuredSiteAddress)`
- `encodeURIComponent(workspaceId)`
- `target: "google-login-oauth-client"`
- `@gmail.com.*@googlemail.com`
- ``Workspace accounts with an `hd` claim``
- `one emailed code`
- `issuer + subject, even if email changes`
- `Unlink must remain effective on the next Google sign-in`
- ``Connect Google.*signed-in `/account` ``

**Test 2** checks `## Google via Supabase Auth` for the two Tovu-wording pins that the same commit rewrote to neutral wording:
- `card is unnecessary unless this site also uses Tovu members`
- `both the Supabase callback and Tovu's callback`

**Test 3** checks that each `## ` heading appears once and that `<div data-embed-config=` appears once.

**Red, on the duplicated file** (`1a-red.txt`): pass 0, fail 3.
- Test 1: the first `## Tovu members` copy began mid step 2, so `/const callback = new URL\(configuredSiteAddress\)/` did not match.
- Test 2: the file had no `## Google via Supabase Auth` heading, so the section was `''`.
- Test 3: the headings were `['## Host details for skills/google-login/SKILL.md', '## Tovu members', '## Tovu members', '## Embed the sign-in button on a public page']`.

### 1b. GUIDANCE.md is now one copy, worded as at combine

The file was generated from the combine skill (`git show e1b1bdbd6:packages/agent-plugins/google-login/skills/google-login/SKILL.md`), so the wording is copied rather than retyped. It contains:
1. The overlay's own header: `# Tovu host guidance for google-login` and its one-line purpose.
2. `## Host details for skills/google-login/SKILL.md`, the heading convention 20 overlays use, followed by combine lines 12–14 (the two Tovu destination paragraphs).
3. Combine lines 24–96, byte-for-byte: `## Tovu members` (steps 1–6), `## Google via Supabase Auth`, `## Troubleshooting without exposing secrets` and `## Embed the sign-in button on a public page`, including the embed block and the theme and branding rules.

Check: `diff <(sed -n '24,$p' combine-SKILL.md) <(sed -n '11,$p' GUIDANCE.md)` is empty, and so is the diff of lines 12–14 against 7–9.

The neutral parts now come only from the Jini skill: the frontmatter, `# Google login`, the **soon** notice and `## Prepare the Google client`.

What the assistant reads is not the combine text exactly. Tovu delivers GUIDANCE.md first, then the neutral Jini skill (`deliverHostPluginGuidance`). So the Tovu-specific sections arrive with combine wording, and the neutral skill follows with its own neutral `## Site members`, Supabase, troubleshooting and embed sections.

Green: 3/3 (`1b-green.txt`).

**Combine-vs-new GUIDANCE text diff** (`diff combine SKILL.md new GUIDANCE.md`; full file: `1b-combine-skill-vs-new-guidance.diff.txt`). Long lines are cut here.

```diff
1,4c1
< ---
< name: google-login
< description: Set up Google member sign-in in Tovu or Google via an app's existing Supabase Auth.
< ---
---
> # Tovu host guidance for google-login
6c3
< # Google login
---
> These rules specialize the portable plugin guidance for Tovu.
8,10c5
< This integration is marked **soon** and has not been tested with a real Google account. Tell the person this before configuring it; do not …
<
< ## Choose the destination first
---
> ## Host details for skills/google-login/SKILL.md
15,22d9
<
< ## Prepare the Google client
<
< 1. Open [Google Cloud Console](…) and select or create the app's project.
< 2. In Google Auth Platform, configure **Branding** …
< 3. Under **Clients → Create client**, choose **Web application**. …
< 4. Add the exact authorized redirect URI for the chosen branch below. …
< 5. Check Audience's Testing/Production status before rollout. …
```

Everything else is identical.

### 1c. Class guard: `apps/website/src/features/agent-plugins/__tests__/unit/overlay-guidance-single-copy.unit.test.ts`

It sits next to `portable-host-guidance.unit.test.ts`. For every `content/agent-plugin-overlays/*/GUIDANCE.md`, it asserts that none of these repeats:
- a `## ` heading outside a code fence
- a whole fenced block
- a `data-embed-config=` line

**Red, with the pre-1b google-login file restored temporarily** (`1c-red-on-pre-fix-guidance.txt`). These are the failures:
- `google-login: ## Tovu members`
- ``google-login: <div data-embed-config='{"type":"plugin","plugin":"tovu/google-login",…}'>``
- ``google-login: ```html``

The restore used `git show f33c6310:<path> > <path>`. The file was then restored from HEAD, and `git status` was clean for it.

**github's repeat, the deviation from the brief.** The first draft of the guard also failed on `github: ```` . In github's `## Host operations for skills/github/references/actions.md`, the `GET …/actions/workflows/<file.yml>/runs?per_page=1` request appears twice:
1. Once before the dispatch.
2. Once to poll after it.

That is deliberate. Combine's Jini `references/actions.md` has the same two blocks (lines 78–83 and 131–136, under "One more comparison, already paid for" and "Follow the run"). Removing either would change Tovu's tool text, so github's overlay is unchanged. The guard keeps one named exception, `intendedRepeat`, which allows only `github` and only blocks containing `/runs?per_page=1"`. A comment beside it says why.

Green: 1/1 (`1c-green.txt`).

### 2. J-12: `packages/agent-plugins/src/lifecycle/__tests__/unit/manifest-namespace.unit.test.ts`

New case: a manifest with both `extensions.tovu` (`tovu/stock`) and `extensions.jini` (`jini/stock`), parsed with `{ identityNamespace: 'tovu' }`. It gives `{ id: 'jini/stock', warnings: [] }`.

This is a test only. It was **green at once**: 5/5 in the file (`2-green.txt`).

### 3. J-8: `PluginContributionParseResult<T>` moved to a leaf file

- **New file `lifecycle/contribution-types.ts`.** It holds the type only and imports nothing.
- **`contribution-loader.ts`** imports the type and re-exports it (`export type { PluginContributionParseResult } from './contribution-types.js'`), so every public path is unchanged.
- **`credential-card-metadata.ts`** imports the type from the leaf. Its return type is now `PluginContributionParseResult<PluginCredentialCard>` instead of the inline copy. The why-comment (manifest.ts re-exports this file, and importing contribution-loader.ts would close the cycle through activation.ts to ports.ts) moved to the import line it now explains.

Results: `tsc --noEmit -p tsconfig.json` exit 0, with no output. `type-cycles.test.ts` passed 7/7.

### 4. X2-F report corrections (`cloud/reports/extract-x2-f.md`)

**(a) J-20.** "**Owner decision needed:** should Tovu ship its own host-specific member-login guidance?" is now struck, and so is the claim before it that the removed steps are "in **neither** repo". That claim was also wrong: its grep missed `content/`. The original text stays visible as `~~…~~`. A new sub-bullet says no decision is needed: the guidance ships from the Tovu overlay, and item 1 now pins it.

**(b) J-4.** "~~unless it contains a secret~~" now reads "unless it matches a credential-shaped redaction rule, including labeled key=/token:/password= values". A one-line note says why: redaction is pattern-based.

## Gates

| Gate | Exit | Result | Raw |
|---|---|---|---|
| Jini `packages/agent-plugins` full vitest (`--maxWorkers=2 --minWorkers=1`) | 0 | 125 files; **1651 passed, 2 skipped** (1653) | `gate-jini-agent-plugins.txt` |
| Jini `pnpm test:agent-plugins:content` | 0 | **1406/1406** | `gate-jini-agent-plugins-content.txt` |
| Jini `pnpm check:cross-package` (XP1–XP5) | see below | see below | `gate-jini-cross-package*.txt`, `xp3-snapshot.txt` |
| Tovu `content/agent-plugin-overlays/**/__tests__` (node:test, `--test-concurrency=1`) | 0 | **444/444** | `gate-tovu-overlay-tests.txt` |
| Tovu `apps/website/src/features/agent-plugins/__tests__/unit/**` | 0 | 1161 tests: **1157 pass, 0 fail, 4 skipped** | `gate-tovu-agent-plugins-unit.txt` |
| Tovu lint (`biome lint . --max-diagnostics=none --diagnostic-level=error`) | 1 | **600 errors**. Per-file counts are identical to X2-F's 600 (`gate-tovu-lint-perfile-vs-x2f.txt` is empty), and X2-F was 0 new against combine's 607, so **0 new**. Neither new test file has a diagnostic. | `gate-tovu-lint.txt`, `.keys` |
| Tool-metadata golden | 0 | SHA-256 `a0d6b428be4ea369f6abdf70a9892f0ce13db651ac4ac560e43dc2993fa2a0b6`, **unchanged**. `tool-metadata-projections.test.ts` 4/4. | `gate-tool-metadata-golden.txt` |

**Lint errors.** All 600 are prior. None is in a file this job touched. Every error is listed in `gate-tovu-lint.txt`, and per file and rule in `gate-tovu-lint.txt.keys`.

**Cross-package.** XP3_PLACEHOLDER

**Tovu agent-plugins unit skips.** These are the suite's own conditional skips; this job added none:
- "a publication permission failure without a concurrent winner is still rejected": requires Unix write permissions enforced for a non-root user.
- "resolveAgentPluginRefs injects the REAL installed ui-ux-design SKILL.md verbatim": an environment acceptance test that runs only on opt-in.
- "resolveAgentPluginRefs fails closed with an exact reason for a pluginRefId absent from the real installed packages": the same opt-in acceptance test.
- "a failed uninstall puts every staged package tree back": running as root, the failure cannot be forced.

## Last green pair

Tovu `TOVU_LAST` / Jini `ebc1e0c5`.

## Processes

No test or server processes left running.

EXTRACT-X2-G DONE
