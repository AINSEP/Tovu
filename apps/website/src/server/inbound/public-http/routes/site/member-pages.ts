import type { Express } from "express";
import { nowIso } from "@jini-ai/core/primitives";

import { resolveMemberSession } from "#src/features/members/access-resolver";
import type { PublicPostRecord as PostRecord } from "#src/features/post/post";
import { readRequestCookie } from "#src/server/http/request-cookie";
import type { RouteDeps } from "#src/server/routes/types";
import { MEMBER_SESSION_COOKIE } from "../../http/members.js";
import { serveVirtualPage } from "./pages/handlers/virtual-page.js";

const CODE_REQUEST_VIEW = "code-request";

/**
 * @file Core's member sign-in pages: `/signin` (password, emailed code, emailed link), `/forgot-
 * password`, `/reset-password` (link from the reset email) and `/account` (set or change a
 * password, connect or unlink a login provider, sign out). Owner 2026-10-24: the public "Sign in"
 * is for members with passwords; no minimum length, ever.
 *
 * Login providers (Google login U1): core names no provider. The script lists the enabled,
 * configured ones from `GET …/login-providers` into the empty `data-member-providers` and
 * `data-member-identity-list` slots, so with none enabled nothing extra shows.
 *
 * Each page is a Page built in memory and rendered by `serveVirtualPage`, so it wears the active
 * theme exactly like an authored Page. Registered before `GET /:slug`, so these paths win over a
 * theme's own placeholder `signin.html` mock (tovu-theme). The markup is inert: every view
 * starts `hidden` and `http/site/member-auth-script.ts` (injected by `finalizePublicPageHtml` on
 * any page with `data-member-page`) shows one, wires the forms and talks to the member API. Field
 * classes are the themes' own auth hooks (`.field`, `.btn`), with that script's `:where()` fallback.
 */

/** One labelled input. `tip` adds an ⓘ button beside the label that opens `tip.text` on tap. */
function field(input: { id: string; label: string; name: string; type: string; autocomplete: string; extra?: string;
  tip?: string }): string {
  const tipId = `${input.id}-tip`;
  const label = `<label for="${input.id}">${input.label}</label>`;
  const head = input.tip ? `<span class="member-label-row">${label}${tipButton({ id: tipId })}</span>${tipText({ id: tipId, text: input.tip })}` : label;
  const control = `<input id="${input.id}" name="${input.name}" type="${input.type}" ` +
    `autocomplete="${input.autocomplete}"${input.type === "password" ? ' spellcheck="false"' : ""}${input.extra ?? ""}>`;
  const body = input.type === "password" ? `<span class="member-password">${control}${passwordToggle(input)}</span>` : control;
  return `<div class="field member-field">${head}${body}</div>`;
}

/** Public-page counterpart of SecretInput: the changing name carries state, outside the label.
 * The member script toggles the native input; no secret is serialized into this markup.
 * @complexity O(n) in the rendered id and label lengths. */
function passwordToggle({ id, label }: { id: string; label: string }, _optional = {}): string {
  return `<button type="button" class="member-password-toggle" aria-controls="${id}" aria-label="Show ${label}" ` +
    `data-member-password-toggle data-show-label="Show ${label}" data-hide-label="Hide ${label}">` +
    '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>' +
    '<path class="member-password-slash" d="M2 2l20 20" hidden/></svg></button>';
}

function tipButton({ id }: { id: string }, _optional = {}): string {
  return `<button type="button" class="member-tip" aria-label="More about this" aria-expanded="false" aria-controls="${id}">i</button>`;
}

function tipText({ id, text }: { id: string; text: string }, _optional = {}): string {
  return `<span class="member-tip-text" id="${id}" hidden>${text}</span>`;
}

const messages = '<p class="member-note" data-member-error role="alert" hidden></p><p class="member-note" data-member-ok role="status" hidden></p>';

function form({ name, inner, submit }: { name: string; inner: string; submit: string }, { after = "" }: { after?: string } = {}): string {
  return `<form data-member-form="${name}">${inner}${messages}<div class="member-actions">` +
    `<button type="submit" class="btn btn-solid member-submit">${submit}</button>${after}</div></form>`;
}

function view({ name, inner }: { name: string; inner: string }, _optional = {}): string {
  return `<section data-member-view="${name}" hidden>${inner}</section>`;
}

function links({ items }: { items: string[] }, _optional = {}): string {
  return `<p class="member-auth-links">${items.join("")}</p>`;
}

function showButton({ target, label }: { target: string; label: string }, _optional = {}): string {
  return `<button type="button" class="member-link" data-member-show="${target}">${label}</button>`;
}

/** A status line a view opens on; `tabindex` lets the script move focus to it so it is read out. */
function note({ html }: { html: string }, _optional = {}): string {
  return `<p class="member-note" tabindex="-1" data-member-focus>${html}</p>`;
}

/** Provider buttons (filled by the script) above the email forms, with an "or" rule under them. */
const PROVIDERS = '<div class="member-providers" data-member-providers hidden><div class="member-provider-list" data-member-provider-list></div>' +
  '<p class="member-or"><span>or use your email</span></p></div>';

/** A start/callback refusal lands on /signin#oidcError=<CODE>; the script says it in words here. */
const OIDC_ERROR = '<p class="member-note member-oidc-error" data-member-oidc-error role="alert" tabindex="-1" hidden></p>';

/** Page templates print the body only (an authored Page brings its own heading), so the h1 is here. */
function page({ kind, title, views }: { kind: string; title: string; views: string[] }, { top = "" }: { top?: string } = {}): { title: string; body: string } {
  return { title, body: `<div class="member-auth" data-member-page="${kind}"><h1>${title}</h1><noscript><p>Turn on JavaScript to use this page.</p></noscript>` +
    `${top}${views.join("")}</div>` };
}

const EMAIL = ({ id }: { id: string }, _optional = {}) => field({ id, label: "Email", name: "email", type: "email", autocomplete: "email", extra: " required" });
const signOutButton = '<button type="button" class="btn btn-ghost" data-member-sign-out>Sign out</button>';

const SIGN_IN = page({ kind: "signin", title: "Sign in", views: [
  view({ name: "password", inner: form({ name: "password", inner: EMAIL({ id: "member-signin-email" }) +
      field({ id: "member-signin-password", label: "Password", name: "password", type: "password", autocomplete: "current-password", extra: " required" }), submit: "Sign in" }) +
    links({ items: ['<a href="/forgot-password">Forgot password?</a>', showButton({ target: CODE_REQUEST_VIEW, label: "Email me a code instead" })] }) }),
  view({ name: CODE_REQUEST_VIEW, inner: form({ name: CODE_REQUEST_VIEW, inner: EMAIL({ id: "member-code-email" }), submit: "Email me a code" }, { after: tipButton({ id: "member-code-tip" }) + tipText({ id: "member-code-tip", text: "We email you a 6-digit code. New here? Signing in with a code creates your account." }) }) +
    links({ items: [showButton({ target: "password", label: "Use my password instead" })] }) }),
  view({ name: "code", inner: note({ html: 'We sent a code to <strong data-member-email></strong>.' }) +
    form({ name: "code", inner: field({ id: "member-code", label: "Code", name: "code", type: "text", autocomplete: "one-time-code",
      extra: ' inputmode="numeric" maxlength="7" required' }), submit: "Sign in" }) +
    links({ items: [showButton({ target: CODE_REQUEST_VIEW, label: "Send a new code" })] }) }),
  view({ name: "magic", inner: form({ name: "magic", inner: note({ html: "Finish signing in from your email link." }), submit: "Continue" }) +
    links({ items: [showButton({ target: CODE_REQUEST_VIEW, label: "Send a new code" })] }) }),
  view({ name: "signed-in", inner: note({ html: 'You\'re signed in as <strong data-member-email></strong>.' }) +
    links({ items: ['<a href="/account">Your account</a>', '<button type="button" class="member-link" data-member-sign-out>Sign out</button>'] }) }),
  // A provider account whose address isn't the provider's own (not Gmail/Workspace): one emailed
  // code proves the inbox the first time. The sealed continuation arrives in the fragment.
  view({ name: "oidc-code", inner: note({ html: "We emailed you a 6-digit code to confirm the address is yours. You only need to do this once." }) +
    form({ name: "oidc-code", inner: field({ id: "member-oidc-code", label: "Code", name: "code", type: "text", autocomplete: "one-time-code",
      extra: ' inputmode="numeric" maxlength="7" required' }), submit: "Finish signing in" }) +
    links({ items: [showButton({ target: "password", label: "Start over" })] }) }),
] }, { top: OIDC_ERROR + PROVIDERS });

const FORGOT = page({ kind: "forgot", title: "Reset your password", views: [
  view({ name: "forgot", inner: form({ name: "forgot", inner: EMAIL({ id: "member-forgot-email" }), submit: "Email me a reset link" }) + links({ items: ['<a href="/signin">Back to sign in</a>'] }) }),
  view({ name: "sent", inner: note({ html: "Check your email. If an account uses that address, a reset link is on its way. It works for 15 minutes." }) +
    links({ items: ['<a href="/signin">Back to sign in</a>'] }) }),
] });

const RESET = page({ kind: "reset", title: "Choose a new password", views: [
  view({ name: "reset", inner: form({ name: "reset", inner: field({ id: "member-reset-password", label: "New password", name: "password", type: "password",
    autocomplete: "new-password", extra: " required" }), submit: "Save new password" }) + links({ items: ['<a href="/forgot-password">Ask for a new link</a>'] }) }),
  view({ name: "missing", inner: note({ html: "This reset link is incomplete. Ask for a new one." }) + links({ items: ['<a href="/forgot-password">Ask for a new link</a>'] }) }),
  view({ name: "done", inner: note({ html: "Password changed. Sign in with your new password." }) + links({ items: ['<a href="/signin">Sign in</a>'] }) }),
] });

const REAUTH = '<p class="member-note" data-member-reauth hidden><a href="/signin#view=code&amp;redirect=%2Faccount">Sign in with a code</a></p>';

/** Connected login providers: "<Label> connected · Unlink" or "Connect <Label>" rows, script-filled. */
const IDENTITIES = '<div class="member-identities" data-member-identities hidden><div class="member-label-row member-heading-row">' +
  `<h2>Connected accounts</h2>${tipButton({ id: "member-identities-tip" })}</div>` +
  tipText({ id: "member-identities-tip", text: "Connecting or unlinking an account signs you out on your other devices." }) +
  `<ul class="member-identity-list" data-member-identity-list></ul>${messages}${REAUTH}</div>`;

const ACCOUNT = page({ kind: "account", title: "Your account", views: [
  view({ name: "signed-out", inner: note({ html: "You're signed out." }) + links({ items: ['<a href="/signin">Sign in</a>'] }) }),
  view({ name: "account", inner: note({ html: 'Signed in as <strong data-member-email></strong>.' }) + "<h2>Password</h2>" +
    form({ name: "set", inner: field({ id: "member-current-password", label: "Current password", name: "currentPassword", type: "password",
        autocomplete: "current-password", tip: "Leave this empty if you've only signed in with emailed codes." }) +
        field({ id: "member-new-password", label: "New password", name: "password", type: "password", autocomplete: "new-password", extra: " required" }), submit: "Save password" }) +
    REAUTH + IDENTITIES + `<div class="member-actions member-signout">${signOutButton}</div>` }),
] });

/** Path → the page's title (the theme prints it as the heading) and body. */
export const MEMBER_PAGES: Readonly<Record<string, { id: string; title: string; body: string }>> = {
  "/signin": { id: "6d656d62-6572-4000-8000-000000000001", ...SIGN_IN },
  "/forgot-password": { id: "6d656d62-6572-4000-8000-000000000002", ...FORGOT },
  "/reset-password": { id: "6d656d62-6572-4000-8000-000000000003", ...RESET },
  "/account": { id: "6d656d62-6572-4000-8000-000000000004", ...ACCOUNT },
};

/** The in-memory Page {@link serveVirtualPage} renders for one member path. @complexity O(1). */
export function memberPagePost(required: { path: string; workspaceId: string }, _optional: Record<string, never> = {}): PostRecord | undefined {
  const entry = MEMBER_PAGES[required.path];
  if (!entry) return undefined;
  return {
    id: entry.id, workspaceId: required.workspaceId, title: entry.title, slug: required.path.slice(1),
    bodyJson: {}, status: "published", kind: "page", bodyFormat: "html", bodyHtml: entry.body,
    updatedAt: new Date(0).toISOString(), version: 1, templateChoice: null,
  };
}

/** Register member pages before `registerSiteRoutes`; /account requires a live member session.
 * Session lookup failures reach the existing 500 handler. @complexity O(1) indexed session lookup
 * plus the existing virtual-page rendering cost.
 */
export function registerMemberPageRoutes(app: Pick<Express, "get">, deps: RouteDeps): void {
  app.get(Object.keys(MEMBER_PAGES), async (req, res) => {
    try {
      const post = memberPagePost({ path: req.path.replace(/\/$/, ""), workspaceId: deps.workspaceId });
      if (!post) { res.status(404).end(); return; }
      if (post.slug === "account") {
        // The response depends on a cookie: never share either the page or redirect through a cache.
        res.set("Cache-Control", "private, no-store");
        const session = await resolveMemberSession({ sessions: deps.memberSessionRepo, workspaceId: deps.workspaceId,
          sessionToken: readRequestCookie({ request: req, name: MEMBER_SESSION_COOKIE }), nowIso: nowIso({ clock: deps.clock }) });
        if (!session) {
          // Use sign-in's validated fragment contract; a fixed local path cannot inherit an attacker return URL.
          res.redirect(303, "/signin#redirect=%2Faccount");
          return;
        }
      }
      await serveVirtualPage({ req, res, deps, post });
    } catch (error) {
      // Express 4 does not catch a rejected async handler; answer instead of hanging the visitor.
      console.error("[member-pages] render failed:", error);
      res.status(500).type("html").send("<h1>Site error</h1>");
    }
  });
}
