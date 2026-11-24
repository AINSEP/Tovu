import { navAvailability as availability } from '@jini-ai/ui/core';

/** This app's copy for a destination that is not available yet. */
const NAV_LABELS = { unavailable: 'Coming soon' } as const;

/** Keep hover explanations on aria-disabled buttons: native disabled suppresses their tooltips. */
export function navAvailability(
  { label, disabled }: { label: string; disabled?: boolean }, _optional = {},
): { 'data-tip': string; title?: string; 'aria-description'?: string } {
  return availability({ label, disabled, labels: NAV_LABELS });
}
