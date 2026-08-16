import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures";
import { waitForAgentDaemon } from "./daemon-ready";
// The REAL installed package Tovu's own daemon runs (`require.resolve` from this repo's root
// resolves it to `node_modules/@jini-ai/agentic`, not a copy) — used unmodified in LEVEL 3 so the
// schema validation, handle checks and the credential-withholding guard are the actual production
// code, not a re-implementation of them.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { executePageCapability } = require("@jini-ai/agentic") as {
  executePageCapability: (driver: unknown, capabilityId: string, input: Record<string, unknown>) => Promise<unknown>;
};

/**
 * @file Live verification of the one gap left open by `ADS-memory/reports/
 * 2026-08-15-agent-page-control-readpath-verification.md`: that report's static trace showed a real,
 * wired path from `data-agent-element`/`agentHandle()` tags to a running CLI agent's tool call and
 * back, but never drove a real browser or a real agent run. This file closes that gap, escalating
 * through three levels the way the report's follow-up brief asked for — cheapest decisive test
 * first, stopping at whichever level actually fails.
 *
 * ## LEVEL 1 — the DOM page driver's exact mechanics, against the real rendered SPA
 *
 * Targets the Static Site tab's `deployment-static-site-credentials-section` region tag (the one
 * `StaticSiteTab.tsx` just had restored) and its `role: "field"` access-token input — the exact
 * handles a future repo picker would drive. Proves three things `@jini-ai/agentic`'s
 * `createDomPageDriver` (`dom-page-driver.ts`) would need to be true for a real client-rendered SPA,
 * using the driver's OWN documented techniques rather than a re-invented approximation:
 *
 * 1. Tags resolve on the real, hydrated DOM (not just in source) — `data-agent-element`/
 *    `data-agent-role` are readable attributes on real elements after a real render.
 * 2. Reading a field's current value works the way `describeState()` reads it — `control.value`.
 * 3. WRITING a value the way `fill()` writes it — through the prototype setter, not a bare
 *    `.value =` — actually reaches React's own state, not just the DOM. This is the one risk the
 *    driver's own source comments call out by name ("React tracks the previous value on the node
 *    and ignores an input event whose value it believes it already has, so a plain `control.value =
 *    text` updates the DOM but leaves React state stale") — proven here by checking a REAL,
 *    state-derived side effect (`publishCredentialRowReadyToSave`'s Save-button gate) actually
 *    flips, not just that the attribute changed.
 *
 * ## LEVEL 2 — the SSE bridge, browser to daemon, with a real bind token
 *
 * Two independent proofs: that the REAL bundled admin JS (not a hand-rolled script) actually opens
 * `GET /api/frontend-sessions/stream` on its own after login (`useAgentPageBridge`,
 * `App.hooks.tsx`), and that the daemon's own end of that same route hands back a real
 * `{type:"attached", sessionId, bindToken}` frame on a real connection, using the exact wire
 * protocol `frontend-session-bridge.ts` speaks.
 *
 * ## LEVEL 3 — the full round trip: a real spawned CLI agent driving a real tagged element
 *
 * Only attempted if Levels 1 and 2 both pass (this file's own escalation policy, matching the
 * dispatch brief: "stop at the first level that fails"). See that test's own doc for exactly what it
 * proves and the one honest scope limitation it discloses.
 */

const STATIC_SITE_TAB_PATH = "/admin/deployment?tab=static-site";
const CREDENTIALS_SECTION_HANDLE = "deployment-static-site-credentials-section";
const TOKEN_FIELD_HANDLE = "deployment-static-site-credentials-token-github-pages";
const SAVE_BUTTON_HANDLE = "deployment-static-site-credentials-save-github-pages";
// The exact field a future repo picker would replace — chosen for LEVEL 3 specifically because it
// carries no secret (no `type="password"`, no suspicious name), so a real value can be asserted on
// verbatim without needing the credential-withholding guard's own separate proof (done cheaply and
// deterministically elsewhere — see this file's own report appendix for that result).
const OWNER_FIELD_HANDLE = "deployment-static-site-publish-owner";
const OWNER_TEST_VALUE = "octocat-live-verification-probe";

/** Minimal SSE frame parser, duplicated from `surface-live-agent.spec.ts` rather than imported —
 *  that file keeps its own copy self-contained for the same reason (no shared streaming helper
 *  exists yet in this directory); same reasoning applies here. */
async function* parseSseFrames(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let sepIndex: number;
    while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);
      const dataLines = rawEvent.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim());
      if (dataLines.length === 0) continue;
      try {
        yield JSON.parse(dataLines.join("\n"));
      } catch {
        // Non-JSON control frames (keep-alive comments) are not data events — skip.
      }
    }
  }
}

/**
 * LEVEL 3's own scope boundary, disclosed here rather than left implicit: this is a faithful but
 * DELIBERATELY MINIMAL re-implementation of `dom-page-driver.ts`'s `findElements`/`describeState`
 * (same attribute names — `data-agent-element`/`data-agent-role`/`data-agent-label` — same
 * `control.value` read), scoped to exactly the one query this test issues, executed via real
 * `page.evaluate` calls against the REAL rendered admin tab. It stands in for the bundled
 * `createFrontendSessionBridge`'s browser-side execution, which this test cannot reach directly (it
 * is a closure inside a live React component, not something a test process can import and drive).
 * Everything downstream of this — schema validation, the handle/role checks, and the
 * credential-withholding guard — is the REAL `executePageCapability` from the REAL installed
 * `@jini-ai/agentic` package, unmodified. LEVEL 1 already proved this file's own read/write
 * technique matches the real driver's against this exact page.
 */
function buildPageEvaluateDriver(page: Page) {
  return {
    async findElements(filter: { role?: string; query?: string }) {
      return page.evaluate((f) => {
        const nodes = Array.from(document.querySelectorAll("[data-agent-element]"));
        const found = nodes.map((el) => ({
          handle: el.getAttribute("data-agent-element") ?? "",
          role: el.getAttribute("data-agent-role") ?? undefined,
          label: el.getAttribute("data-agent-label") ?? (el.textContent ?? "").trim(),
          page: el.closest("[data-agent-page]")?.getAttribute("data-agent-page") ?? undefined,
        }));
        const query = f.query?.toLowerCase();
        return found.filter((el) => {
          if (f.role !== undefined && el.role !== f.role) return false;
          if (query === undefined) return true;
          return el.handle.toLowerCase().includes(query) || el.label.toLowerCase().includes(query);
        });
      }, filter);
    },
    async listPages() {
      return [];
    },
    async describeState(handle: string) {
      return page.evaluate((h) => {
        const el = document.querySelector(`[data-agent-element="${h}"]`) as HTMLInputElement | null;
        if (!el) return null;
        const isField = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
        return {
          text: (el.textContent ?? "").trim(),
          ...(isField ? { value: el.value } : {}),
          disabled: (el as HTMLInputElement).disabled === true,
          visible: el.checkVisibility ? el.checkVisibility() : undefined,
          ...(isField
            ? {
                field: {
                  type: el instanceof HTMLInputElement ? el.type.toLowerCase() : "textarea",
                  autocomplete: el.getAttribute("autocomplete")?.toLowerCase() || undefined,
                  name: (el as HTMLInputElement).name || undefined,
                  id: el.id || undefined,
                  accessibleLabels: [document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim() ?? ""].filter(Boolean),
                  readOnly: (el as HTMLInputElement).readOnly === true,
                  disabled: (el as HTMLInputElement).disabled === true,
                },
              }
            : {}),
        };
      }, handle);
    },
  };
}

test.describe.serial("Agent page-control — live verification", () => {
  test("LEVEL 1: DOM page-driver mechanics work against the real rendered SPA — existence, current value, and a React-safe write", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(STATIC_SITE_TAB_PATH, { waitUntil: "domcontentloaded" });

    // ---- Existence + role/label, on the real hydrated DOM. ----
    const section = page.locator(`[data-agent-element="${CREDENTIALS_SECTION_HANDLE}"]`);
    await expect(section, "the restored credentials-section region tag must render on a real client-rendered page").toBeVisible();
    await expect(section).toHaveAttribute("data-agent-role", "region");

    const tokenField = page.locator(`[data-agent-element="${TOKEN_FIELD_HANDLE}"]`);
    await expect(tokenField).toBeVisible();
    await expect(tokenField).toHaveAttribute("data-agent-role", "field");

    const saveButton = page.locator(`[data-agent-element="${SAVE_BUTTON_HANDLE}"]`);
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toHaveAttribute("data-agent-role", "button");
    // Not yet connected, no token typed — this is the state a real `page.find_elements` caller
    // would find before doing anything, and it must show Save as not yet actionable.
    await expect(saveButton).toBeDisabled();

    // ---- Read the current value the way `describeState()` reads it: `control.value`. ----
    const typedValue = "test-probe-typed-via-playwright-fill";
    await tokenField.fill(typedValue);
    const readBack = await tokenField.evaluate((el: HTMLInputElement) => el.value);
    expect(readBack, "reading .value after a real fill must return what was typed").toBe(typedValue);

    // ---- Write the way `dom-page-driver.ts`'s real `fill()` writes: through the prototype setter,
    // dispatching real `input`/`change` events — not a bare assignment, which the driver's own
    // source comments say React would silently ignore. Mirrors that function's exact technique. ----
    const driverWriteValue = "test-probe-written-via-prototype-setter-dance";
    await tokenField.evaluate((el: HTMLInputElement, value: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (setter) setter.call(el, value);
      else el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, driverWriteValue);

    // The DOM attribute changed immediately —
    await expect(tokenField).toHaveValue(driverWriteValue);

    // — but the decisive check is whether REACT's own state changed, not just the DOM. Give React a
    // frame to re-render (mirrors the driver's own `settle()`, two animation frames), then check a
    // state-DERIVED side effect: `publishCredentialRowReadyToSave` gates Save on a non-blank token,
    // which is real React state (`row.token`), not the raw input's own value. If the prototype-setter
    // write only touched the DOM and React never saw it, `row.token` stays "" and Save stays
    // disabled regardless of what `.value` shows.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(saveButton, "React's own state must have absorbed the driver-style write — Save should now be enabled").toBeEnabled();
    // And the value must still be what was written — not reverted by a stale-render fight, and not
    // silently cleared.
    await expect(tokenField).toHaveValue(driverWriteValue);
  });

  test("LEVEL 2: the SSE bridge from browser to daemon attaches with a real bind token", async ({ page, request, baseURL }) => {
    await waitForAgentDaemon();

    // Real login via `fetch` directly (not the `request` fixture) so this test also holds the raw
    // `Set-Cookie` header needed to stream SSE with `fetch` below — same reason
    // `surface-live-agent.spec.ts` does this rather than reusing the `request` fixture's cookie jar.
    const loginRes = await fetch(`${baseURL}/api/admin/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
    });
    expect(loginRes.status).toBe(200);
    const setCookie = loginRes.headers.getSetCookie?.() ?? [];
    expect(setCookie.length).toBeGreaterThan(0);
    const cookieHeader = setCookie.map((raw) => raw.split(";")[0]).join("; ");

    // ---- Proof 1: the REAL bundled admin JS opens this connection on its own, unprompted, after
    // login — not something only a hand-rolled test script can do. `useAgentPageBridge`
    // (`App.hooks.tsx`) mounts unconditionally once `<main>` renders. ----
    const bridgeStreamRequest = page.waitForRequest(
      (req) => req.url().includes("/api/frontend-sessions/stream"),
      { timeout: 15_000 },
    );
    await page.context().addCookies(
      setCookie.map((raw) => {
        const [pair] = raw.split(";");
        const [name, value] = pair!.split("=");
        return { name: name!, value: value!, url: baseURL! };
      }),
    );
    await page.goto(STATIC_SITE_TAB_PATH, { waitUntil: "domcontentloaded" });
    const realBridgeRequest = await bridgeStreamRequest;
    expect(realBridgeRequest.url(), "the real admin bundle's own bridge must claim page.* capabilities").toContain("capability=page.");

    // ---- Proof 2: the daemon's own end of that same route hands back a real attach frame — same
    // wire protocol `frontend-session-bridge.ts` speaks (`GET .../stream?capability=...`, first
    // frame `{type:"attached", sessionId, bindToken}`). A second, independent connection (this test's
    // own `fetch`) rather than trying to read the browser's already-open EventSource body, which
    // Playwright cannot stream mid-connection. ----
    const streamUrl = `${baseURL}/api/frontend-sessions/stream?capability=${encodeURIComponent("page.find_elements")}&capability=${encodeURIComponent("page.fill")}`;
    const streamRes = await fetch(streamUrl, { headers: { accept: "text/event-stream", cookie: cookieHeader } });
    expect(streamRes.status).toBe(200);
    expect(streamRes.headers.get("content-type") ?? "").toContain("text/event-stream");
    if (!streamRes.body) throw new Error("no response body for frontend-sessions stream");
    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let attached: { type: string; sessionId?: string; bindToken?: string } | undefined;
    const deadline = Date.now() + 10_000;
    while (attached === undefined && Date.now() < deadline) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const sepIndex = buffer.indexOf("\n\n");
      if (sepIndex === -1) continue;
      const rawEvent = buffer.slice(0, sepIndex);
      const dataLine = rawEvent.split("\n").find((line) => line.startsWith("data:"));
      if (dataLine) attached = JSON.parse(dataLine.slice(5).trim());
    }
    await reader.cancel().catch(() => undefined);

    expect(attached, "the stream must send an attached frame").toBeDefined();
    expect(attached!.type).toBe("attached");
    expect(typeof attached!.sessionId, "a real session id must be minted").toBe("string");
    expect(attached!.sessionId!.length).toBeGreaterThan(0);
    expect(typeof attached!.bindToken, "a real bind token must be issued").toBe("string");
    expect(attached!.bindToken!.length).toBeGreaterThan(0);
  });

  test("LEVEL 3: a real spawned CLI agent calls page.find_elements through the real daemon and gets back a real tagged field's real value", async ({ page, baseURL }) => {
    test.setTimeout(6 * 60_000);
    await waitForAgentDaemon();

    await loginAsAdmin(page);
    await page.goto(STATIC_SITE_TAB_PATH, { waitUntil: "domcontentloaded" });
    // A known, non-secret, recognizable value in the exact field a repo picker would drive — so the
    // agent's report can be checked against a concrete fact, not just "some JSON came back".
    await page.getByLabel("GitHub owner or org").fill(OWNER_TEST_VALUE);

    // ---- Attach a frontend session over the real wire protocol, same as LEVEL 2. Kept open and
    // read continuously below, rather than cancelled after the first frame. ----
    const loginRes = await fetch(`${baseURL}/api/admin/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
    });
    expect(loginRes.status).toBe(200);
    const cookieHeader = (loginRes.headers.getSetCookie?.() ?? []).map((raw) => raw.split(";")[0]).join("; ");

    const streamUrl = `${baseURL}/api/frontend-sessions/stream?capability=${encodeURIComponent("page.find_elements")}`;
    const streamRes = await fetch(streamUrl, { headers: { accept: "text/event-stream", cookie: cookieHeader } });
    expect(streamRes.status).toBe(200);
    if (!streamRes.body) throw new Error("no response body for frontend-sessions stream");
    const sessionReader = streamRes.body.getReader();
    const sessionFrames = parseSseFrames(sessionReader);

    const first = await sessionFrames.next();
    const attached = first.value as { type: string; sessionId: string; bindToken: string };
    expect(attached?.type).toBe("attached");
    const { sessionId, bindToken } = attached;

    const driver = buildPageEvaluateDriver(page);
    let servedInvocations = 0;
    /** Serves every invocation this session receives until `stop` is set — runs concurrently with
     *  the run-events stream below, since both must be read at once for the round trip to complete
     *  (the daemon will not deliver an invocation until the run starts; the run will not get a
     *  tool_result until the invocation is served). */
    let stop = false;
    const serveInvocations = (async () => {
      for await (const frame of sessionFrames) {
        if (stop) break;
        if (frame["type"] !== "invocation") continue;
        const invocationId = String(frame["invocationId"]);
        const capabilityId = String(frame["capabilityId"]);
        const input = (frame["input"] ?? {}) as Record<string, unknown>;
        let body: Record<string, unknown>;
        try {
          const output = await executePageCapability(driver, capabilityId, input);
          body = { invocationId, ok: true, output };
        } catch (error) {
          body = { invocationId, ok: false, message: error instanceof Error ? error.message : String(error) };
        }
        await fetch(`${baseURL}/api/frontend-sessions/${encodeURIComponent(sessionId)}/responses`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie: cookieHeader },
          body: JSON.stringify(body),
        });
        servedInvocations += 1;
        if (stop) break;
      }
    })();

    // ---- Start a real run: a real `claude` CLI, bound to the session above, instructed to call
    // page.find_elements and nothing else. Same directive-and-narrow style
    // `surface-live-agent.spec.ts` uses for `content_post_delete`. ----
    const prompt =
      `Use your execute_delegated_tool mechanism (load its schema via ToolSearch first if you need to) ` +
      `to call the Jini-registered tool with id "page.find_elements", with exactly this input: ` +
      `{"query": "GitHub owner", "withState": true}. Do not call any other tool beyond what is needed ` +
      `to load and invoke that one. Do not ask the user anything in text — just call it, then report ` +
      `back only the raw JSON result you received, and stop.`;
    const runRes = await fetch(`${baseURL}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({ contextRef: JSON.stringify({ prompt, frontendBindToken: bindToken }), agentId: "claude" }),
    });
    // Buffer the body ONCE — unlike Playwright's own `APIResponse`, a native `fetch` `Response` body
    // can only be read a single time; reading it twice (once for a failure message, again for
    // `.json()`) throws "Body is unusable" on the second read even when the first succeeds.
    const runResText = await runRes.text();
    expect(runRes.status, `run start should succeed: ${runResText}`).toBe(201);
    const runBody = JSON.parse(runResText) as { run: { id: string } };
    const runId = runBody.run.id;

    // ---- Stream run events until a tool_result for page.find_elements arrives (or the run ends
    // without ever calling it). ----
    const runEventsRes = await fetch(`${baseURL}/api/runs/${runId}/events`, {
      headers: { accept: "text/event-stream", cookie: cookieHeader },
    });
    if (!runEventsRes.body) throw new Error("no response body for run events stream");
    const runReader = runEventsRes.body.getReader();
    let toolResultContent: unknown;
    const seenTypes: string[] = [];
    // DIAGNOSTIC (kept — cheap, and this is exactly the detail a failure here needs): every
    // agent-kind payload's own shape, so a failure message shows WHICH tool was actually called and
    // what it got back, not just the event-kind sequence.
    const agentPayloads: unknown[] = [];
    // The CLI agent this daemon spawns loads a deferred tool's schema via its OWN `ToolSearch`
    // mechanism before it can call it (confirmed live: the first `tool_use`/`tool_result` pair in
    // this run was `ToolSearch(query: "select:mcp__jini__execute_delegated_tool")`, not the delegated
    // call itself) — the exact same tool-loading convention this test's own harness uses. So the
    // FIRST `tool_result` is not necessarily the one this test cares about; track each `tool_use`'s
    // own name by its `toolUseId` and only treat a `tool_result` as the real answer once its matching
    // `tool_use` was actually the delegated-execution call.
    const toolNameByUseId = new Map<string, string>();
    for await (const event of parseSseFrames(runReader)) {
      const kind = event["kind"];
      const payload = event["payload"] as Record<string, unknown> | undefined;
      seenTypes.push(kind === "agent" ? `agent:${payload?.["type"]}` : String(kind));
      if (kind === "agent") agentPayloads.push(payload);
      if (kind === "agent" && payload?.["type"] === "tool_use") {
        const useId = payload["id"];
        const name = payload["name"];
        if (typeof useId === "string" && typeof name === "string") toolNameByUseId.set(useId, name);
      }
      if (kind === "agent" && payload?.["type"] === "tool_result") {
        const useId = payload["toolUseId"];
        const name = typeof useId === "string" ? toolNameByUseId.get(useId) : undefined;
        // `execute_delegated_tool` is the real call; anything else (ToolSearch, describe_tool,
        // search_tools) is bootstrap discovery this test must keep streaming past.
        if (name !== undefined && /execute_delegated_tool/.test(name)) {
          toolResultContent = payload["content"];
          break;
        }
      }
      if (kind === "end" || kind === "error") break;
    }
    await runReader.cancel().catch(() => undefined);

    // ---- Tear down the frontend session before asserting, so a failed assertion doesn't leak an
    // open connection. ----
    stop = true;
    await sessionReader.cancel().catch(() => undefined);
    await serveInvocations.catch(() => undefined);
    await fetch(`${baseURL}/api/runs/${runId}/cancel`, { method: "POST", headers: { "content-type": "application/json", cookie: cookieHeader }, body: "{}" }).catch(() => undefined);

    expect(
      servedInvocations,
      `expected at least one page.find_elements invocation to be served; run events seen: ${seenTypes.join(", ")}; agent payloads: ${JSON.stringify(agentPayloads)}`,
    ).toBeGreaterThan(0);
    expect(toolResultContent, `expected a tool_result event; run events seen: ${seenTypes.join(", ")}`).toBeTruthy();
    const resultText = JSON.stringify(toolResultContent);
    // The decisive check: the real, live value typed into the real rendered field must appear in the
    // model-visible tool result, and the field's real handle/label must be there too — proving this
    // was a genuine read of the live page, not a hallucinated or cached answer.
    expect(resultText.includes(OWNER_TEST_VALUE), `expected the live field value in the tool result; got: ${resultText}`).toBe(true);
    expect(resultText.includes(OWNER_FIELD_HANDLE), `expected the real handle in the tool result; got: ${resultText}`).toBe(true);
  });
});
