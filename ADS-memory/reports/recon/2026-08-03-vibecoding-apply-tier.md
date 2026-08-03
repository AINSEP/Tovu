# Vibecoding Apply Tier — bolt.diy / open-lovable, for Jini's Engine Contract

**Date:** 2026-08-03
**Scope:** recon only, no source modified in either repo, no commits, no new clones.
**Read first, not repeated:** `ADS-memory/reports/recon/bolt-diy-analysis.md`, `ADS-memory/reports/recon/open-lovable-analysis.md`, `ADS-memory/reports/recon/pages-vibecoding-decisions.md`. This report assumes those findings and cites them by decision ID (D-5, D-6, D-7...) rather than re-deriving them.

**Status: COMPLETE.**

---

## Verdict (busy-reader summary, leads with the contract pressure-test)

**Your four-op contract (list / read one / replace one / snapshot all) is structurally sound but incomplete in one specific, well-evidenced way: it has no notion of *validating a replace before it commits*.** Both reference codebases get away without this because their "part" is a whole file — files can never corrupt each other's parse-ability, so `replace(id, content)` is always safe to just write. Tovu's own "part" (a `data-tovu-id`-tagged HTML region, per D-5/D-6) does **not** have that property: a region lives inside one shared document, and a bad replace (unbalanced tag, structural nesting break) corrupts the whole, not just the part. Neither reference codebase has ever had to solve this — their total absence of write-time validation (confirmed in both, see below) is evidence of that, not a design to copy. Recommend adding a host-supplied validate-then-commit step around `replace`, not a fifth CRUD verb. Two smaller, cheap additions: `replace` must behave as **upsert** (both codebases create-on-write, never require the ID to pre-exist), and the contract should explicitly *not* attempt to own process/environment resync after `snapshot-all`/restore — bolt.diy's own rewind proves data-restore and environment-restart are separable steps it already keeps apart internally. New, concrete findings not in the prior two reports: bolt.diy's file-write path silently swallows every write error (the action is marked `'complete'` regardless); open-lovable's apply route builds a shell command string via `\`mkdir -p ${dirPath}\`` from a path the model wrote, with no traversal or shell-metacharacter check.

---

## Apply Tier — bolt.diy

### The grammar (recap only — see the prior report's Q2/Q3 for the full parser trace)

`<boltArtifact><boltAction type="file" filePath="...">content</boltAction></boltArtifact>`, one artifact per response, parsed by the resumable `StreamingMessageParser`. Not re-traced here.

### Who validates, who writes, what happens on failure — the new ground

The actual write happens in `ActionRunner.#runFileAction` (`app/lib/runtime/action-runner.ts:311-339`), read in full for this task:

```ts
async #runFileAction(action: ActionState) {
  const webcontainer = await this.#webcontainer;
  const relativePath = nodePath.relative(webcontainer.workdir, action.filePath);
  let folder = nodePath.dirname(relativePath);
  folder = folder.replace(/\/+$/g, '');
  if (folder !== '.') {
    try {
      await webcontainer.fs.mkdir(folder, { recursive: true });
    } catch (error) { logger.error('Failed to create folder\n\n', error); }
  }
  try {
    await webcontainer.fs.writeFile(relativePath, action.content);
  } catch (error) { logger.error('Failed to write file\n\n', error); }
}
```

Three findings, none in the prior report (which examined this file only for its shell/start/build branches under LEAVE):

1. **No validator exists at all.** `action.content` is written verbatim, with only `nodePath.relative()` applied — no path-traversal check, no schema/parse check on the content. "Who validates it" has no answer in this codebase; the WebContainer VM boundary is the only safety net, and it's a sandbox boundary, not a content validator.
2. **Both failure paths are silently swallowed, not surfaced.** `mkdir` and `writeFile` each have their own inner `try/catch` that only `logger.error`s — neither re-throws. Compare this to `#executeAction`'s outer switch (`action-runner.ts:151-238`, read in full for this task), which **does** have real failure handling for other action types: a `shell`/`start`/`build` action that throws is caught by the outer `try` at `:226`, sets `status: 'failed'`, and (if it's an `ActionCommandError`) fires `onAlert` to show the user a "Dev Server Failed" card. **File actions can never reach that path**, because their own inner catch already consumed the error two frames earlier. The net effect: `runAction()` marks a file action `'complete'` (`:223-225`) whether or not the write actually happened. This is a genuine, concrete "what bolt.diy's apply tier gets wrong" finding, distinct from the parser/prompt findings the prior report covers.
3. **`replace` is really `upsert`.** `mkdir(folder, {recursive: true})` before every write means a path that doesn't exist yet is created transparently — there is no separate "create" verb, and no case where a file must already exist for the write to succeed. Confirms the contract's `replace` should be spec'd as create-or-replace, not "replace an existing part only."

No delete: grepped `action-runner.ts` for `unlink`/`removeFile`/`deleteFile` — zero matches. The AI-facing action grammar has no delete verb; deleting a file is a human-only UI action (`FilesStore`, not read in depth here), never something the model can do through the artifact protocol.

---

## Apply Tier — open-lovable

### The grammar (recap only — see the prior report's Q2 for the parser-duplication finding)

`<file path="...">content</file>`, extracted by whole-buffer regex after the stream completes.

### Who validates, who writes, what happens on partial/malformed — the new ground

This report traced `app/api/apply-ai-code-stream/route.ts` directly — the prior open-lovable report flagged this file's relationship to `apply-ai-code/route.ts` as "needs confirmation" and focused its own Q2/Q7 tracing on `generate-ai-code-stream/route.ts`'s parser. This route has its **own**, independent `parseAIResponse` (`route.ts:24-`), confirming the prior report's TRAPS #2 ("duplicated, drifting parser logic") with new mechanical detail:

**Parsing/dedup, read in full (`route.ts:66-127`):** file blocks are collected into a `Map<path, {content, isComplete}>` keyed by path, because the same path can appear more than once in the buffer (a partial version from the streaming chunk-scan, a complete one from the final pass — consistent with the prior report's finding that live per-chunk parsing is cosmetic-only and the real extraction is a second, full-buffer pass). The dedup heuristic, in priority order: first occurrence wins by default; a version **with** a closing tag replaces one **without**; between two complete versions, the **longer** one wins; between two incomplete versions, the longer one wins. A truncation heuristic (`route.ts:96`) flags any file whose content contains the literal substring `...` unless it also contains `...props` or `...rest` — a narrow allowlist for JS spread syntax that **does not generalize**: a real file spreading a differently-named prop or variable (`...otherProps`, `...children`, `...items`) does not contain the literal substrings `...props`/`...rest` and would be **incorrectly flagged as truncated** even though it's valid, complete code. This is a concrete, verifiable fragility not named in the prior report.

**A second, independent parse tier runs after the first and is never unified with it** (`route.ts:130-147`): a markdown-fenced ` ```path="...">...``` ` format is matched by a second regex and its results are `push`ed directly onto `sections.files` — **not** merged into the same `fileMap` used for the `<file>` tag dedup above. If a response contains both an XML-tag file block and a markdown-fenced block for the same path (plausible if a model partially reverts to markdown fencing mid-response, a documented failure mode in both codebases per bolt.diy's `cleanoutMarkdownSyntax`), `sections.files` gets **two entries for the same path**, and the write loop below writes both, sequentially, with no de-duplication — the second write silently wins. Neither prior report flagged this specific double-entry path.

**The actual write, read in full (`route.ts:591-669`):**
```ts
for (const [index, file] of filteredFiles.entries()) {
  try {
    let normalizedPath = file.path;
    if (normalizedPath.startsWith('/')) normalizedPath = normalizedPath.substring(1);
    if (!normalizedPath.startsWith('src/') && !normalizedPath.startsWith('public/') &&
        normalizedPath !== 'index.html' && !configFiles.includes(...)) {
      normalizedPath = 'src/' + normalizedPath;
    }
    // ... strip CSS imports from JS/TS files, rewrite shadow-3xl/4xl/5xl -> shadow-2xl in CSS ...
    const dirPath = normalizedPath.includes('/') ? normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) : '';
    if (dirPath) { await providerInstance.runCommand(`mkdir -p ${dirPath}`); }
    await providerInstance.writeFile(normalizedPath, fileContent);
    ...
  } catch (error) {
    results.errors.push(`Failed to create ${file.path}: ${(error as Error).message}`);
    await sendProgress({ type: 'file-error', fileName: file.path, error: (error as Error).message });
  }
}
```

Four findings, all new relative to the prior reports:

1. **The writer silently rewrites the model's own path**, forcing anything not already under `src/`/`public/`/`index.html`/a recognized config filename into `src/`. This is invisible content mutation at apply time, not validation — the path that actually lands on disk can differ from the path the model believed it wrote, with no signal back to the model that this happened.
2. **The writer also silently rewrites file *content*** — stripping CSS `import` lines from JS/TS files and replacing non-existent Tailwind classes (`shadow-3xl/4xl/5xl` → `shadow-2xl`) before the write. Combined with (1): what's on disk after apply can diverge from what the model emitted, in both name and bytes, with no reconciliation step feeding the correction back to the model's own understanding of the file. This directly bears on the "Describe" capability the team-lead named as missing — if a future turn's "describe what currently exists" reads the post-mutation disk state (correct) but any transcript/history of "what I just wrote" reflects the model's pre-mutation belief, the two can drift apart silently.
3. **No path-traversal check, and the directory-creation call is a raw shell string built from an unsanitized path component**: `providerInstance.runCommand(\`mkdir -p ${dirPath}\`)` interpolates `dirPath` (derived directly from `file.path`, which came from the LLM's own output — and, per D-3/OQ-6 context, the LLM's output can itself be seeded from *scraped third-party page content*) directly into a shell command string. I did not read `providerInstance.runCommand`'s implementation (E2B/Vercel provider internals) to confirm whether it invokes a shell (`sh -c`) or an argv-array exec, so I cannot confirm command injection is *live* — flagging as **unverified but concrete enough to warrant checking before assuming safety**, and either way it is a materially higher-risk pattern than bolt.diy's structured `webcontainer.fs.mkdir(folder, {recursive:true})` API call, which takes no shell string at all.
4. **Per-file errors are caught, collected, and surfaced — this is genuinely better than bolt.diy's silent swallow.** Each file write is wrapped in its own `try/catch`; a failure is pushed to `results.errors` and sent as a `file-error` SSE event, and the loop **continues** to the next file rather than aborting the whole batch. Worth crediting: on this one specific axis (partial-failure signaling), open-lovable's apply tier is more honest than bolt.diy's.

No delete verb here either — grepped both `apply-ai-code-stream/route.ts` and `apply-ai-code/route.ts` for `delete`/`remove`/`unlink`; the only hit is an unrelated comment about deduplicating an array. Confirms: **neither reference codebase gives the AI a delete operation**, in either direction of my search.

---

## Snapshot/Rewind (bolt.diy — open-lovable has no equivalent, not re-covered)

The prior bolt.diy report's MSG-02 addendum already did excellent, thorough work here (data stores, `?rewindTo=` mechanism, the `abortAllActions()` TODO stub) — not repeated. This section answers the specific new question asked: **the actual data structure, and whether it is re-appliable to something that isn't a file tree.**

### The data structure, read directly

`app/lib/persistence/types.ts:3-7`:
```ts
export interface Snapshot {
  chatIndex: string;   // the message id this snapshot was taken at
  files: FileMap;       // Record<string, Dirent | undefined>
  summary?: string;
}
```
`app/lib/stores/files.ts:27-45`: `Dirent = File | Folder`, where `File = {type:'file', content: string, isBinary: boolean, isLocked?, lockedByFolder?}` and `Folder = {type:'folder', isLocked?, lockedByFolder?}`. Storage: one IndexedDB row per chat (`db.ts:305-326`, `getSnapshot`/`setSnapshot`, keyed by `chatId`), storing the whole `Snapshot` object as one blob via `store.put({chatId, snapshot})` — not chunked, not diffed against the prior snapshot.

**Granularity: whole-map, per turn.** One `Snapshot` = the entire `FileMap` at that point, not a per-file or per-change record. Confirmed by call sites (not re-traced — matches the prior report's Q8 characterization).

### Is it re-appliable to something that isn't a file tree? — Yes, the data shape; no, the rewind operation as a whole

Read `useChatHistory.ts:65-124` in full for this task (prior report cited it but didn't quote the restore mechanics). Two clearly separable phases happen on rewind:

**Phase 1 — pure data restore (part-agnostic, ports cleanly):** `validSnapshot.files` is read, filtered to `type === 'file'` entries only (`Folder` dirents are discarded — they carry no content, only structural bookkeeping that a flat "parts" model has no analog for and doesn't need), and turned into a plain `{path, content}[]` list (`useChatHistory.ts:104-115`). At the type level, `FileMap` is nothing more than **a `Record<string, {content: string}>`** — an opaque string key to opaque string content. There is nothing filesystem-specific baked into the *type*: no inode, no real path resolution, no directory semantics beyond the unused `Folder` variant. This is already isomorphic to "part-id → part-content," which is exactly what a generic `snapshot-all`/`restore` pair over the team-lead's proposed contract would need.

**Phase 2 — environment resync (file-tree/process-specific, does NOT port):** the restored file list is fed to `detectProjectCommands(files)` → `createCommandActionsString(...)` (`useChatHistory.ts:116-119`), which synthesizes a **new synthetic message** (a fabricated assistant turn containing `shell`/`start` actions, e.g. re-running `npm install`/`npm run dev`) and splices it into the active message list (`useChatHistory.ts:121-...`, continuing past what was read). This synthetic turn is then replayed through the **same** artifact/action parser and `ActionRunner` used for ordinary generation — rewind doesn't have its own restore mechanism for the live environment, it re-uses the apply pipeline by manufacturing a fake turn that says "here's the project, here's how to boot it."

**Conclusion, directly answering the question:** the *data structure* is already engine-contract-shaped and requires no adaptation — a document-region host could store `Record<data-tovu-id, string>` as its `snapshot-all` output today and it would be structurally the same shape bolt.diy uses. What does **not** generalize is treating "restore" as a single atomic operation: bolt.diy's own implementation already keeps "put the data back" (Phase 1) and "get the live environment running again" (Phase 2) as two separate steps, glued together only because a file-tree host happens to need both every time. **A generic contract should expose only Phase 1 as `restore`/`snapshot-all`, and treat Phase 2 (re-establishing whatever execution/runtime state depends on the parts) as the host's job, invoked separately** — exactly as bolt.diy's own code structure already implies, whether or not that was a deliberate abstraction on their part.

---

## The Contract Pressure-Test (main event)

**Proposed contract:** list editable parts / read one / replace one / snapshot all.

### Where it holds

- **Part identity as an opaque string key** — verified against both codebases. bolt.diy's `FileMap` is `Record<string, Dirent>`; open-lovable's parsed files are `{path: string, content: string}[]`. Neither needs richer identity than a string. A `data-tovu-id` is the same shape.
- **`replace` must be `upsert`, not "replace existing only"** — verified in both write paths (bolt.diy's `mkdir(recursive:true)` before every write; open-lovable creates on demand too). No reference codebase requires the ID to pre-exist. The contract should say "create-or-replace," not "replace."
- **No delete verb needed for parity with either reference** — grepped both apply paths; neither exposes file/region deletion to the model. (This doesn't mean Tovu will never want delete — e.g. removing a section — only that "the two reference implementations don't need it" isn't evidence against adding it; it's simply silent on the question. Flagging as a design choice for you, not a finding either way.)
- **`snapshot-all`'s data shape ports almost for free** — see the Snapshot section above: bolt.diy's own `Snapshot` type is already an opaque keyed-content map, not filesystem-specific at the type level.
- **"List, then search/filter" is correctly layered *above* the core primitives, not inside them** — open-lovable's own architecture agrees: its edit-intent search pipeline (`file-search-executor.ts`, `context-selector.ts`) is built as a layer on top of raw file listing/reading, not as a capability the sandbox provider itself exposes (`SandboxProvider`'s interface is just `createSandbox/runCommand/writeFile/readFile/installPackages/terminate/getSandboxUrl` — no search method). This validates keeping "list all" + "read one" as the primitive and letting hosts build filtering/search on top, exactly as your four-op proposal implies.

### Where it leaks — the operations that would break, named specifically

**1. `replace` implicitly assumes parts are independent of each other and of the whole. That assumption is true for files and false for document regions.** This is the central finding. Neither bolt.diy nor open-lovable has ever needed a validator on write, and I verified this directly, not by absence of evidence: bolt.diy's `#runFileAction` writes `action.content` with zero content inspection; open-lovable's writer performs *content mutation* (strips CSS imports, rewrites Tailwind classes) but never *content validation* (nothing checks the result is even syntactically valid JS/CSS before writing). Both can get away with this because **writing file A can never break file B's ability to parse**, or the "whole project"'s ability to exist as a collection of independent files. A `data-tovu-id`-tagged HTML region is not independent this way: it is embedded inside one shared DOM tree, and replacing it with unbalanced markup, a stray closing tag, or content that breaks out of its intended container corrupts the *whole document*, not just the addressed part — a failure mode that structurally cannot occur in a file-tree model and that is why neither reference implementation has any code to study for it. **Recommendation: don't add a fifth CRUD verb — add a required validate-then-commit step the engine calls around `replace`, supplied by the host.** For a file-tree host this validator is always `() => valid` (a no-op, matching what both codebases actually do). For Tovu's document-region host it must parse the candidate whole-document result and reject (not partially apply) a replace that would leave the document malformed. This is the one place the contract needs an explicit seam, not an implicit assumption.

**2. `snapshot-all`/`restore` is not one operation, it's two, and only the data half belongs in the engine.** Detailed above. bolt.diy's rewind conflates "restore the content map" with "re-run whatever process/build state depends on it" only because a file-tree host always needs both — but its own implementation keeps them as genuinely separate steps (a plain data restore, followed by synthesizing and replaying a *separate* setup-commands turn through the ordinary apply path). If the generic contract's `snapshot-all`/`restore` pair tries to also guarantee "and now everything that depends on these parts is back in a working state," it's promising something files-only hosts can deliver for free (nothing depends on file content except more files) and something Tovu's host would have to fake (a rendered HTML page has no "process" to restart — restoring the parts *is* restoring the page) while a *third*, hypothetical file-tree-app-builder host built on this same contract would need a real, separate re-sync step exactly like bolt.diy's. **Recommendation: `restore` returns the parts to their snapshotted content and nothing else. Any host whose parts have downstream execution state (a dev server, a build artifact, a running process) is responsible for its own re-sync after calling `restore`, the same way bolt.diy's rewind logic — not its engine primitive — manufactures the setup-commands replay.**

**3. Process/build/install actions are a real, necessary capability for a file-tree consumer and have no home in a "parts" contract at all — which is fine, but worth being explicit about so it isn't later treated as a missing fifth op.** bolt.diy's `shell`/`start`/`build` action types and open-lovable's package-install pipeline are not edits to any part — they're commands that run in an execution environment the parts happen to live inside. A multi-file app-builder host consuming your engine will need this capability alongside the parts contract (matching your own inventory: `platform` + `agent-runtime` already cover process/sandbox execution as a separate concern). The risk isn't that the contract is missing this — it's that if it's not stated explicitly, someone building the file-tree host later might expect `list/read/replace/snapshot` to somehow also cover "run npm install," discover it doesn't, and read that as a contract gap rather than a deliberate boundary. Worth a line in whatever spec follows: *this contract governs editable parts only; process/execution capability is a separate, host-composed concern.*

**4. "Read one" is the only read primitive, and both codebases use reads for at least two different purposes that may want different shapes.** bolt.diy uses per-file reads for (a) the hand-edit-reconciliation diff baseline (`FilesStore`'s `#modifiedFiles` tracking) and open-lovable uses per-file reads for (b) building the next turn's model-facing context (its layered fallback: search-plan-selected file → keyword-selected files → "send every file" as a last resort, `generate-ai-code-stream/route.ts:1073-1121`). Neither of these breaks a singular `read(id)` op — both are satisfiable by calling it N times — but (b) specifically is a bulk-read-for-context-assembly use case that, at real scale (dozens of parts), turns into dozens of round-trips if the engine's `read` is one-at-a-time only. **Not a leak in the sense of "breaks," but worth a design decision now rather than later: does `list` return identifiers only (today's proposal) or identifiers-plus-content (saving N round trips for the common "hand me everything for context" case)?** For Tovu's own N=1-to-a-handful-of-regions scope this genuinely doesn't matter; flagging only because "a multi-file app builder" was named as the other intended consumer, and that consumer is exactly where this would start to matter.

**5. Minor, not a leak, but a real trap worth inheriting a lesson from rather than the mechanism: don't let "list/read" duplicate into two independently-evolving parsers the way open-lovable's did.** The single sharpest concrete new finding in this whole recon — `generate-ai-code-stream/route.ts` and `apply-ai-code-stream/route.ts` each reimplement "parse the model's semi-structured output into parts" independently, with drifting heuristics (the ellipsis-truncation check exists in one and not verified in the other; the markdown-fence fallback tier exists in `apply-ai-code-stream` and wasn't characterized in the prior report's read of `generate-ai-code-stream`). This isn't a property of the *contract* — it's a warning about *implementation discipline*: if "parse model output into part-shaped writes" and "commit those writes" end up living in two files that both parse independently, they will drift, exactly as observed. The engine contract should have exactly one parser sitting in front of `replace`, never two.

### If four operations is wrong, the corrected set

Given the above, the four operations are *not* wrong as a minimal set — every leak found is a leak in scope/behavior around `replace` and `snapshot-all`/`restore`, not a missing verb. The corrected framing:

- `list()` → part identifiers (possibly + content, per finding 4 — your call, not evidenced as required)
- `read(id)` → current content of one part
- `replace(id, content)` → **upsert**; the engine calls a **host-supplied `validate(wholeAfter) -> ok|reject`** before committing, not after — for file-tree hosts this is always `ok`; for Tovu it is load-bearing
- `snapshotAll()` / `restore(snapshot)` → parts-content only, explicitly **not** responsible for any execution/runtime state a host layers on top of its parts

Five names, but the fifth (`validate`) is a hook the host supplies to `replace`, not a new op the engine calls on its own — the loop is still "list / read / replace / snapshot," just with `replace` doing real work at commit time instead of assuming it's always safe.

---

## What Each Codebase Gets Wrong — Apply/Undo Tier Specifically (not already flagged)

Excluding, per the brief: bolt.diy's empty `abortAllActions()` stub and open-lovable's dead error-feedback subsystem/duplicated parsers (all already in the prior reports/decision log).

**bolt.diy:**
- File-write errors are unconditionally swallowed inside `#runFileAction`'s own try/catch, so a failed `mkdir`/`writeFile` still results in the action being marked `'complete'` — the one action type (`file`) that most needs reliable success/failure signaling (it's the actual content mutation) is the one type whose failures never reach the generic status/alert mechanism that `shell`/`start`/`build` actions already have. This is a real, fixable asymmetry in the executor, not a design tradeoff.

**open-lovable:**
- The apply route silently rewrites both the model's file path and file content (forcing paths under `src/`, stripping CSS imports, renaming nonexistent Tailwind classes) with no signal fed back to the model that its own belief about what it wrote no longer matches disk — a correctness gap specifically relevant to any future "describe what currently exists" capability, since "what the model thinks it wrote" and "what's actually there" can silently diverge.
- The directory-creation step shells out via a template-string command (`` `mkdir -p ${dirPath}` ``) built from a path the model controls, with no traversal or metacharacter sanitization — materially riskier than bolt.diy's structured `fs.mkdir()` call, and worth a direct check against the actual sandbox provider's command-execution semantics before assuming it's inert (flagged unverified above).
- Two independent file-parsing tiers in the same route (`<file>` tag regex and a markdown-fence-with-path regex) feed the same `sections.files` array without being unified against each other — a response containing both forms for the same path produces two write entries for one path with no de-duplication, silently resolved by write order rather than any explicit rule.
- The truncation-detection heuristic (flag content containing `...` unless it also contains the literal substrings `...props` or `...rest`) does not generalize to any other spread-syntax usage and will false-positive on ordinary, complete, valid code.

---

## Confidence and What I Could Not Verify

**High confidence (read the actual source directly, quoted above):** bolt.diy's `#runFileAction` and the outer `#executeAction` switch/catch structure; open-lovable's `parseAIResponse` dedup logic and the `apply-ai-code-stream` write loop; the `Snapshot`/`FileMap`/`Dirent` type definitions; the `useChatHistory.ts` rewind Phase-1/Phase-2 split; the absence of any delete verb in either codebase's AI-facing action grammar (confirmed by direct grep, not inference).

**Medium confidence:**
- The shell-injection framing for open-lovable's `mkdir -p ${dirPath}` call — I read the call site but not `providerInstance.runCommand`'s implementation in either `e2b-provider.ts` or `vercel-provider.ts`, so I cannot confirm whether it executes via a shell (making this exploitable) or an argv-array exec (making it merely sloppy). Flagged as unverified in the body above; worth a direct follow-up read of those two files before treating it as a confirmed vulnerability rather than a risk pattern.
- The finding-4 (bulk-read-for-context) framing is a reasonable inference from both codebases' documented context-assembly behavior, not a "this specific thing will break" claim — I did not attempt to construct a scenario where it actually fails, only note it as the kind of use case worth deciding on deliberately.

**Not sampled / out of scope this pass:**
- `open-lovable`'s `lib/morph-fast-apply.ts` Fast Apply path was not re-traced (fully covered by the prior report's Q4); not relevant to the apply-tier contract question since it's an alternate *generation* strategy, not a different write/validate mechanism at the point of commit.
- Did not re-verify bolt.diy's `LockManager`/locked-files mechanism (`stream-text.ts:198-220`, `lockedFiles.ts`) against the contract — a "locked part" concept might be a real sixth consideration (a part `replace` should refuse) but this wasn't asked for and I didn't chase it down.
- Did not clone or inspect anything beyond what's already on disk at `/Users/la/Programming/OSS-Repos/{bolt.diy,open-lovable}`, per the instruction.

No repo was needed that isn't already present.
