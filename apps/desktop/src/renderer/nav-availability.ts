/** Keep hover explanations on aria-disabled buttons: native disabled suppresses their tooltips. */
export function navAvailability(
  { label, disabled }: { label: string; disabled?: boolean }, _optional = {},
): { 'data-tip': string; title?: string; 'aria-description'?: string } {
  if (!disabled) return { 'data-tip': label };
  return { 'data-tip': `${label} — Coming soon`, title: 'Coming soon', 'aria-description': 'Coming soon' };
}
