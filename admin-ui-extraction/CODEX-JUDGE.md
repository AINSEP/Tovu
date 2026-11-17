Software Architect / Refactor(Review): **Verdict: needs rework.**

Read INDEX, every sheet, and all three TSV inventories. Evidence below uses `T:` for Tovu and `J:` for Jini at the requested `refactor/terra` refs; author-base evidence is explicitly marked `f354cfbd` or `96aade8c`. Design references are relative to `admin-ui-extraction/`.

No files were changed. No builds, tests, or browser checks were run.

1. **Blocker — A1 deletes live credential behavior as though it were a re-export shell.**

   **Evidence:** `A-prereqs.md:40` orders deletion of `lib/credential-copy.ts` after repointing its importers to the two moved website files. But `T:apps/admin/src/lib/credential-copy.ts:10` defines `storedCredentialHint`, and `:21` defines `credentialDraftError`. Neither is supplied by those website files. The latter also preserves the important distinction between approved validation errors and arbitrary exceptions. Live callers include `features/security/hooks/use-access-tokens.hooks.ts:1` and `features/deployment/hooks/use-publish-credentials.hooks.ts:2`.

   **Fix:** Inventory every export. Move or retain these implementations, assign their owner, and repoint their callers and tests in the same commit. Delete only the forwarding exports.

2. **Blocker — T1b removes the chart context from the assistant dock.**

   **Evidence:** `T1-adopt-shell.md:35` moves all three authenticated providers into `panels[].render`. Today, `T:apps/admin/src/App.tsx:678` wraps the entire layout, including the assistant, in those providers. `components/AssistantDock/RoutedA2uiSurfaceCard.tsx:75` reads `AdminChartRegistryContext`; its default at `integrations/chart-providers/chart-registry-context.ts:10` contains only the core registry and no provider stylesheets.

   After the planned change, dock cards lose the authenticated chart snapshot. Putting the provider inside individual panel renders also changes its lifetime on navigation.

   **Fix:** Keep one authenticated provider boundary around the shell, dock, and overlays. Add a shell composition seam if necessary. Test chart rendering in the dock and provider identity across route changes and principal changes.

3. **Blocker — Coordinator-only edits are excluded from commits that require them to be green.**

   **Evidence:** `COMMON-ADMIN.md:87–90` reserves export maps and host provider composition for later coordinator edits. Yet `JM-jini-domains-out.md:44–48` introduces imports from new core/ui-kit surfaces, and `T-SCREEN.md:46–49` switches consumers while leaving required registration/provider edits as “coordinator lines.”

   These are executable dependencies. A report containing the missing lines does not make that commit compile or supply its kit at runtime. `COMMON-ADMIN.md:112–113` additionally permits committing and pushing red work, contradicting its green-commit STOP contract at `:71`.

   **Fix:** Define the complete commit transaction, including coordinator-owned edits. Apply required manifests, lockfile changes, registrations, and providers before committing that transaction. Serialize shared files explicitly.

4. **Blocker — JM3 strands an import in admin after moving media.**

   **Evidence:** `JM-jini-domains-out.md:59–65` moves the media folder and `core/ports/<folder>.ts`, then removes the old exports. But `J:packages/admin/src/core/ports/embed-policy.ts:7` imports `ParsedMediaHtmlAttributes` from `../../media/html-attributes.js`. That file disappears in JM3. `core/ports/index.ts:130` still exports `EmbedPolicyPort`.

   The sheet’s domain-folder census misses this reverse dependency outside the moved folder.

   **Fix:** Assign the embed-policy contract and its result types to their final owner, update every consumer and public surface, and remove the obsolete admin port in the same green commit.

5. **Major — J2’s fixed slot list cannot represent the current sidebar.**

   **Evidence:** `J-shell.md:68–76` adds overlays, a before-main slot, no-access rendering, and an assistant override. It supplies no replacement for sidebar navigation composition or rail-control props.

   Current behavior includes:

   - `T:App.tsx:611–635`: mobile header, `SitesSidebarNav`, rail toggle between two navigation slices.
   - `T:App.tsx:607–608`: persisted rail key plus `dockRail`.
   - `T:hooks/use-dock-auto-rail.hooks.ts:59–61`: `railOverride` and `onRailCollapsedChange`.

   `J:AdminShell.tsx:59–66` owns a fixed navigation/footer arrangement and does not pass those rail controls. T1b’s STOP condition will therefore halt on already-visible omissions.

   **Fix:** Complete the sidebar composition contract before declaring T1b runnable. Include a visual/behavior check around 1024px: the proposed 390px and 1440px checks miss the documented 901–1172px auto-rail band.

6. **Major — The permission plan does not resolve filtering before route matching.**

   **Evidence:** `J-shell.md:28–30` adds rules and changes the shell model, but omits `core/manifest/rules.ts` and the public core entry from its file list. Today:

   - `J:react/shell/model.ts:25–29` filters panels before matching the route.
   - `:34–35` converts an unmatched route to the default panel.
   - `core/manifest/rules.ts:34` converts unknown permissions to `[]`.
   - `core/index.ts:33` exports only the existing permission helper.

   Consequently, simply adding any-of filtering can remove the requested panel before J2’s `noAccess` slot can identify it. T1a also expects the new rules to be publicly importable.

   **Fix:** Specify separate sets for route recognition and visible navigation, preserve unknown permissions through the complete model, export the new API, and test denied direct URLs through `AdminShell`, not only the predicate.

7. **Major — J3 assumes capabilities that its existing theme port cannot express.**

   **Evidence:** `J-shell.md:92–100` sends selected theme ID and scheme preference through the existing `AdminThemePreferenceStorePort`, including rejection handling. But `J:react/shell/theme-ports.ts:10–12` reads only a synchronous `ColorSchemePreference | null` and writes only a scheme, returning `void`.

   Tovu’s actual controller uses two asynchronous settings contracts: `T:admin-themes/use-admin-theme.hooks.ts:34–41`. Its document integration also preserves pre-paint state and three attributes; see `admin-themes/apply.ts:60–74`. J3’s STOP at `:101` encounters the direct settings access that already exists.

   **Fix:** Design the actual read/write contract and host adapter first, including theme ID, asynchronous failure, optimistic rollback, pre-paint compatibility, and ownership of document painting.

8. **Major — Security characterization invents behavior instead of recording existing paths.**

   **Evidence:** `S-SECURITY-and-DOCK.md:28–34` requires created-token plaintext to be shown once and every write control to disappear without “the manage permission.”

   The existing vendor-credential interface deliberately returns metadata without reconstructible credentials: author-base `T:f354cfbd:features/security/api/security-api.types.ts:9–18`. The current UI’s permission hook specifically controls the site-key tab: `T:features/security/hooks/use-security-permissions.hooks.ts:8–17`; `Security.tsx:153–163`. Access-token controls are composed separately at `AccessTokensTab.tsx:117–145`.

   The sheet gives neither a per-operation permission map nor evidence of the proposed plaintext-display lifecycle.

   **Fix:** Trace each existing credential operation, its actual server authorization, returned data, and local draft lifecycle. Separate parity tests from proposed hardening. Do not introduce a secret-display path to satisfy an invented characterization test.

9. **Major — Collections is labelled ready despite sharing the unresolved TipTap dependency decision.**

   **Evidence:** `S-screens-ready.md:70–74` moves the entry editor to CMS without a TipTap prerequisite. Yet `T:features/collections/CollectionEntryEditor.tsx:1` imports `@tiptap/react`, and `hooks/use-collection-entry-editor.hooks.ts:2–3` imports both React integration and StarterKit.

   `S-design-first.md:20–21` recognizes this dependency decision for posts only. Collections also imports Tovu’s widget extension at `use-collection-entry-editor.hooks.ts:12`, requiring an explicit extension seam.

   **Fix:** Include collections in D-T4 and the editor ownership design. Specify dependencies, extension injection, and a browser build before making its move sheet executable.

10. **Major — Collections’ proposed characterization changes the write contract and uses an insufficient fake.**

    **Evidence:** `S-screens-ready.md:75–77` requires saving “only changed fields.” Current `T:use-collection-entry-editor.hooks.ts:247–254` sends title, fields, and editor body together. Its publish path deliberately saves first, then publishes using the returned version at `:296–318`.

    The existing fake does not reject stale versions: size-06 `collection-entry-editor-dependencies.hooks.ts:75–79` assigns `expectedVersion + 1` without comparing the stored version.

    **Fix:** Pin the current payload and save-then-publish sequence. Treat field-diffing as a separate behavior change. Use a revision-enforcing fake or transport fixture that demonstrably fails on stale submissions.

11. **Major — S-MENUS misclassifies the page dependency and specifies nonexistent drag-and-drop.**

    **Evidence:** `S-screens-ready.md:55–59` describes an external page-picker component requiring a slot and a drag-reorder mutation test.

    Actual author-base code has:

    - `features/menus/hooks/menus-dependencies.hooks.ts:1–19`: host page API plus `pagePublicPath`, already adapted into `MenusPort.listPages`.
    - `menus-port.hooks.ts:25`: the existing optional page-catalog port.
    - `MenuEditor.tsx:17–19`: explicit “No drag-and-drop.”
    - `use-menu-editor.hooks.ts:338–339`: up/down movement of local state.

    **Fix:** Reuse the existing page-catalog port. Characterize up/down movement and the subsequent save payload. Remove the unnecessary `PagePicker` slot requirement.

12. **Major — JM2 moves known size debt without a planned split.**

    **Evidence:** `JM-jini-domains-out.md:59–65` performs the folder move directly. Its own inventory records `packages/admin/src/seo/react/pages/SeoPage.tsx` as 838 lines. `J:scripts/size-debt.json:108–119` records both function and file violations for it; the approved exception list does not exempt it.

    COMMON forbids adding Jini debt, but JM2 does not inherit T-SCREEN’s split step or provide another partition.

    **Fix:** Add a prerequisite SEO split with named responsibilities, preserved hooks/state ownership, caller updates, and debt retirement. Include its cost in JM2.

13. **Major — Moving the test folders violates the target test boundary, and overlaps G-TESTS.**

    **Evidence:** `JM-jini-domains-out.md:62–63` requires moving all tests into the owner package and preserving that folder’s exact test count.

    Existing tests depend on real admin implementations outside the moved domain:

    - `J:media/react/__tests__/media.test.tsx:3–18`: admin test support, `createAdmin`, overlays, kit, and React bindings.
    - `J:security/react/__tests__/security.test.tsx:3–16`: real admin composition and kit construction.

    After extraction, these become cross-package implementation tests. The separate xpkg `G-TESTS.md:30–35` already owns classification of admin tests and migration of real integration subjects. Neither plan orders that work against JM1–JM5.

    **Fix:** Classify each test before moving it: owner unit test with interface fakes, host binding test, or integration-package test. Reconcile ownership with G-TESTS and preserve the total cases across destinations, rather than requiring an unchanged owner-package count.

14. **Major — The dock plan overlooks components already present in its own inventory.**

    **Evidence:** `S-SECURITY-and-DOCK.md:52` and `INDEX.md:170–171` claim overflow and slow-run UI are embedded in the two giant dock files.

    The author’s inventory instead lists:

    - `MessageOverflowModal.tsx` — 79 lines; hooks — 59.
    - `OverflowAwareMcpUiSurfaceCard.tsx` — 72.
    - `SlowRunNoticeCard.tsx` — 41; hooks — 63.
    - `hooks/useOverflowDetection.hooks.ts` — 79.

    These exist at `f354cfbd`. `OverflowAwareMcpUiSurfaceCard.tsx:25–42` documents a security-relevant single-live-surface invariant. The dock registry already calls the existing registry owner: `T:hooks/use-dock-renderer-registry.hooks.ts:186–193`.

    **Fix:** Repartition using these existing components and registration lifecycle. Separate host endpoint bindings from generic registration. Add a test proving inline and modal surfaces are never simultaneously live, then recalculate the design prerequisite and estimate.

15. **Major — Literal verification commands and debt paths are wrong.**

    **Evidence:** `COMMON-ADMIN.md:79` names `development/size-debt.json` and `development/src-complexity-debt.json`. Actual consumers use:

    - `T:development/scripts/check-size-drift.ts:13`: `development/scripts/size-debt.json`.
    - `check-src-complexity-drift.ts:24`: `development/scripts/src-complexity-debt.json`.

    A1 likewise points to the wrong exception location at `A-prereqs.md:40`; the existing credential dictionary exception is in `development/scripts/size-exceptions.json:20`.

    Also, COMMON’s `cd apps/admin` at `:21` leaves the next root-only npm checks in the wrong directory. Its per-commit bare `npx vitest` at `:71` can run from the root without the admin config. That config supplies required globals and React setup at `T:apps/admin/vitest.config.ts:49–55`.

    **Fix:** Publish commands with explicit working directories, preferably `npm --prefix apps/admin run test -- …`, and correct all policy/debt paths before dispatch.

16. **Major — Destination export contracts and browser isolation remain unresolved.**

    **Evidence:** `JM-jini-domains-out.md:60–61` says to reproduce the five admin export shapes without specifying their complete new specifiers. INDEX advertises `/taxonomy/react`, while `S-screens-ready.md:64` uses `/taxonomy/admin/react`.

    Existing CMS roots already own domain APIs: `J:packages/cms/package.json:175–178` maps `/media` to a Node entry, and `:285–288` maps `/forms` to the existing forms domain. The source admin forms entry also contains wildcard barrels at `packages/admin/src/forms/index.ts:6–7`, contrary to the target rule.

    COMMON’s Node import smoke test at `:78` cannot prove that a React browser entry excludes Node dependencies.

    **Fix:** Supply an exact old-specifier → new-specifier/export-file/runtime table. Preserve existing domain roots, eliminate forbidden barrels explicitly, and build the actual admin browser bundle against the changed packages.

17. **Minor — Locale and STOP checks do not establish the compliance they claim.**

    **Evidence:** `COMMON-ADMIN.md:56–57` specifies 20 translated locales; its cited SEO test lists **21** at `T:features/seo/__tests__/seo-i18n-parity.unit.test.ts:12`.

    Other checks have concrete blind spots:

    - The blob loop at COMMON `:26–27` checks existing inventory rows but never detects newly added files.
    - The lazy-import regex at `:73` misses `() => import('@jini-ai/…')`.
    - The class regex at `:52` misses expression-valued class names.
    - Hook checking is a count ratchet: author-base `J:scripts/check-hook-injection.mjs:41–47` compares component/hook counts, so moving an unchanged debt-bearing component between Jini packages can pass.
    - Equal comment counts do not prove that the original why-comments moved.

    **Fix:** Derive locales from the actual supported set; compare complete file sets; inspect static and dynamic imports; reject hook findings in the complete moved-file set independently of the global ratchet; compare moved comments by content.

Inventory spot-check record: 20 Tovu rows were checked against their recorded author-base blobs and line counts, plus one production row from each of the 11 Jini domain folders. The Tovu samples were:

| Sample | Classification checked |
|---|---|
| `App.tsx` | Shell/host split |
| `App.chrome.tsx` | Chrome/host split |
| `admin-themes/apply.ts` | Mechanics plus host compatibility |
| `features/trash/Trash.tsx` | Domain screen |
| `features/menus/MenuEditor.tsx` | Domain screen; incorrect interaction claim |
| `features/taxonomy/TermPicker.tsx` | Shared domain picker |
| `features/collections/Collections.tsx` | Content-type/entry split |
| `features/roles/Roles.tsx` | Dedupe candidate |
| `features/security/Security.tsx` | Security composition |
| `features/security/hooks/use-copy-keys.hooks.ts` | Metadata/grant flow |
| `features/consent/CookieConsent.tsx` | Host revisions binding |
| `features/forms/index.ts` | Host module mount |
| `features/seo/index.ts` | Host module mount |
| `features/comments/index.ts` | Host module mount |
| `features/widgets/index.ts` | Host module mounts |
| `features/redirects/index.ts` | Host module mount |
| `features/posts/api/posts-api.ts` | size-06 host HTTP client |
| `components/AssistantDock/RoutedA2uiSurfaceCard.tsx` | Generic rendering plus host contexts |
| `features/auth/index.ts` | Existing forwarding entry |
| `lib/credential-copy.ts` | Mixed forwarding and live helpers |

I found no independent admin-screen ownership in the K/T, S/U, or left-out sheets inspected. The unresolved cross-plan test ownership is finding 13; the acknowledged R1c overlap still requires serialization. Runtime parity, actual build outcomes, and unrecorded owner approvals remain unverified.

## Recurring mistake classes

No additional class beyond lessons 1–31 and the explicit owner rules.
