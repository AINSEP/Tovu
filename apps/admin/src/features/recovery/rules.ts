import type { AdminDegradedBanner, DatabaseContextEnvelope } from "../../lib/api";
import { t } from "./recovery-i18n";
import { interpolate } from "../../lib/template-i18n";

/**
 * @file Pure logic for the `recovery` feature — everything that computes a value rather than
 * rendering one. Follows the convention `features/posts/rules.ts` establishes: no React, no
 * hooks, importable and directly testable.
 */

const CATEGORY_LABELS: Record<string, string> = {
  posts_pages: "posts/pages writes",
  plugin_table: "plugin-table rows",
};

const UNTAUGHT_CATEGORY_TEMPLATE: Record<string, string> = {
  en: "{category} writes",
  es: "escrituras de {category}",
  id: "penulisan {category}",
  de: "{category}-Schreibvorgänge",
  "zh-CN": "{category} 写入",
  "zh-TW": "{category} 寫入",
  "pt-BR": "gravações de {category}",
  ru: "записи {category}",
  fa: "نوشتن {category}",
  ar: "عمليات كتابة {category}",
  ja: "{category}の書き込み",
  ko: "{category} 쓰기",
  pl: "zapisy {category}",
  hu: "{category} írások",
  fr: "écritures {category}",
  uk: "записи {category}",
  tr: "{category} yazmaları",
  th: "การเขียน {category}",
  it: "scritture {category}",
};

/** Human label for one discarded-write-window category (design-spec.md §4.3). Falls back to
 *  `"<category> writes"` for a category the server sends that this table has not been taught yet,
 *  so a new category degrades to readable-but-generic copy instead of `undefined`.
 *
 * Translated via `recovery-i18n.ts`'s `t()`, same two-step fallback as every other translated
 * string in this app: the untaught-category fallback template is translated as a whole (word order
 * differs between "<category> writes" and Spanish "escrituras de <category>"), not word-by-word. */
export function categoryLabel(category: string, locale: string): string {
  const known = CATEGORY_LABELS[category];
  if (known) return t(locale, known);
  return interpolate(UNTAUGHT_CATEGORY_TEMPLATE[locale] ?? UNTAUGHT_CATEGORY_TEMPLATE.en, { category });
}

/** Short, human badge text for a `restorePoint.costClass`/`status.costClass` value. Never rendered
 *  as the raw `"cheap"`/`"expensive"`/`"unavailable"` enum value itself — that leaked straight into
 *  the "Restore capability:" status bar as-is before this fix, meaningless to an operator who does
 *  not know the API's own vocabulary. Falls back to the raw value for anything this table hasn't
 *  been taught, same defensive shape as {@link categoryLabel}, since `AdminRestorePoint.costClass`
 *  is typed as plain `string` (not the `RestorePointCostClass` union `AdminRecoveryStatus.costClass`
 *  gets), so a server sending an unrecognised value must not throw here. */
const COST_CLASS_LABELS: Record<string, string> = {
  cheap: "Fast restore",
  expensive: "Costly restore",
  unavailable: "Restore unavailable",
};

export function costClassLabel(costClass: string, locale: string): string {
  const known = COST_CLASS_LABELS[costClass];
  return known ? t(locale, known) : costClass;
}

/** Longer explanation for the same value, meant for an {@link InfoTip} on the top-of-page capability
 *  badge only (design-spec.md §2.2's `CapabilityStatusBar`) — the per-row/per-flow badges stay
 *  compact with just {@link costClassLabel}'s short text, matching this app's existing "detail lives
 *  in a hover affordance, not a repeated paragraph" convention (see `ThemeExplore.tsx`'s own
 *  `InfoTip` use). Reuses the existing `"No restore-point mechanism available — see the runbook."`
 *  copy for `unavailable` rather than minting new text, since `RestorePointsList`'s per-row cell
 *  already says exactly that in the same situation and the two should agree. */
const COST_CLASS_EXPLANATIONS: Record<string, string> = {
  cheap: "Restore points are lightweight file snapshots — fast and low-impact to capture or restore.",
  expensive: "Restore points are full database dumps — capturing or restoring takes longer and uses more resources.",
  unavailable: "No restore-point mechanism available — see the runbook.",
};

export function costClassExplanation(costClass: string, locale: string): string | null {
  const known = COST_CLASS_EXPLANATIONS[costClass];
  return known ? t(locale, known) : null;
}

/** Visual severity for a Recovery degraded banner — `.notice.error` vs `.notice.warning`, both
 *  already in `styles.css` (no new CSS). Mirrors `Database.tsx`'s `resolveSchemaStateWarning`
 *  `tone` field, the identical precedent for "not every degraded state is an error."
 *
 * `migration-interrupted`/`pending-migration` block normal Recovery/Database use until an operator
 * resolves them, and `cost-unavailable` means this site has no restore mechanism at all — all three
 * stay `error`. `operation-in-flight` is a transient, self-resolving wait (nothing is broken, a
 * restore/migrate is already running), and `watermark-baseline-unavailable` only narrows the
 * discarded-write disclosure to `"unknown"` counts — restoring itself still works — so both of
 * those are `warning`, not `error`. Independent of {@link isAssertiveRecoveryBanner}: one axis is
 * "how urgently should this interrupt," the other is "how bad is this," and the two don't move
 * together (`cost-unavailable` is `error` but not assertive).
 *
 * @complexity Time/space: O(1) — one membership check.
 */
export function recoveryBannerTone(banner: AdminDegradedBanner): "error" | "warning" {
  return banner.kind === "operation-in-flight" || banner.kind === "watermark-baseline-unavailable"
    ? "warning"
    : "error";
}

/**
 * Whether a Recovery degraded banner needs `role="alert"`/`aria-live="assertive"` rather than the
 * default polite announcement.
 *
 * AC-27/EC-06/INV-07: `pending-migration`'s action always deep-links to Database's own migration
 * ceremony, never a Recovery restore action — restoring to an older snapshot does not resolve
 * schema drift against the current runtime. Both this kind and `migration-interrupted` are urgent
 * enough that the operator should not have to notice them on their own.
 *
 * @complexity Time/space: O(1) — two fixed comparisons.
 */
export function isAssertiveRecoveryBanner(banner: AdminDegradedBanner): boolean {
  return banner.kind === "migration-interrupted" || banner.kind === "pending-migration";
}

/** Discriminated parse result for {@link parseDeepLinkEnvelope} — `ok: false` carries no reason
 *  because the caller's only response to either failure mode is the same silent no-op. */
export type DeepLinkEnvelopeParseResult = { ok: true; envelope: DatabaseContextEnvelope } | { ok: false };

/**
 * Client-side shape check for a deep-link envelope pulled out of `sessionStorage` — valid JSON,
 * nothing deeper. `resolveRecoveryDeepLink` (the server) always re-verifies `restorePointId`
 * itself (ADR-041 §7/ADR-045 §5, INV-04); this only decides whether the envelope is even worth
 * sending. `ok: false` on anything unparseable — a `JSON.parse` throw only, deliberately NOT a
 * truthiness check on the parsed value, so a literal `"null"`/`"0"`/`"false"` payload (valid JSON,
 * falsy value) is still forwarded rather than silently swallowed here, matching the original
 * `try { envelope = JSON.parse(raw) } catch { return }` guard exactly. The caller treats `ok:
 * false` as "no deep link", same as no envelope having been stashed at all — a
 * malformed/forged/stale value is an expected, non-exceptional case, not an error toast.
 *
 * @complexity Time/space: O(1) beyond `JSON.parse`'s own cost in input length.
 */
export function parseDeepLinkEnvelope(raw: string): DeepLinkEnvelopeParseResult {
  try {
    return { ok: true, envelope: JSON.parse(raw) as DatabaseContextEnvelope };
  } catch {
    return { ok: false };
  }
}
