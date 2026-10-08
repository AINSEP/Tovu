import { Icon, ICON_PATH_DATA } from "@jini-ai/ui";
/** Decorative document and chevron glyphs from agent-plugins-visuals' line family. */
export function SkillDocumentIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ICON_PATH_DATA["document-outline-compact"]} />
    <path d="M14 3.5v4h4M9.3 12.2h5.4M9.3 15.6h5.4" />
  </svg>;
}

export function SkillChevronIcon() {
  return <Icon name="chevron-right-wide" size={14} focusable={undefined} className="agent-plugin-chevron-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" />;
}
