import { createMemberPages, serveMemberPage } from "@jini-ai/cms/public-http/routes/site/member-pages";
import type { Express } from "express";
import { nowIso } from "@jini-ai/core/primitives";

import { resolveMemberSession } from "@jini-ai/user-management/members/access-resolver";
import { readRequestCookie } from "#src/server/http/request-cookie";
import type { RouteDeps } from "#src/server/routes/types";
import { MEMBER_SESSION_COOKIE } from "../../http/members.js";
import { serveVirtualPage } from "./pages/handlers/virtual-page.js";

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

export const MEMBER_PAGES = createMemberPages({
  paths: { signIn: "/signin", forgot: "/forgot-password", reset: "/reset-password", account: "/account", reauthenticate: "/signin#view=code&amp;redirect=%2Faccount" },
  ids: { signIn: "6d656d62-6572-4000-8000-000000000001", forgot: "6d656d62-6572-4000-8000-000000000002", reset: "6d656d62-6572-4000-8000-000000000003", account: "6d656d62-6572-4000-8000-000000000004" },
  copy: {
    signInTitle: "Sign in", forgotTitle: "Reset your password", resetTitle: "Choose a new password", accountTitle: "Your account",
    resetSent: "Check your email. If an account uses that address, a reset link is on its way. It works for 15 minutes.",
    accountSignedInPrefix: 'Signed in as ', askNewLink: "Ask for a new link", backToSignIn: "Back to sign in",
    codeInstead: "Email me a code instead", codeLabel: "Code", codeSentPrefix: 'We sent a code to ',
    codeTip: "We email you a 6-digit code. New here? Signing in with a code creates your account.",
    connectedAccounts: "Connected accounts", continue: "Continue", currentPasswordLabel: "Current password",
    currentPasswordTip: "Leave this empty if you've only signed in with emailed codes.", emailCode: "Email me a code", emailLabel: "Email",
    emailResetLink: "Email me a reset link", finishEmailLink: "Finish signing in from your email link.", finishSignIn: "Finish signing in",
    forgotPassword: "Forgot password?", identitiesTip: "Connecting or unlinking an account signs you out on your other devices.",
    moreAbout: "More about this", newCode: "Send a new code", newPasswordLabel: "New password", noScript: "Turn on JavaScript to use this page.",
    oidcCodeSent: "We emailed you a 6-digit code to confirm the address is yours. You only need to do this once.", orEmail: "or use your email",
    passwordChanged: "Password changed. Sign in with your new password.", passwordInstead: "Use my password instead", passwordLabel: "Password",
    resetIncomplete: "This reset link is incomplete. Ask for a new one.", saveNewPassword: "Save new password", savePassword: "Save password",
    signIn: "Sign in", signInWithCode: "Sign in with a code", signOut: "Sign out", signedInPrefix: "You're signed in as ",
    signedOut: "You're signed out.", startOver: "Start over", yourAccount: "Your account",
    showPassword: label => `Show ${label}`, hidePassword: label => `Hide ${label}`,
  },
});

/** Register member pages before `registerSiteRoutes`; /account requires a live member session.
 * Session lookup failures reach the existing 500 handler. @complexity O(1) indexed session lookup
 * plus the existing virtual-page rendering cost.
 */
export const registerMemberPageRoutes = ({ app, deps }: { app: Pick<Express, "get">; deps: RouteDeps }, _optional = {}): void =>
  void app.get(Object.keys(MEMBER_PAGES), (req, res) => serveMemberPage({
    path: req.path,
    deps: {
      workspaceId: deps.workspaceId, pages: MEMBER_PAGES, accountPath: "/account", signInLocation: "/signin#redirect=%2Faccount",
      markPrivate: () => void res.set("Cache-Control", "private, no-store"),
      hasLiveSession: async () => Boolean(await resolveMemberSession({ sessions: deps.memberSessionRepo, workspaceId: deps.workspaceId,
        sessionToken: readRequestCookie({ request: req, name: MEMBER_SESSION_COOKIE }), nowIso: nowIso({ clock: deps.clock }) })),
    },
    missing: () => void res.status(404).end(), redirect: reply => void res.redirect(reply.status, reply.location),
    send: post => serveVirtualPage({ req, res, deps, post }),
    // Express 4 does not catch a rejected async handler; answer instead of hanging the visitor.
    reportFault: error => console.error("[member-pages] render failed:", error),
    sendFault: () => void res.status(500).type("html").send("<h1>Site error</h1>"),
  }));
