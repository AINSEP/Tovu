import { afterEach, expect, it, vi } from "vitest";
import { ownerMfaPort } from "../owner-mfa-api";
import { ownerPasskeySettingsPort, ownerPasskeySignInPort } from "../owner-passkey-api";
import { ownerRecoveryFailure, ownerRecoveryPort } from "../owner-recovery-api";

afterEach(() => vi.unstubAllGlobals());

type Call = { url: string; method: string; body: unknown; cache?: RequestCache };
function recordFetch(reply: unknown = {}) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body as string) : undefined, cache: init.cache });
    return new Response(JSON.stringify(reply), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
  return calls;
}
const API = "/api/admin/v1";

it("the MFA port reads status and sends enroll, confirm and remove as single uncached POSTs", async () => {
  const calls = recordFetch();
  await ownerMfaPort.status();
  await ownerMfaPort.enroll({ password: "p" } as never);
  await ownerMfaPort.confirm({ code: "123456" } as never);
  await ownerMfaPort.remove({ password: "p" } as never);
  expect(calls).toEqual([
    { url: `${API}/auth/mfa`, method: "GET", body: undefined, cache: "no-store" },
    { url: `${API}/auth/mfa/enroll`, method: "POST", body: { password: "p" }, cache: "no-store" },
    { url: `${API}/auth/mfa/confirm`, method: "POST", body: { code: "123456" }, cache: "no-store" },
    { url: `${API}/auth/mfa/remove`, method: "POST", body: { password: "p" }, cache: "no-store" },
  ]);
});

it("the passkey settings and sign-in ports address the passkey ceremonies; complete resolves with no value", async () => {
  const calls = recordFetch({ ok: true });
  await ownerPasskeySettingsPort.status();
  await ownerPasskeySettingsPort.enroll({ a: 1 } as never);
  await ownerPasskeySettingsPort.confirm({ b: 2 } as never);
  await ownerPasskeySettingsPort.remove({ c: 3 } as never);
  await ownerPasskeySignInPort.begin({ d: 4 } as never);
  await expect(ownerPasskeySignInPort.complete({ e: 5 } as never)).resolves.toBeUndefined();
  expect(calls.map(c => [c.method, c.url.replace(API, ""), c.body])).toEqual([
    ["GET", "/auth/passkeys", undefined],
    ["POST", "/auth/passkeys/enroll", { a: 1 }],
    ["POST", "/auth/passkeys/confirm", { b: 2 }],
    ["POST", "/auth/passkeys/remove", { c: 3 }],
    ["POST", "/auth/passkeys/begin-login", { d: 4 }],
    ["POST", "/auth/passkeys/login", { e: 5 }],
  ]);
  expect(calls.every(c => c.cache === "no-store")).toBe(true);
});

it("the owner recovery port reads status and posts issue, reset and recover once each", async () => {
  const calls = recordFetch({ codes: ["c1"] });
  await ownerRecoveryPort.status();
  await expect(ownerRecoveryPort.issue({ password: "p", code: "x" })).resolves.toEqual({ codes: ["c1"] });
  await ownerRecoveryPort.reset({ password: "p" });
  await ownerRecoveryPort.recover({ code: "c", password: "p" });
  expect(calls.map(c => [c.method, c.url.replace(API, ""), c.body])).toEqual([
    ["GET", "/auth/owner-recovery", undefined],
    ["POST", "/auth/recovery-codes", { password: "p", code: "x" }],
    ["POST", "/auth/reset-owner", { password: "p" }],
    ["POST", "/auth/recover-owner", { code: "c", password: "p" }],
  ]);
});

it("ownerRecoveryFailure keeps the server's explanation, translates the action and redacts submitted secrets", () => {
  const t = (text: string) => `T(${text})`;
  const error = new Error("Recovery failed for hunter2-secret");
  const failure = ownerRecoveryFailure({ error, message: "Recovery settings could not load.", action: "Reload this page.", step: "owner-recovery-status", t, secrets: ["hunter2-secret", ""] });
  expect(JSON.stringify(failure)).not.toContain("hunter2-secret");
  expect(JSON.stringify(failure)).toContain("T(Reload this page.)");
  expect(JSON.stringify(failure)).toContain("owner-recovery-status");
});

it("ownerRecoveryFailure falls back to the translated message when the error carries no explanation", () => {
  const t = (text: string) => `T(${text})`;
  const failure = ownerRecoveryFailure({ error: undefined, message: "Recovery settings could not load.", action: "Reload this page.", step: "s", t });
  expect(JSON.stringify(failure)).toContain("T(Recovery settings could not load.)");
});
