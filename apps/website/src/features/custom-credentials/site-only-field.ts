import type { SecretCardForm } from "@jini-ai/ui/mcp-ui/secret-card";

/**
 * @file "Only for this site" on a key card (owner 2026-10-25): a key saves to the project store, so
 * every site of the project can use it, unless this box is ticked. Offered only where a project store
 * is attached (local web + desktop); on Fly the project is the site, so the box would mean nothing.
 * Last on the form and unticked: the common case never has to look at it.
 */

const SITE_ONLY = "onlyThisSite";

/** The form with the "Only for this site" box appended when `shared` (a project store is attached). */
export function withSiteOnlyField<F extends SecretCardForm>({ form, shared }: { form: F; shared: boolean }, _optional = {}): F {
  if (!shared) return form;
  return { ...form, fields: [...form.fields, { kind: "boolean", name: SITE_ONLY, label: "Only for this site",
    hint: "Leave unticked so every site in this project can use this key.", value: false }] };
}

/** `"site"` when the box was ticked; undefined (the project-first default) otherwise. */
export function siteOnlyScope({ values }: { values: Readonly<Record<string, unknown>> }, _optional = {}): "site" | undefined {
  return values[SITE_ONLY] === true ? "site" : undefined;
}
