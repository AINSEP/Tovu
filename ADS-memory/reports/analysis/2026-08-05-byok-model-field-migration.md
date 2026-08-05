# BYOK Model-field migration — two shapes, one helper, and four things hiding underneath

Agent: QA/E2E (Execution). 2026-08-05, ~11:00–14:00. Repo `/Users/la/Programming/Tovu`,
branch `refactor/jini-admin-extraction`, from HEAD `d4d8f5b`.

Run isolation throughout: `BYOK_E2E_PORT_BASE=7641`, a unique `--output` per run, one spec file
per run, `lsof` before and after every run. **Zero orphans at any point**, with one exception
noted in §7.

Commits: `9b67c0e`, `cef046b`, `80e8c21`, `ce18754`, `66472a9`.

---

## 1. Result

| spec | before | after |
|---|---|---|
| `byok-credential-persistence` | 2 / 4 | **4 / 4** |
| `byok-state-races` | 0 / 4 | **4 / 4** (2 as `test.fail()` pins) |
| `byok-hostile-provider` | 5 / 7 | **7 / 7** |
| `byok-model-discovery-self-heal` | 0 / 1 | **1 / 1** |
| `byok-azure-path` | 6 / 6 | **6 / 6** (unchanged, helper adopted) |
| `byok-google-live-smoke` | 0 / 1 | 0 / 1 — Model field fixed, now fails at the live Gemini turn |
| **total** | **13 / 23** | **22 / 23** |

The one remaining failure is this suite's only live-API test; it now reaches the chat turn and
the assistant pane reports "This turn failed." That is its own subject matter, not a locator
problem, and is untouched here.

## 2. The defect, read off committed source

`ByokProviderForm.tsx` (Jini `3b5d648d`) gives the Model field **three** states, not two:

| discovery | `config.model` in live list | picker | plain `<input>` | `list` attr |
|---|---|---|---|---|
| ok, n>0 | yes | yes | no | — |
| ok, n>0 | no / blank / after `Custom…` | yes | **yes** | **absent** |
| error / empty | — | no | yes | only if the preset has `preferredModels` |

`showModelPicker = liveModels.length > 0`; `customModelActive` adds the plain input back via
`shouldShowCustomModelInput = explicitCustomMode || !modelValue || !knownModelIds.includes(modelValue)`
(`features/execution/rules.ts:382`).

Row 2 is what this suite actually hits — the stubs return `["stub-model"]` while the specs type
real ids — so **the plain input was on screen the whole time**, having lost only the attribute
the specs matched on. Most call sites were therefore a selector swap.

Four source facts the dispatch brief did not have, each of which changed the design:

1. The picker's search box renders only at `minSearchableOptions = 8` combined options
   (`SearchableModelSelect.tsx:58,71`). A 2-model stub has **no** search box, so a helper that
   always waits for `jini-byok-model-search` would hang on the XSS spec specifically.
2. `CustomSelect`'s `portal` defaults to `true` and the menu is `createPortal(menu, document.body)`
   — options are never descendants of the field, and **exist only while the menu is open**.
3. The `<datalist>` renders only when `!showModelPicker && suggestions.length > 0`, so every
   `getElementById("jini-byok-model-options")` read in this suite returned a **silent `null`**
   under successful discovery. A separate breakage from the fill-selector one.
4. Escape closes the menu from either focus position, so open→read→close is safe to poll.

## 3. The helper — `development/e2e/byok-model-field.ts`

`setByokModel`, `chooseByokModelFromPicker`, `readByokModelOptions`, `openByokModelMenu`, plus
locators. `setByokModel` prefers the plain input wherever it exists and uses the `Custom…`
sentinel to reveal it when it does not, because every caller types a concrete id and against
these stubs the id is almost never in the discovered list.

Every entry point fails with a message naming what it actually found (card count, label count,
plain-input count, picker count, or the offered options) rather than matching zero elements
quietly. `readByokModelOptions` **throws** rather than returning `[]` when no option source
exists — "offers nothing" and "the assertion is reading the wrong DOM" are different facts.
Option text is read as `textContent`, not `innerText`, because the XSS spec compares
byte-for-byte.

The Model `<label>` is anchored by `/^Model\s*\*?$/` on its own `.jini-field-label`, which
sidesteps the `hasText: 'Model'` / "use the model default" trap. **No Jini edit was needed.**

## 4. Four defects the migration uncovered

Each was hidden behind the one before it. All are measured, not inferred.

### 4a. `byok-credential-persistence` test 4 — premise unreachable post-ADR-058

It typed no OpenAI key and asserted the captured request carried `apiKey: ""`. "Test connection"
is `disabled={... || missing.size > 0}` and `missingRequiredFields` counts an empty `apiKey`;
`apiKeyStoredExternally` is false in a hermetic run. The click spent the full 90s on `element is
not enabled`. The file has one commit (`876b4fe`) and this test had never run green.

Repaired to give OpenAI its own key and assert the request carries exactly it — strictly stronger
than `toBe("")`, since exact equality cannot pass if Anthropic's key leaked.

### 4b. `byok-state-races` — cross-test ledger contamination

`config.byok.providerId` is a real ledger field and all four tests share one in-memory API
process. Landing on OpenAI makes `getByRole("tab", {name: "OpenAI"}).click()` a silent no-op
(`ProviderChipGroup`'s `onSelect` only fires `if (!active)`), so test 3 saw `switchCall === 0`
and test 4 saw its key field never re-seeded. **Both read as product failures and are neither.**

Verified as the cause: both passed under `--grep` in isolation and failed in a whole-file run,
and normalizing the preset in `gotoByok` fixed test 3 outright.

Only reachable now because tests 1 and 2 previously died at the Model field *before* their
provider switch, so they never wrote a different provider.

### 4c. `byok-hostile-provider` tests 6 and 7 — order-dependent on a leaked key

Neither typed an API key. Browser-side discovery refuses without one — verbatim: *"Could not
load live models: No API key — model discovery needs the key from this browser."* Both depended
on a key left behind by an earlier test in the file. **The highest-severity test in the suite
(XSS) was order-dependent and would report green while never rendering the payload at all.**
Both now type their own key.

The XSS test also had an ordering hazard created by the refactor: the `img[src=x]` and
`window.__xssFired` checks must run with the menu **open**, or they inspect a document the
payload never entered and pass unconditionally, including against a vulnerable build.

### 4d. The typed API key is wiped ~600ms after typing — BY DESIGN, with a sharp edge

Not a test problem, and the blocker for the one assertion I withheld.

Measured independently here: fill the API key, wait ~1.5s, and the field reads `""`,
`is-missing` is set, and "Test connection" is disabled. Mechanism: `useSettingsSlice`'s debounced
save completes, its background `refresh()` reloads the whole config through
`loadExecutionConfig`, which is contractually always `apiKey: ""`. `hasApiKey` flips back to
false and discovery re-fires and fails.

**Corroborated, and re-framed, by a concurrent agent.** `byok-google-tool-schema.spec.ts`
(another agent's file, read not edited) root-caused the same wipe today and recorded the same
probe result — `PROBE-C enabled-after-ledger-autosave = false`, `PROBE-D key-field-value = ""`.
Two independent measurements of the same behaviour.

Their reading corrects mine, and I defer to it: this is **not a bug**, it is ADR-058 working as
specified. The ledger autosave deliberately never carries the key; `AdminByokKeyPanel.tsx` calls
"Save key" *"the ONLY control on either screen that writes the admin's own credential"* and
*"Never fires automatically"*. The intended flow is type → press "Save key" within the debounce
window → the credential lives server-side → `apiKeyStoredExternally` is true and later wipes are
harmless.

What is real is the **sharp edge**: an operator who types a key and pauses a second, without
pressing "Save key", silently loses it and watches "Test connection" grey out with no
explanation. The same reload also drops `savedByProviderId`, so switching provider and back does
not restore the draft. Worth a UX decision; it is not mine to make and I have not filed it as a
defect.

## 5. What I withheld, and why

`byok-hostile-provider` test 6's "all 10,000 options render" half is **not observable** on this
build: the option nodes exist only while the picker is mounted, and 4d unmounts it. Three
measured attempts — one-shot read → `[]` (menu detached mid-read), plain poll → `4` (the
preset's static `preferredModels`, i.e. the datalist fallback), re-arming poll that re-typed the
key each iteration → still no 10,000 inside 30s. That is the systematic-debugging
three-strikes gate, so I stopped and made the reduction explicit in the file rather than shipping
a flaky assertion.

Not lost: the API-level test in the same file still pins the uncapped 10,000 end to end and
passes. What remains asserted is what is stable — the catalog reaches the form inside the time
bound, and the page stays interactive.

**Do not retry it via "Save key."** Once 4d was re-framed as by-design, the obvious fix was to
press "Save key" so the credential lives server-side and survives the wipe. It would not work,
and this is settled in source rather than by another run: `model-catalog.ts:48-56` fails fast
with `missingApiKeyResponse` for every key-requiring protocol whenever the REQUEST BODY's key is
blank — *"No API key — model discovery needs the key from this browser."* A server-stored
credential never feeds discovery. The wipe blanks `config.byok.apiKey`, which is exactly what
discovery sends, so discovery dies regardless of what is stored. Restoring the assertion needs
the wipe itself addressed, not a workaround in the test.

## 6. Verification — per file, by negative control

An aggregate pass count proves nothing about a migrated test, so each was mutated to its
regression value and observed failing with real data:

| file | control | observed |
|---|---|---|
| credential-persistence t3 | invert `not.toContain("FROM-TAB-A")` | failed, `Received string: ""` |
| credential-persistence t4 | expect Anthropic's key | failed, `Received: "sk-openai-OWN-KEY-NOT-REAL"` |
| state-races t1, t2 | remove `test.fail()` | failed at the PINNED assertions — status count 1, and the literal `"STALE anthropic result — must never land under OpenAI"` under OpenAI's card, not at setup |
| hostile-provider t7 | expect an absent string | failed, `Received array: ["<img src=x onerror=\"window.__xssFired = true\">", "gpt-4o"]` |
| self-heal | expect `keyedBeforeClick + 2` | failed, `Expected: 3, Received: 2` — exactly one keyed request follows the click |

The `test.fail()` control is the one that mattered most: such a test reports identically from the
outside whether it reached its assertion or died on the way there.

`byok-azure-path` was green before and after (6/6 both ways) — its helper adoption removes a
positional `.jini-field` `.last()` locator, not a failure.

## 7. Notes for the coordinator

- **`byok-google-live-smoke` was misattributed by the handoff.** Its failure was
  `strict mode violation: locator('label:has-text("Model") input') resolved to 2 elements` — the
  Max-tokens trap. The dump shows the field still rendering as a plain input with
  `list="jini-byok-model-options"` and `value="gemini-3.6-flash"`, i.e. it never saw the picker.
  It would have failed identically before `3b5d648d`.
- **`byok-model-discovery-self-heal`'s premise is half-retired.** `3b5d648d` also keyed the
  discovery effect on `hasApiKey`, so the reported bug is now fixed a second, better way. The
  spec header said the opposite and is corrected in place.
- **One transient webServer boot timeout** (`Timed out waiting 30000ms from config.webServer`)
  when a run started while the previous run's API was still exiting. A `node --import tsx
  src/index.ts` child briefly outlived its dead Playwright parent, then exited on its own; I did
  not kill it. Ports were clean before the retry, which succeeded.
- **Not investigated, out of scope:** 4d itself, and the live Gemini turn failure.
