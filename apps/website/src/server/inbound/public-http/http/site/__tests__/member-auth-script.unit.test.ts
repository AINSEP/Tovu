import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";

import { injectMemberAuthScript, MEMBER_AUTH_SCRIPT, MEMBER_AUTH_STYLE } from "../member-auth-script.js";
import { MEMBER_PAGES } from "../../../routes/site/member-pages.js";

/**
 * @file `member-auth-script.ts`: where `injectMemberAuthScript` puts the member style + script, and
 * what the browser half does, run in jsdom against core's real member page markup
 * (`MEMBER_PAGES`) with a fake `fetch`. Contract: `SHARD-E-CONTRACT.md` (2026-10-24).
 */

const BASE = "/api/members/v1/workspaces/ws-1";

test("injects the style + script once, right before </body>", () => {
  const html = '<html><body><a href="/signin" data-member-nav>Sign in</a></body></html>';
  const out = injectMemberAuthScript({ html, workspaceId: "ws-1" });
  assert.equal(out.match(/data-tovu-member-auth/g)?.length, 2, "one <style> and one <script>");
  assert.ok(out.endsWith("</script></body></html>"), "the markup lands before the closing body tag");
  assert.ok(out.includes(`(${JSON.stringify(BASE)});</script>`), "the script is called with this workspace's API base");
  assert.equal(injectMemberAuthScript({ html: out, workspaceId: "ws-1" }), out, "a second pass must not inject again");
});

test("leaves pages without a member hook untouched", () => {
  const html = '<html><body><a href="/signin">Sign in</a><p>data-member-nav in text only</p></body></html>';
  assert.equal(injectMemberAuthScript({ html, workspaceId: "ws-1" }), html);
});

test("appends when the document has no </body>, for a member page body", () => {
  const html = '<div data-member-page="signin"></div>';
  const out = injectMemberAuthScript({ html, workspaceId: "ws-1" });
  assert.ok(out.startsWith(html) && out.endsWith("</script>"));
});

test("a hostile workspace id cannot close the script tag", () => {
  const out = injectMemberAuthScript({ html: "<body data-member-page=x></body>", workspaceId: "</script><script>alert(1)" });
  assert.equal(out.match(/<\/script>/g)?.length, 1, "only the script's own closing tag");
  assert.ok(out.includes("%3C%2Fscript%3E"), "the id is URL-encoded into the base");
});

test("the script and style carry nothing that breaks the inline <script>/String.raw embedding", () => {
  for (const source of [MEMBER_AUTH_SCRIPT, MEMBER_AUTH_STYLE]) {
    assert.doesNotMatch(source, /<\/script|<\/style|`|\$\{/i);
  }
});

// --- browser half ---------------------------------------------------------------------------

type Reply = { status: number; body?: unknown; retryAfter?: string };
type Call = { method: string; path: string; body: Record<string, unknown> | undefined; at: string };

/** Boot one member page (or `bodyHtml`) at `url` with a fake fetch answering from `replies`
 *  (keyed "METHOD /path", read at call time so a test can change a reply; `GET /me` defaults to
 *  signed out). */
function boot(input: { url: string; path?: string; bodyHtml?: string; replies?: Record<string, Reply> }) {
  const body = input.bodyHtml ?? MEMBER_PAGES[input.path ?? new URL(input.url).pathname]!.body;
  // jsdom cannot navigate (sign-out reloads, sign-in assigns); keep every other jsdom error loud.
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => { if (!/Not implemented: navigation/.test(error.message)) console.error(error); });
  const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`, { url: input.url, runScripts: "outside-only", virtualConsole });
  const { window } = dom;
  const calls: Call[] = [];
  const replies = input.replies ?? {};
  const signedOut: Reply = { status: 200, body: { member: null } };
  Object.assign(window, {
    fetch: async (url: string, init: { method: string; body?: string }) => {
      const path = url.slice(BASE.length);
      calls.push({ method: init.method, path, body: init.body ? JSON.parse(init.body) : undefined, at: window.location.href });
      const key = `${init.method} ${path}`;
      const reply = replies[key] ?? (key === "GET /me" ? signedOut : { status: 500 });
      return {
        status: reply.status,
        headers: { get: (name: string) => (name === "Retry-After" ? reply.retryAfter ?? null : null) },
        text: async () => (reply.body === undefined ? "" : JSON.stringify(reply.body)),
      };
    },
  });
  window.eval(`${MEMBER_AUTH_SCRIPT}(${JSON.stringify(BASE)});`);
  const doc = window.document;
  const visible = () => [...doc.querySelectorAll<HTMLElement>("[data-member-view]")].filter((v) => !v.hidden).map((v) => v.dataset.memberView);
  const submit = (name: string) => doc.querySelector<HTMLFormElement>(`form[data-member-form="${name}"]`)!.requestSubmit();
  const fill = (id: string, value: string) => { doc.querySelector<HTMLInputElement>(`#${id}`)!.value = value; };
  const error = (name: string) => doc.querySelector(`form[data-member-form="${name}"] [data-member-error]`)!.textContent;
  return { window, doc, calls, visible, submit, fill, error };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

test("a reset link: the token leaves the address bar before any request, and posts only on submit", async () => {
  const page = boot({ url: "https://site.example/reset-password#token=tok-1", replies: { "POST /reset-password": { status: 200, body: { ok: true } } } });
  await settle();
  assert.equal(page.window.location.href, "https://site.example/reset-password", "fragment stripped on load");
  assert.deepEqual([...page.calls], [], "nothing is posted on load");
  assert.deepEqual(page.visible(), ["reset"]);
  page.fill("member-reset-password", "a");
  page.submit("reset");
  await settle();
  assert.deepEqual(page.calls.map((c) => [c.method, c.path, c.body]), [["POST", "/reset-password", { token: "tok-1", password: "a" }]],
    "no minimum length: a one-character password goes to the server as typed");
  assert.deepEqual(page.visible(), ["done"]);
});

test("a reset page without a token says the link is incomplete", async () => {
  const page = boot({ url: "https://site.example/reset-password" });
  await settle();
  assert.deepEqual(page.visible(), ["missing"]);
});

test("a used reset link shows the uniform 401 text", async () => {
  const page = boot({ url: "https://site.example/reset-password#token=old", replies: { "POST /reset-password": { status: 401, body: { code: "INVALID_CREDENTIALS" } } } });
  page.fill("member-reset-password", "new");
  page.submit("reset");
  await settle();
  assert.match(page.error("reset")!, /expired or was already used/);
});

test("a sign-in link waits for Continue, then posts only the token", async () => {
  const page = boot({ url: "https://site.example/signin#magic=m-1&redirect=%2Faccount", replies: { "POST /sign-in/complete": { status: 401, body: {} } } });
  await settle();
  assert.equal(page.window.location.hash, "");
  assert.deepEqual(page.visible(), ["magic"]);
  assert.deepEqual([...page.calls], [], "never auto-POST a link token");
  page.submit("magic");
  await settle();
  assert.deepEqual(page.calls.map((c) => c.body), [{ token: "m-1" }]);
  assert.match(page.error("magic")!, /expired or was already used/);
});

for (const [redirect, expected] of [["%2Faccount", "/account"], ["%2F%2Fevil.example", undefined], ["https%3A%2F%2Fevil.example", undefined],
  ["%2Fa%252fb", undefined], ["%2Fa%5Cb", undefined], ["%2F%5Cevil.example", undefined],
  ["%2F%0A%2Fevil.example", undefined], ["javascript%3Aalert(1)", undefined]] as const) {
  test(`a code request forwards redirect=${redirect} only when it is a same-origin path`, async () => {
    const page = boot({ url: `https://site.example/signin#view=code&redirect=${redirect}`,
      replies: { "POST /sign-in": { status: 200, body: { accepted: true, challengeId: "ch-1" } } } });
    await settle();
    assert.deepEqual(page.visible(), ["code-request"]);
    page.fill("member-code-email", " m@example.com ");
    page.submit("code-request");
    await settle();
    const request = page.calls.find((c) => c.path === "/sign-in")!;
    assert.deepEqual(request.body, expected ? { email: "m@example.com", redirectPath: expected } : { email: "m@example.com" });
    assert.deepEqual(page.visible(), ["code"]);
    assert.equal(page.doc.querySelector("[data-member-view=code] [data-member-email]")!.textContent, "m@example.com");
  });
}

test("code entry: rejects a non-6-digit code locally, then sends the challenge id with the code", async () => {
  const page = boot({ url: "https://site.example/signin#view=code", replies: {
    "POST /sign-in": { status: 200, body: { accepted: true, challengeId: "ch-9" } },
    "POST /sign-in/complete": { status: 401, body: { code: "INVALID_CREDENTIALS" } },
  } });
  await settle();
  page.fill("member-code-email", "m@example.com");
  page.submit("code-request");
  await settle();
  page.fill("member-code", "12 34");
  page.submit("code");
  await settle();
  assert.equal(page.error("code"), "Enter the 6-digit code from the email.");
  assert.equal(page.calls.filter((c) => c.path === "/sign-in/complete").length, 0);
  page.fill("member-code", "123 456");
  page.submit("code");
  await settle();
  assert.deepEqual(page.calls.find((c) => c.path === "/sign-in/complete")!.body, { challengeId: "ch-9", code: "123456" });
  assert.match(page.error("code")!, /wrong or has expired/);
});

test("password sign-in: 401 and 429 messages, and the button is disabled while in flight", async () => {
  const replies: Record<string, Reply> = { "POST /password/sign-in": { status: 401, body: { code: "INVALID_CREDENTIALS" } } };
  const page = boot({ url: "https://site.example/signin", replies });
  await settle();
  assert.deepEqual(page.visible(), ["password"]);
  page.fill("member-signin-email", "m@example.com");
  page.fill("member-signin-password", "pw");
  page.submit("password");
  const form = page.doc.querySelector("form[data-member-form=password]")!;
  assert.equal(form.querySelector("button")!.disabled, true);
  assert.equal(form.getAttribute("aria-busy"), "true");
  await settle();
  assert.equal(form.querySelector("button")!.disabled, false);
  assert.equal(page.error("password"), "Wrong email or password.");
  replies["POST /password/sign-in"] = { status: 429, body: { code: "RATE_LIMIT_EXCEEDED" }, retryAfter: "120" };
  page.submit("password");
  await settle();
  assert.equal(page.error("password"), "Too many tries. Try again in 2 minutes.");
});

test("a signed-in visitor sees the signed-in view on /signin", async () => {
  const page = boot({ url: "https://site.example/signin", replies: { "GET /me": { status: 200, body: { member: { id: "1", email: "m@example.com", status: "active" } } } } });
  await settle();
  assert.deepEqual(page.visible(), ["signed-in"]);
  assert.equal(page.doc.querySelector("[data-member-view=signed-in] [data-member-email]")!.textContent, "m@example.com");
});

test("/account: a code-only member who signed in too long ago is sent to a fresh code sign-in", async () => {
  const page = boot({ url: "https://site.example/account", replies: {
    "GET /me": { status: 200, body: { member: { id: "1", email: "m@example.com", status: "active" } } },
    "POST /password/set": { status: 401, body: { error: "sign in again to set a password", code: "REAUTHENTICATION_REQUIRED" } },
  } });
  await settle();
  assert.deepEqual(page.visible(), ["account"]);
  page.fill("member-new-password", "pw");
  page.submit("set");
  await settle();
  assert.deepEqual(page.calls.find((c) => c.path === "/password/set")!.body, { password: "pw" }, "an empty current password is not sent");
  assert.match(page.error("set")!, /sign in again with an emailed code/);
  assert.equal(page.doc.querySelector<HTMLElement>("[data-member-reauth]")!.hidden, false);
});

test("/account signed out shows the signed-out view", async () => {
  const page = boot({ url: "https://site.example/account" });
  await settle();
  assert.deepEqual(page.visible(), ["signed-out"]);
});

test("the ⓘ tip opens on tap and closes on Escape", async () => {
  const page = boot({ url: "https://site.example/account" });
  const tip = page.doc.querySelector<HTMLButtonElement>(".member-tip")!;
  const text = page.doc.getElementById(tip.getAttribute("aria-controls")!)!;
  tip.click();
  assert.equal(text.hidden, false);
  assert.equal(tip.getAttribute("aria-expanded"), "true");
  tip.dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "Escape" }));
  assert.equal(text.hidden, true);
});

test("header link, signed in: becomes the email (to /account) plus a Sign out button in the link's classes", async () => {
  const page = boot({ url: "https://site.example/blog", bodyHtml: '<nav><a href="/signin" class="btn btn-ghost" data-member-nav>Sign in</a></nav>',
    replies: { "GET /me": { status: 200, body: { member: { id: "1", email: "m@example.com", status: "active" } } }, "POST /sign-out": { status: 204 } } });
  await settle();
  const account = page.doc.querySelector<HTMLAnchorElement>("[data-member-account]")!;
  assert.equal(account.getAttribute("href"), "/account");
  assert.equal(account.querySelector(".member-account-email")!.textContent, "m@example.com");
  assert.equal(account.querySelector(".member-account-short")!.textContent, "Account");
  const out = page.doc.querySelector<HTMLButtonElement>("button[data-member-nav-sign-out]")!;
  assert.equal(out.className, "btn btn-ghost");
  assert.equal(page.doc.querySelector("[data-member-nav]"), null, "the Sign in link is replaced");
  out.click();
  await settle();
  assert.equal(page.calls.at(-1)!.path, "/sign-out");
});

test("header link, signed out: points at /signin with this page as the redirect", async () => {
  const page = boot({ url: "https://site.example/blog?tag=a", bodyHtml: '<a href="/signin" data-member-nav>Sign in</a>' });
  await settle();
  assert.equal(page.doc.querySelector("[data-member-nav]")!.getAttribute("href"), "/signin#redirect=%2Fblog%3Ftag%3Da");
});

test("a network failure says so instead of failing silently", async () => {
  const page = boot({ url: "https://site.example/forgot-password" });
  Object.assign(page.window, { fetch: () => Promise.reject(new Error("offline")) });
  page.fill("member-forgot-email", "m@example.com");
  page.submit("forgot");
  await settle();
  assert.match(page.error("forgot")!, /Couldn't reach the site/);
});

// --- login providers (Google login U1) ------------------------------------------------------

const GOOGLE = { id: "google", label: "Google" };
const SIGNED_IN: Reply = { status: 200, body: { member: { id: "1", email: "m@example.com", status: "active" }, identities: [] } };
const providerLinks = (page: ReturnType<typeof boot>) =>
  [...page.doc.querySelectorAll<HTMLAnchorElement>("[data-member-provider-list] a")].map((a) => [a.textContent, a.getAttribute("href")]);
const providersShown = (page: ReturnType<typeof boot>) => !page.doc.querySelector<HTMLElement>("[data-member-providers]")!.hidden;

test("/signin with no enabled provider shows no provider button", async () => {
  const page = boot({ url: "https://site.example/signin", replies: { "GET /login-providers": { status: 200, body: { providers: [] } } } });
  await settle();
  assert.deepEqual(page.visible(), ["password"]);
  assert.deepEqual(providerLinks(page), []);
  assert.equal(providersShown(page), false);
});

test("/signin lists each enabled provider as a plain start link above the email forms only", async () => {
  const page = boot({ url: "https://site.example/signin", replies: { "GET /login-providers": { status: 200, body: { providers: [
    GOOGLE, { id: "../evil", label: "Evil" }, { id: "nolabel" }] } } } });
  await settle();
  assert.deepEqual(providerLinks(page), [["Continue with Google", `${BASE}/oidc/google/start`]], "a malformed id or label is ignored");
  assert.equal(providersShown(page), true);
  page.doc.querySelector<HTMLButtonElement>('[data-member-show="code-request"]')!.click();
  assert.equal(providersShown(page), true, "the emailed-code form keeps them");
  assert.equal(page.calls.filter((c) => c.path === "/login-providers").length, 1, "listed once");
});

test("/signin signed in: no provider buttons", async () => {
  const page = boot({ url: "https://site.example/signin", replies: { "GET /me": SIGNED_IN, "GET /login-providers": { status: 200, body: { providers: [GOOGLE] } } } });
  await settle();
  assert.deepEqual(page.visible(), ["signed-in"]);
  assert.equal(providersShown(page), false);
});

for (const [code, text] of [["LOGIN_CANCELLED", /cancelled/], ["LOGIN_UNAVAILABLE", /isn't available/], ["LOGIN_BLOCKED", /can't sign in that way/],
  ["LOGIN_CONFLICT", /already connected/], ["LOGIN_INVALID", /didn't finish/], ["<img src=x>", /didn't finish/]] as const) {
  test(`/signin#oidcError=${code} says what happened in plain words`, async () => {
    const page = boot({ url: `https://site.example/signin#oidcError=${encodeURIComponent(code)}` });
    await settle();
    assert.equal(page.window.location.hash, "", "fragment stripped");
    const note = page.doc.querySelector<HTMLElement>("[data-member-oidc-error]")!;
    assert.equal(note.hidden, false);
    assert.match(note.textContent!, text);
    assert.equal(note.querySelector("img"), null, "an unknown code is never rendered");
    assert.deepEqual(page.visible(), ["password"], "the sign-in choices stay usable");
  });
}

test("the emailed-code step: the sealed continuation leaves the address bar first and posts only with the code", async () => {
  const replies: Record<string, Reply> = { "POST /oidc/google/verify-email": { status: 401, body: { code: "LOGIN_INVALID" } } };
  const page = boot({ url: "https://site.example/signin#oidc=google&challengeId=ch-1&continuation=sealed.v1", replies });
  assert.equal(page.window.location.href, "https://site.example/signin", "stripped before anything else");
  await settle();
  assert.deepEqual(page.visible(), ["oidc-code"]);
  assert.equal(providersShown(page), false);
  assert.deepEqual(page.calls.filter((c) => c.method === "POST"), [], "nothing is posted on load");
  page.fill("member-oidc-code", "12");
  page.submit("oidc-code");
  await settle();
  assert.equal(page.error("oidc-code"), "Enter the 6-digit code from the email.");
  page.fill("member-oidc-code", "123 456");
  page.submit("oidc-code");
  await settle();
  assert.deepEqual(page.calls.find((c) => c.path === "/oidc/google/verify-email")!.body,
    { continuation: "sealed.v1", challengeId: "ch-1", code: "123456" });
  assert.match(page.error("oidc-code")!, /wrong or has expired/);
});

test("the emailed-code step ignores a fragment whose provider id is not a path-safe id", async () => {
  const page = boot({ url: "https://site.example/signin#oidc=..%2Fx&challengeId=ch-1&continuation=c" });
  await settle();
  assert.deepEqual(page.visible(), ["password"]);
});

/** /account signed in, with `identities` from /me and `available` from /login-providers. */
function account(identities: unknown[], available: unknown[], extra: Record<string, Reply> = {}) {
  return boot({ url: "https://site.example/account", replies: {
    "GET /me": { status: 200, body: { member: { id: "1", email: "m@example.com", status: "active" }, identities } },
    "GET /login-providers": { status: 200, body: { providers: available } }, ...extra } });
}
const rows = (page: ReturnType<typeof boot>) =>
  [...page.doc.querySelectorAll("[data-member-identity-list] li")].map((li) => li.textContent);
const accountsShown = (page: ReturnType<typeof boot>) => !page.doc.querySelector<HTMLElement>("[data-member-identities]")!.hidden;

test("/account: no provider enabled and none connected hides Connected accounts", async () => {
  const page = account([], []);
  await settle();
  assert.deepEqual(page.visible(), ["account"]);
  assert.equal(accountsShown(page), false);
});

test("/account: an enabled provider reads Connect <Label>, a plain start link", async () => {
  const page = account([], [GOOGLE]);
  await settle();
  assert.equal(accountsShown(page), true);
  assert.deepEqual(rows(page), ["Connect Google"]);
  assert.equal(page.doc.querySelector("[data-member-identity-list] a")!.getAttribute("href"), `${BASE}/oidc/google/start`);
});

test("/account: a connected provider reads <Label> connected + Unlink, even after the plugin is disabled", async () => {
  const page = account([{ providerId: "google", label: "Google" }], []);
  await settle();
  assert.deepEqual(rows(page), ["Google connectedUnlink"]);
});

test("/account: Unlink posts an empty body, then offers Connect again and says other devices are signed out", async () => {
  const page = account([{ providerId: "google", label: "Google" }], [GOOGLE], { "POST /identities/google/unlink": { status: 200, body: { ok: true } } });
  await settle();
  page.doc.querySelector<HTMLButtonElement>("[data-member-identity-list] button")!.click();
  await settle();
  assert.deepEqual(page.calls.find((c) => c.path === "/identities/google/unlink")!.body, {});
  assert.deepEqual(rows(page), ["Connect Google"]);
  assert.equal(page.doc.querySelector("[data-member-identities] [data-member-ok]")!.textContent, "Google unlinked. You're signed out on your other devices.");
});

test("/account: an Unlink refused for an old session asks for a fresh code sign-in", async () => {
  const page = account([{ providerId: "google", label: "Google" }], [GOOGLE],
    { "POST /identities/google/unlink": { status: 401, body: { error: "member login failed", code: "LOGIN_BLOCKED" } } });
  await settle();
  page.doc.querySelector<HTMLButtonElement>("[data-member-identity-list] button")!.click();
  await settle();
  assert.match(page.doc.querySelector("[data-member-identities] [data-member-error]")!.textContent!, /sign in again with an emailed code, then unlink/);
  assert.equal(page.doc.querySelector<HTMLElement>("[data-member-identities] [data-member-reauth]")!.hidden, false);
  assert.deepEqual(rows(page), ["Google connectedUnlink"], "still connected");
});
