import { getNav, type AdminNavItem } from "../nav";
import { useWiredAdminLocale } from "../hooks/use-admin-locale.hooks";
import { translateAdminNavLabel } from "../lib/admin-nav-i18n";
import { DEFAULT_LOCALE } from "../lib/settings-tabs";
import { interpolate } from "../lib/template-i18n";

/**
 * @file Fallback screen for a section with no dedicated component yet — reached either directly
 * (`App.tsx`'s `SECTIONS` map, e.g. `newsletter`) or via the legacy `/section/:id` route's
 * fallback for any id `parseRoute` accepts without checking it against a known section.
 *
 * Previously looked up `props.sectionId` in a separate, legacy admin-shell registry (a shared,
 * framework-agnostic shell package, since removed as dead code) that only carried 12 of the ~26
 * current sections and never had `newsletter` added. A legitimate `soon: true` nav item therefore
 * fell through to the exact same "Unknown section" error banner as an actual typo'd/bogus id —
 * audit finding (`ADS-memory/reports/audits/20260801-admin-adversarial-ux-audit.md`, Newsletter
 * section + exec summary #3): "any future `soon` nav item is one omission away from the same bug,"
 * confirmed live via `/admin/newsletter` and the `/section/:id` fallback both rendering the
 * identical banner.
 *
 * Fixed at the root rather than by adding `newsletter` to the legacy registry (which would leave
 * the same trap for the next `soon` item): looks up `props.sectionId` in `nav.ts`'s own `getNav()`
 * instead, which already carries every current section's `label` (`soon` included) and cannot
 * drift out of sync with itself the way a second parallel list can. `Unknown section` stays
 * reserved for an id that matches nothing in `getNav()` at all — a genuine bogus id, not a
 * known-but-unbuilt section (see `nav.ts`'s own file header: presence in the nav is about sidebar
 * visibility, not reachability, so this only needs `getNav()` to know a section is real).
 *
 * ## Two consumers, two lookup needs
 *
 * This module now has two exported entry points with genuinely different lookup requirements, not
 * one. `Placeholder` is the id-lookup case above: it is always handed a real `nav.ts`/`panels.tsx`
 * `id` and resolves the label/group through `getNav()`. `ComingSoonNotice` is the body markup with
 * that lookup stripped out — `components/PlaceholderTabs.tsx` needs the identical "coming soon"
 * copy per TAB, and a tab id (`stripe`, `github`, `google`) is panel-local and was never registered
 * in `nav.ts`, so `findNavItem`'s id lookup has nothing to resolve it against. `PlaceholderTabs`
 * instead calls the exported `findNavGroupLabel` once against its own panel's `sectionId` (which
 * *is* a real nav id) for the kicker, then renders `ComingSoonNotice` directly per tab with that
 * kicker and the tab's own label — no second "coming soon" shape, just the id-lookup step made
 * optional for the caller that cannot supply an id `getNav()` would recognize.
 */

/**
 * @complexity O(n) in the total nav item count across all groups (currently ~26) — a linear scan,
 * acceptable for a lookup that runs once per Placeholder render against a small, static list.
 * @overallScore 100
 */
function findNavItem(sectionId: string): AdminNavItem | undefined {
  for (const group of getNav()) {
    const item = group.items.find((entry) => entry.id === sectionId);
    if (item) return item;
  }
  return undefined;
}

/** The nav group this item lives in, for the page header's kicker — "Overview" for the ungrouped
 *  top row (matches how `AiAssistant.unit.test.tsx` itself describes that row), otherwise the
 *  group's own `label`. Real IA, not an invented word: every kicker in this pass reuses a `nav.ts`
 *  group label rather than a per-screen ad hoc string.
 *
 * Exported (not just used internally) so `PlaceholderTabs` can derive a tabbed section's own
 * kicker from the same source of truth instead of a hardcoded literal that could drift from the
 * group name in `panels.tsx`. */
export function findNavGroupLabel(sectionId: string): string {
  for (const group of getNav()) {
    if (group.items.some((entry) => entry.id === sectionId)) return group.label ?? "Overview";
  }
  return "Overview";
}

/**
 * The actual "not built yet" body markup — this repo's one idiom for an announced-but-unbuilt
 * section (see the file header). Split out from `Placeholder` so `PlaceholderTabs` can reuse the
 * identical honest copy per tab: a tab id (`stripe`, `github`) has no entry of its own in
 * `nav.ts` for `Placeholder`'s `sectionId` lookup to resolve, so it cannot call `Placeholder`
 * directly, but it must not grow a second "coming soon" shape either.
 */
const COMING_SOON_TEMPLATE: Record<string, string> = {
  en: "{label} is coming soon.",
  es: "{label} estará disponible próximamente.",
  id: "{label} akan segera hadir.",
  de: "{label} ist bald verfügbar.",
  "zh-CN": "{label} 即将推出。",
  "zh-TW": "{label} 即將推出。",
  "pt-BR": "{label} estará disponível em breve.",
  ru: "{label} скоро появится.",
  fa: "{label} به‌زودی در دسترس خواهد بود.",
  ar: "{label} قريبًا.",
  ja: "{label}は近日公開予定です。",
  ko: "{label}은(는) 곧 제공될 예정입니다.",
  pl: "{label} będzie dostępne wkrótce.",
  hu: "A(z) {label} hamarosan elérhető.",
  fr: "{label} sera bientôt disponible.",
  uk: "{label} незабаром зʼявиться.",
  tr: "{label} yakında kullanıma sunulacak.",
  th: "{label} จะพร้อมใช้งานเร็ว ๆ นี้",
  it: "{label} sarà disponibile a breve.",
};

/** "X is coming soon." in the caller's locale — `label` here is already translated (by
 *  `Placeholder`, via `translateAdminNavLabel`) by the time it reaches this component. */
function comingSoonDescription(locale: string, label: string): string {
  return interpolate(COMING_SOON_TEMPLATE[locale] ?? COMING_SOON_TEMPLATE.en, { label });
}

export function ComingSoonNotice(props: { kicker: string; label: string; locale?: string; note?: string }) {
  const locale = props.locale ?? DEFAULT_LOCALE;
  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{props.kicker}</p>
          <h1 className="page-title">{props.label}</h1>
          <p className="page-description">{comingSoonDescription(locale, props.label)}</p>
          {/* Optional second line for a section whose label alone could be mistaken for a
              DIFFERENT, already-shipped screen (`admin-appearance`, 2026-08-10: "Appearance" sits
              in the same Studio group as `id: "themes"`, itself labelled "Themes" but also
              rendering as an `Appearance` component under the hood — see `panels.tsx`'s own
              comment on that collision). Every other `soon` caller omits `note` and renders
              exactly as before; this does not become a second "coming soon" shape, just an
              optional extra sentence in the one that already exists. Untranslated, same disclosed
              precedent as `PostEditor.tsx`'s template picker (2026-08-10): this repo's 19-locale
              dictionaries are out of scope for a one-line disambiguation note. */}
          {props.note ? <p className="page-description">{props.note}</p> : null}
        </div>
      </div>
    </div>
  );
}

const UNKNOWN_SECTION_PREFIX: Record<string, string> = {
  en: "Unknown section",
  es: "Sección desconocida",
  id: "Bagian tidak dikenal",
  de: "Unbekannter Abschnitt",
  "zh-CN": "未知部分",
  "zh-TW": "未知區塊",
  "pt-BR": "Seção desconhecida",
  ru: "Неизвестный раздел",
  fa: "بخش ناشناخته",
  ar: "قسم غير معروف",
  ja: "不明なセクション",
  ko: "알 수 없는 섹션",
  pl: "Nieznana sekcja",
  hu: "Ismeretlen szakasz",
  fr: "Section inconnue",
  uk: "Невідомий розділ",
  tr: "Bilinmeyen bölüm",
  th: "ส่วนที่ไม่รู้จัก",
  it: "Sezione sconosciuta",
};

export function Placeholder(props: { sectionId: string; note?: string }) {
  // Deliberately NOT hook-injected (2026-08-12 sweep ruling): this is a terminal-leaf call — no
  // other host dependency in this file to combine it with, not rendered in a loop, and its only
  // renderers (App.tsx, panels.tsx) are both out of scope — so there is no duplicate fetch to
  // eliminate and no coverage a wrapper hook would add. Do not "fix" this for consistency. Points at
  // `useWiredAdminLocale` (2026-08-14) only because `useAdminLocale` itself now requires an injected
  // port — same non-decision otherwise.
  const locale = useWiredAdminLocale();
  const item = findNavItem(props.sectionId);
  if (!item) {
    const unknownSectionPrefix = UNKNOWN_SECTION_PREFIX[locale] ?? UNKNOWN_SECTION_PREFIX.en;
    return (
      <div className="notice error">
        {unknownSectionPrefix}: {props.sectionId}
      </div>
    );
  }

  return (
    <ComingSoonNotice
      kicker={translateAdminNavLabel(locale, findNavGroupLabel(props.sectionId))}
      label={translateAdminNavLabel(locale, item.label)}
      locale={locale}
      note={props.note}
    />
  );
}
