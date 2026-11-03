/** Read once at shell startup; menu changes push the new numeric limit to each shell. */
export const SITE_VIEW_PREFERENCE_CHANNELS = {
  read: 'runner:site-view-preference:read',
  changed: 'runner:site-view-preference:changed',
} as const;
