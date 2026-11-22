REVIEW r62t-rev-ex2a COMPLETE

### `codex/ex2-k4-i18n-common-jini` — APPROVE

I compared the moved code with Tovu `41e948ee4a`. All retained keys and translations match byte for byte across the 21 locales. The split removes exactly index 27 from the extras keys and every value row. The assembly order, missing-translation errors, and why-comments are preserved. The internal base file keeps the move within the size gate and leaves `ADMIN_COMMON_I18N` as the sole public export. The manifest, API baseline, and patch changeset agree.

The tests exercise the assembled dictionary. Deleting Spanish `Save` breaks the pinned `"Guardar"` assertion, the cross-locale parity assertion, and the three-key coverage assertion.

**Tovu cutover.** Keep the original locale list, spread the Jini dictionary first, and add each locale’s branded entry last. The existing Tovu parity test will catch the same Spanish `Save` mutation. When `use-publish-content-confirm.hooks.ts:1241` moves, supply its branded message through the existing args or props. `PublishContentDialog.unit.test.tsx:1135` already asserts the rendered notice.

### `codex/ex2-a-k2-0a-jini` — FIX

1. **`packages/admin/src/react/kit.tsx:123`** — Add the 13 icon names used by the confirmed migration callers below and regenerate the API baseline. All 13 exist in UI’s `IconName`. The host’s `satisfies AdminKit` assignment accepts the current narrower union, so it misses the JSX errors that appear when these screens switch imports.

   | Tovu caller under `apps/admin/src/features/` | Missing names |
   |---|---|
   | `database/Database.tsx:509` | `timeline`, `migrate-forward` |
   | `import-export/import-export-tabs.tsx:35` | `tray-export`, `tray-import`, `more-horizontal-outline` |
   | `library/Library.hooks.tsx:28` | `tray-upload`, `document-lines` |
   | `media/Media.hooks.tsx:28` | `tiles-four`, `picture-frame`, `video-frame`, `cloud-outline`, `bin-lidded` |
   | `skills/SkillRow.tsx:17` | `document-marked` |

2. **`packages/admin/src/react/kit.tsx:296` and `:310`** — Give the new public `useT` and `useAdminKitValues` facades two empty object parameters, defaulted as `_required = {}` and `_optional = {}` so existing zero-argument calls still work. Keep forwarding to the injected UI hook and returning its translator by identity. Preserve the host translator’s existing `(key, vars?)` contract and refresh the API baseline for the facade signatures.

**Minor notes.** The `Icon` test verifies provider routing and prop forwarding. Returning a replacement translator fails the `useT` identity assertion, and recreating any injected object or array fails its value identity assertion. The current API baseline matches the source exports, and the minor changeset calls out the required host fields. The diff adds no cross-package implementation imports, direct screen hook calls, or size and complexity violations.

**Tovu cutover.** Pair the Jini change with `apps/admin/src/integrations/jini-kits.ts:27`, where the host must supply `components.Icon`, `hooks.useT`, and `values`. Keep the UI and chat translators distinct, preserve the dock’s call-time dictionary lookup at `assistant-dock-i18n.ts:2189`, and defer `TabBarTab` repoints that use `disabled`, `dot`, or `dotLabel`.

This was a read-only review. No files changed, and no tests, builds, installs, or type-checks ran. Mutation verdicts are based on the assertions and the builder reports.
