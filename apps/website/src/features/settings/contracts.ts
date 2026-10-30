/** Public site-identity publishing allowlist. A setting must also pass the secret/scope checks in publish-content. */
/** `namespace:key` -> the label the publish dialog shows. */
export const PUBLISHABLE_SETTINGS: Readonly<Record<string, string>> = {
  "core.site:title": "Site title",
  "site.seo:title_template": "SEO title template",
  "site.seo:default_description": "Default description",
  "site.seo:default_og_image": "Default share image",
  "site.seo:twitter_site": "X (Twitter) handle",
};

