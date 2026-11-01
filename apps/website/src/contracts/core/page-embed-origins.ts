/** Vetted owner-requested page embeds: guidance and public CSP must share these exact origins.
 * Calendly documents the script at https://calendly.com/help/advanced-calendly-embed-for-developers
 * and the booking frame at https://calendly.com/help/how-to-embed-calendly-with-an-iframe. */
export const PAGE_EMBED_ORIGINS = {
  script: "https://assets.calendly.com",
  frame: "https://calendly.com",
} as const;
