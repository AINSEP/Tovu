# External audit — gpt-5.6-terra (xhigh) on the containment-extraction range

Generated 2026-08-21 · `codex-cli 0.148.0`, `gpt-5.6-terra`, `model_reasoning_effort=xhigh`
Scope: `fad50a6c..75c174c4` (6 commits) · 46 command_execution events · `turn.completed`, zero `error`/`turn.failed`
Read-only dispatch; no coverage run (instructed not to).

Raw JSONL: session scratchpad only (not committed).

---

## Findings

1. **Moderate — test-only public API remains.** [site-exporter.ts](/Users/la/Programming/Tovu/src/export/site-exporter.ts:548) exports `redirectOutcomeFor`, but its only external importer is the test at [site-exporter.test.ts](/Users/la/Programming/Tovu/src/export/__tests__/site-exporter.test.ts:12). It is not re-exported by `src/export/index.ts`; production only calls it internally at line 564, which does not require `export`.

   This narrowly preserves the claim that the four named transports/types are private, but fails the broader “no function exported solely for tests” goal. The concrete failure mode is API leakage: a consumer can deep-import an unsupported test seam and acquire an accidental contract.

2. **Low — `resolvePathWithin` over-refuses valid absolute roots with a trailing separator (and `/`).** [path-containment.ts](/Users/la/Programming/Tovu/src/core/path-containment.ts:20) builds its prefix from the original `root` string.

   `resolvePathWithin("/tmp/export/", "theme-assets/basic.css")` returns `null`: both resolved paths are `/tmp/export/theme-assets/basic.css`, but the prefix becomes `/tmp/export//`. Likewise, root `/` rejects every child because the prefix becomes `//`.

   This is not an extraction regression—the replaced implementations behaved identically—and the current middleware normalizes roots first. The CLI also resolves `--out`. But programmatic `exportSite({ outputDir: "/tmp/export/" })` can still mark otherwise-valid assets as refused, so the new shared helper is not fully general as documented.

## Confirmed

- The two containment call sites are behaviorally byte-equivalent to `fad50a6c`: same argument order, same URL decode/leading-slash removal in the exporter, and the middleware’s `""` / `__` / dot guards still execute before the helper.
- `writeRedirectRoute`, `fetchOneAsset`, `RouteWriteOutcome`, and `resolveAssetPathWithinOutputDir` are private again.
- `redirectOutcomeFor` preserves the old status, `Location ?? redirectTarget`, and empty-value behavior exactly. The existing integration redirect test exercises the normal live-header path.
- No added casts, non-null assertions, coverage-ignore pragmas, or removed containment checks were found in this range. The asset check moved to `fetchAssets` before network I/O.
- The new middleware wiring test is load-bearing: replacing the helper with `path.resolve(root, themeId)` resolves its encoded `foo/../../outside-secret` payload to the real sibling directory, so `marker.txt` would be `200`, not `404`.
- The corrected crawl comment is accurate: `extractAssetUrls` is a raw double-quoted `href`/`src` scan with only fragment stripping; it does not parse or decode URLs. `extractCssUrls` does use `URL(...).pathname`, but the comment no longer incorrectly generalizes that behavior.
- `..` and absolute segments are refused. Windows separators are handled as separators on Windows and literal filenames on POSIX. Percent encoding is decoded before the exporter helper call and by Express before the middleware call. Symlink and NUL-byte handling are lexical rather than physical; symlink escape is mitigated for supported theme packages by their separate symlink-rejecting validation, but is not a property this helper itself guarantees.

## Suspected / untested surface

No additional in-repo `#src/core/index` consumers exist beyond the two changed call sites, and both scoped suites load that barrel. The remaining untested risk is package/declaration or external deep-import consumers of the newly expanded core barrel; I found no concrete in-repo break.

I did not run coverage, per the instruction not to run it unprompted, so I cannot independently attest to the exact `129/129` figure—only that the source shows no suppression or branch deletion used to manufacture it.

**Fix first:** make `redirectOutcomeFor` non-public (or explicitly promote it to a supported production API); its current `export` is solely to let the test import it.
