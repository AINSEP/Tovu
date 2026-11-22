REVIEW r62t-rev-ex6 COMPLETE

### K4-i18n-common.T — FIX

1. `apps/admin/src/lib/i18n-common.ts:63` — Remove the new public `composeCommonDictionary({ generic, host })` helper. Its inputs and behavior are product-neutral, so exporting it from Tovu conflicts with Jini First. Build `COMMON_I18N` directly from the Tovu locale rows, spreading the matching Jini locale first and the branded entry last. Keep the precedence and missing-locale tests against `COMMON_I18N` using a mocked Jini dictionary. Update the comment at line 12 to say that a Tovu locale missing from Jini throws. Tovu’s locale list governs which locales are exposed.

I compared the source data across both repositories. All 21 locales retain their original order and translation values, including the branded entry at extras index 27. Current callers correctly keep the host import. The composition adds no re-export shell. The recorded Spanish `Save` deletion fails three Tovu assertions, including the corrected cross-locale parity gate.

### K4-seam-1.T — APPROVE

All 60 catalog files changed only their type imports and retain `as const satisfies`. The projection and evaluator use `HostToolApprovalPolicy`, and all six rule names and classifier behavior are preserved. The old module and both headless type re-exports are gone. The importer sweep found no remaining references. The B6 surface and vault cutovers remain deferred as specified.

The final test log records all four TW3 cases passing. The recorded catalog typo fails compilation at the projection boundary, and Jini’s `rule?: never` mutation fails its named-rule type fixture. The builder report records that the approval module deletion landed one commit before its import repoints. Integrate those changes together if intermediate commits must type-check.

### RT-K1-0.T — APPROVE

All refusal and cap consumers resolve to the landed Jini entry points, and the importer sweep found no legacy symbols. The refusal preserves the flat status and body, omitted optional fields, and `_optional` pad. The settings mount and its guard order are preserved. Express still enforces the 1 MiB cap and returns `413` with `{ error: "Content too large to save.", code: "PAYLOAD_TOO_LARGE" }`.

Dropping `code` fails the recorded settings parity and affected route tests. Increasing the cap by one byte fails the boundary test. The three failures in the route stay suite also occur at the base.

### A-K2-0a.T — APPROVE

`apps/admin/src/integrations/jini-kits.ts:20` supplies UI `Icon`, UI `useT`, and the four required values through `satisfies AdminKit`. The chat translator remains separate, the dock still reads the dictionary at call time, and the `TabBarTab` repoints remain deferred. This slice removes no import path and adds no re-export shell.

The host test renders the real Icon through the provider and checks value identity. The recorded UI-to-chat translator swap fails the identity assertion while type-checking still passes, so the test covers a distinction the type system cannot enforce.

**Registry-backed integration gate.** These verdicts cover the specified linked Jini baseline. `package-lock.json:3073` and `apps/admin/package-lock.json:1242` still pin the `0.7.3-next.2` registry artifacts, and the Jini report says merge-14 was neither versioned nor published. Before merging into a branch that builds from the registry, publish artifacts containing the reviewed APIs, update the Tovu dependency ranges and lockfiles, and run the existing registry-only gate.

I reviewed the committed source and mutation records. I changed no files and ran no tests, builds, installs, or type-checks.
