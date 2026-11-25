import { Placeholder as JiniPlaceholder, ComingSoonNotice as JiniComingSoonNotice } from "@jini-ai/admin/react/shell/Placeholder";
import { getNav } from "../nav";
import type { UseAdminLocaleHook } from "@jini-ai/admin/react/kit";
import { translateAdminNavLabel } from "../lib/admin-nav-i18n";
import { DEFAULT_LOCALE } from "../lib/settings-tabs";

import { interpolate, localeEntry } from '@jini-ai/core/text';
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
 * ## Two exported entry points
 *
 * `Placeholder` is the id-lookup case above: it is always handed a real `nav.ts`/`panels.tsx` `id`
 * and resolves the label/group through `getNav()`. `ComingSoonNotice` is the body markup with that
 * lookup stripped out, for a caller whose id `getNav()` would not recognize. Its one other caller,
 * `components/PlaceholderTabs.tsx` (one "coming soon" notice per panel-local tab id), was deleted
 * 2026-09-21 as dead code, so today `Placeholder` is its only caller.
 */

/**
 * The actual "not built yet" body markup — this repo's one idiom for an announced-but-unbuilt
 * section (see the file header). Split out from `Placeholder` for a caller with no `nav.ts` id to
 * look up; that caller, `PlaceholderTabs`, was deleted 2026-09-21 as dead code.
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
function comingSoonDescription({ locale, label }: { locale: string; label: string }, _options: Record<string, never> = {}): string {
  return interpolate({ template: localeEntry({ table: COMING_SOON_TEMPLATE, locale }), vars: { label } });
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

const copy = {
  fallbackLocale: DEFAULT_LOCALE,
  defaultGroupLabel: "Overview",
  unknownSectionPrefix: ({ locale }: { locale: string }) => localeEntry({ table: UNKNOWN_SECTION_PREFIX, locale }),
  unknownSectionLabel: "Unknown section",
  comingSoonDescription,
  comingSoonLabel: ({ label }: { label: string }) => `"${label}" is not built yet`,
};

export function ComingSoonNotice(props: Omit<Parameters<typeof JiniComingSoonNotice>[0], "copy">) {
  return <JiniComingSoonNotice {...props} copy={copy} />;
}

export function Placeholder(props: {
  sectionId: string;
  note?: string;
  agentHandle?: string;
  useAdminLocaleHook: UseAdminLocaleHook;
}) {
  return <JiniPlaceholder {...props} navGroups={getNav()} translateNavLabel={translateAdminNavLabel} copy={copy} />;
}
