/**
 * @file Wire types for the Source Control connection page.
 *
 * Every other admin feature's wire types live in one place, `apps/admin/src/lib/api.ts`, right
 * beside the `api.*` methods that use them (`AdminPublishCredentialSummary` and its four
 * `listPublishCredentials`/`createPublishCredential`/`updatePublishCredential`/
 * `deletePublishCredential` siblings are the closest precedent this file follows). These types stay
 * LOCAL to this feature instead, purely because of this dispatch's file boundary — `lib/api.ts` was
 * not in scope to edit. Once a `source_control_credential_sets` backend slice lands (see this
 * feature's own handoff note on the reuse-vs-new-table question), these types and the four
 * `api.*`-shaped methods `hooks/source-control-credentials-dependencies.hooks.ts` calls should fold
 * into `lib/api.ts` proper — a mechanical move, not a redesign, since the shape below was written to
 * match that precedent exactly.
 */

/** The three providers this page can save a connection for. GitHub first — the one that matters,
 *  per the brief this page was built from; GitLab and Bitbucket are real, connectable rows, not
 *  stubs. Deliberately its own union, not reusing `AdminPublishCredentialProviderId`
 *  (`"github-pages" | "vercel" | "netlify" | "cloudflare-pages"`) — that type is a deploy-target id
 *  by design (aliased to `AdminStaticPublishTargetId` so the two can never drift), and none of
 *  GitLab, Bitbucket, or a *source* GitHub account is a static-publish target. */
export type AdminSourceControlProviderId = "github" | "gitlab" | "bitbucket";

/**
 * One saved connection's non-secret summary — never carries the token itself, and (like
 * `AdminPublishCredentialSummary`) deliberately carries no masked/last-4 hint either. A stored
 * token is never read back once saved; this is the fact a row's UI has to render its
 * connected/not-connected state from.
 */
export interface AdminSourceControlCredentialSummary {
  readonly id: string;
  readonly providerId: AdminSourceControlProviderId;
  readonly label: string;
  readonly configured: true;
  readonly isDefault: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * What a create/update call sends. A closed discriminated union on `providerId`, same shape
 * `AdminPublishConnectionInput` uses for the same reason: a provider that needs a field beyond the
 * universal `token` gets it here, typed, rather than every provider silently carrying every other
 * provider's optional fields. Bitbucket is the one provider here that needs a second field — its
 * API authenticates an app password against the username it belongs to, not the password alone
 * (see `rules.ts`'s `SOURCE_CONTROL_PROVIDERS` for the citation) — the same "one provider needs one
 * extra required field" shape Cloudflare Pages' `accountId` already established on the publish
 * credential form this page's pattern is copied from.
 */
export type AdminSourceControlConnectionInput =
  | { providerId: "github"; token: string }
  | { providerId: "gitlab"; token: string }
  | { providerId: "bitbucket"; token: string; username: string };

export interface AdminSourceControlCredentialsSnapshot {
  // Mutable array, matching `AdminPublishCredentialsSnapshot.credentials`'s exact shape in
  // `lib/api.ts` — `useSourceControlCredentials` seeds local `useState` from this field directly,
  // and a `readonly` array there is not assignable to that mutable state without a cast.
  credentials: AdminSourceControlCredentialSummary[];
}
