import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { test, expect, type Page } from "@playwright/test";

import { loginAsAdmin } from "./auth-fixtures";

/**
 * @file Permanent regression guard for the Gemini BYOK tool-schema bug (2026-08-04 dispatch).
 *
 * Drives the REAL admin UI end to end — real login (`auth-fixtures.ts`), real Settings ->
 * Execution mode -> BYOK -> Google Gemini form, real `AssistantDock` chat pane, real send — and
 * proves what actually leaves Tovu's SERVER on the wire when it calls Google, by pointing BYOK's
 * `baseUrl` at a "confused deputy" this file starts and owns (the pattern `byok-ssrf-guard.spec.ts`/
 * `byok-hostile-provider.spec.ts` already establish in this suite). No real Gemini key, no quota,
 * fully hermetic and deterministic — this is the spec meant to catch a REGRESSION on any machine,
 * with or without a real key. See `byok-google-live-smoke.spec.ts` for the companion real-API proof.
 *
 * **Why this asserts on the CAPTURED payload, not a reimplementation of the sanitizer.** The bug
 * (`src/assistant/byok-provider-turn.ts`) was Tovu sending the ~131-tool admin catalog as
 * `tools[0].functionDeclarations[].parameters` in raw JSON Schema, which Gemini's restricted OpenAPI
 * subset rejects. Four confirmed rejection classes: `additionalProperties` (and by the same
 * evidence, `$schema`/`$ref`/`$defs`), `const`, array-valued `type`, and non-string `enum` members.
 * Re-deriving `sanitizeGoogleSchema`'s own rules here and comparing outputs would only prove the
 * sanitizer agrees with itself; reading the literal bytes the deputy received is what proves the real
 * request path — route -> `runByokProviderTurn` -> `runGoogleTurn` -> `fetch()` — actually applies it.
 *
 * **Why the deputy also answers with a real reply.** A clean payload is necessary but not
 * sufficient — the point of the whole feature is a chat turn that works. The deputy's
 * `streamGenerateContent` response is a minimal, real-shaped Gemini SSE frame (`alt=sse`, bare
 * `data: {...}\n\n` records — verified against `@jini-ai/agent-runtime`'s `decodeSseStream`, which
 * needs no `event:` line), so the turn completes with `finishReason: 'STOP'` and no tool call, and
 * the reply is asserted to actually render in `AssistantDock`'s `ChatPane`.
 */

const ADMIN_ORIGIN_PATH = "/admin/";
const FAKE_GEMINI_KEY = "AIzaTest-FAKE-GEMINI-KEY-NOT-REAL-0000000000";
const DEPUTY_REPLY_TEXT = "Hello from the deputy. This is a real Gemini-shaped SSE reply.";

interface CapturedStreamRequest {
  readonly url: string;
  readonly headers: http.IncomingHttpHeaders;
  readonly body: unknown;
}

interface Deputy {
  readonly baseUrl: string;
  readonly close: () => Promise<void>;
  readonly streamRequests: () => readonly CapturedStreamRequest[];
}

/**
 * Starts the confused-deputy "Google Gemini" server this spec fully controls. Answers BOTH surfaces
 * the real BYOK code path can reach for a `protocol: 'google'` config:
 *  - `GET /v1beta/models?key=...` — `ExecutionTab`'s own automatic model-discovery effect (fires as
 *    soon as the Google Gemini preset is selected, before this spec even types a base URL into the
 *    field — see that effect's own comment in `ExecutionTab.tsx`). Answered blandly; nothing in this
 *    spec asserts on it.
 *  - `POST /v1beta/models/<model>:streamGenerateContent?alt=sse` — the actual chat turn. Every such
 *    request is captured (method, url, headers, parsed JSON body) for the real assertions below.
 */
async function startGeminiDeputy(): Promise<Deputy> {
  const streamRequests: CapturedStreamRequest[] = [];

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const rawBody = Buffer.concat(chunks).toString("utf8");
      const url = req.url ?? "";

      if (req.method === "GET" && url.startsWith("/v1beta/models")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ models: [] }));
        return;
      }

      if (req.method === "POST" && url.includes(":streamGenerateContent")) {
        let parsedBody: unknown = null;
        try {
          parsedBody = rawBody.length > 0 ? JSON.parse(rawBody) : null;
        } catch {
          parsedBody = { __parseError: rawBody.slice(0, 500) };
        }
        streamRequests.push({ url, headers: req.headers, body: parsedBody });

        const frame = {
          candidates: [
            {
              content: { parts: [{ text: DEPUTY_REPLY_TEXT }], role: "model" },
              finishReason: "STOP",
            },
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        };
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
        });
        res.write(`data: ${JSON.stringify(frame)}\n\n`);
        res.end();
        return;
      }

      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "unhandled path in deputy" } }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    // `closeAllConnections()` BEFORE `close()`, and it is load-bearing rather than tidy-up.
    // `server.close()` alone stops accepting new connections and then waits for every existing one
    // to end on its own. The client here is Tovu's own server-side `fetch` (undici), which holds
    // its sockets open in a keep-alive pool after the response completes — so nothing ever ends
    // them, `close()`'s callback never fires, and this `await` in the test's `finally` hangs
    // forever. Observed: the run sat at 7m54s on a test with a 90s timeout, both web servers
    // already torn down, no result ever printed — a hang that reads exactly like an infra flake
    // and cost several full retry cycles to attribute.
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
    streamRequests: () => streamRequests,
  };
}

interface SchemaViolation {
  readonly path: string;
  readonly issue: string;
}

/**
 * The exhaustive, recursive check this whole spec exists to run: every key Gemini's real API is
 * confirmed (see `byok-provider-turn.ts#GOOGLE_SUPPORTED_SCHEMA_KEYS`'s own doc) to reject, checked
 * at EVERY depth of the parsed tree — not just the top level, since the original bug report included
 * a violation nested at `parameters.properties[4].value.properties[0].value`.
 */
function collectGoogleSchemaViolations(node: unknown, path: string, out: SchemaViolation[]): void {
  if (Array.isArray(node)) {
    node.forEach((item, i) => collectGoogleSchemaViolations(item, `${path}[${i}]`, out));
    return;
  }
  if (node === null || typeof node !== "object") return;

  const record = node as Record<string, unknown>;
  for (const forbiddenKey of ["additionalProperties", "$schema", "$ref", "$defs", "const"] as const) {
    if (forbiddenKey in record) {
      out.push({ path: `${path}.${forbiddenKey}`, issue: `forbidden key "${forbiddenKey}" is present` });
    }
  }
  if ("type" in record && Array.isArray(record.type)) {
    out.push({ path: `${path}.type`, issue: `"type" is an array: ${JSON.stringify(record.type)}` });
  }
  if ("enum" in record && Array.isArray(record.enum)) {
    (record.enum as unknown[]).forEach((member, i) => {
      if (typeof member !== "string") {
        out.push({
          path: `${path}.enum[${i}]`,
          issue: `enum member is not a string: ${JSON.stringify(member)} (typeof ${typeof member})`,
        });
      }
    });
  }
  for (const [key, value] of Object.entries(record)) {
    collectGoogleSchemaViolations(value, `${path}.${key}`, out);
  }
}

/** Drives Settings -> Execution mode -> BYOK -> Google Gemini, points the endpoint at the deputy,
 *  and waits for the real autosave (`useSettingsSlice`'s 600ms debounce) to actually land — never a
 *  hard wait; polls the same `.settings-ui-save.is-saved` status text an operator would see. */
async function configureGoogleByokAgainstDeputy(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${ADMIN_ORIGIN_PATH}settings`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("settings-dialog-nav-execution").click();
  await page.getByRole("tab", { name: "BYOK" }).click();
  await page.getByRole("tab", { name: "Google Gemini", exact: true }).click();

  // Targeted by the inputs' own distinguishing attributes, NOT by `label:has-text(...)`. The label
  // form looks cleaner but is not unique here: `has-text` matches a substring anywhere in the
  // label's subtree, and the API-key label contains the word "Model" in its own help text, so
  // `label:has-text("API key") input` resolved to BOTH the key field and the model combobox and
  // failed Playwright's strict-mode check.
  //
  // `.jini-byok-card .jini-field-input-row input`, not `input[type="password"]`: the API key
  // field's `type` toggles to `text` whenever the form's "Show"/"Hide" reveal button is clicked
  // (`ByokProviderForm.tsx`'s `revealKey` state) — a real attribute, but not a stable identity.
  // `.jini-field-input-row` is the structural wrapper only the API key field's row uses (Base URL
  // and Model are plain `.jini-field` labels with no such wrapper), so it stays unique across the
  // whole suite regardless of reveal state. Standardized across every `byok-*.spec.ts` file
  // 2026-08-05.
  // The two LEDGER-owned fields first, and let their autosave fully settle before the key is typed.
  // The ordering is load-bearing — see the note below.
  await page.locator('label:has-text("Base URL") input').fill(baseUrl);
  await page.locator('input[list="jini-byok-model-options"]').fill("gemini-2.5-flash");
  await expect(page.locator(".settings-ui-save.is-saved")).toBeVisible({ timeout: 15_000 });

  /**
   * **The explicit "Save key" press — without it this whole spec cannot reach the provider.**
   *
   * Root-caused 2026-08-05. This spec had been failing with "the deputy never receives a request",
   * carried for several sessions as a pre-existing PRODUCT bug in the turn path. It is not one — the
   * turn path was never reached. Post-ADR-058 the admin's API key is deliberately NOT persisted by the
   * ledger autosave: `AdminByokKeyPanel.tsx` calls this control *"the ONLY control on either screen
   * that writes the admin's own credential"* and *"Never fires automatically"*, and `api.ts`'s wrapper
   * agrees — *"explicit save only — never called from the debounced ledger-slice auto-save path a
   * typed key would otherwise ride along with."* So the key never reached the server,
   * `createStoredExecutionCredentialPort.resolve()` found no usable row, and the route rejected the
   * request before `runByokProviderTurn` was ever called. Observed on `POST .../assistant/byok-turn`:
   *
   *     status=400 {"error":"no usable BYOK credential — supply 'byok' with a supported protocol,
   *                 a non-empty apiKey, and a model, or save one first in Settings",
   *                 "code":"VALIDATION_ERROR"}
   *
   * **Why the key is typed LAST and saved immediately.** Measured, in this order, in one run:
   *
   *     PROBE-A enabled-right-after-key-fill      = true
   *     PROBE-B enabled-after-model-fill          = true
   *     PROBE-C enabled-after-ledger-autosave     = false
   *     PROBE-D key-field-value                   = ""
   *
   * The ledger autosave's round trip replaces the settings slice with the server's saved value, which
   * by ADR-058's design carries no `apiKey` — so a typed-but-not-yet-saved key is **wiped from the
   * form**, and "Save key" (gated on `hasUsableAdminKey`) goes disabled. Filling the key before
   * waiting on `.settings-ui-save.is-saved`, as this helper used to, therefore destroys the key it is
   * about to try to save. Typing it after that wait, and pressing Save inside the 600ms debounce
   * window, avoids the wipe; once the save lands, `stored.isSet` is true and a later wipe is harmless
   * because the credential now lives server-side.
   *
   * Pressed after the model field is filled, deliberately: `saveKey` sends the current
   * protocol/providerId/baseUrl/model alongside the key, and a stored row with no model is treated as
   * unusable (`byok-credential.ts`), which would reproduce the identical 400.
   */
  await page.locator(".jini-byok-card .jini-field-input-row input").fill(FAKE_GEMINI_KEY);
  await page.locator('.assistant-key-footer button:has-text("Save key")').click();
  await expect(page.locator(".assistant-key-footer .assistant-save-line")).toContainText(
    "Saved to the server, encrypted.",
    { timeout: 15_000 },
  );
}

test("BYOK Gemini: the real outbound tool schema is Gemini-clean at every depth, and the turn renders a reply", async ({
  page,
}) => {
  test.slow();
  const deputy = await startGeminiDeputy();

  try {
    await loginAsAdmin(page);
    await configureGoogleByokAgainstDeputy(page, deputy.baseUrl);

    // A fresh navigation to the admin root remounts `AssistantDock`, whose own `useExecutionConfig`
    // loads the config that was just saved (ledger + localStorage) — the dock has no live
    // subscription to the settings save, so this reload is what makes the just-configured BYOK
    // mode/credential visible to it. See `AssistantDock.tsx`'s `useExecutionConfig` doc.
    await page.goto(ADMIN_ORIGIN_PATH, { waitUntil: "domcontentloaded" });
    await page.locator(".admin-layout").waitFor({ state: "visible", timeout: 15_000 });

    await page.getByRole("button", { name: "Open assistant" }).click();
    const dock = page.locator('aside[aria-label="Assistant"]');
    const composer = dock.locator(".jini-composer-input");
    await composer.waitFor({ state: "visible", timeout: 10_000 });
    await composer.fill("Say hello in one short sentence.");
    await dock.locator(".jini-composer-send").click();

    // The real assertions: wait for the deputy to have actually received the turn, then inspect the
    // literal bytes it captured — not a re-derivation of the sanitizer's own rules.
    await expect.poll(() => deputy.streamRequests().length, { timeout: 30_000 }).toBeGreaterThan(0);
    const [captured] = deputy.streamRequests();

    // Bonus, documented correction (`google-messages.ts#googleRequestUrl`'s own doc): auth travels
    // as the `x-goog-api-key` header, never a `?key=` query param, on the chat endpoint.
    expect(captured.headers["x-goog-api-key"]).toBe(FAKE_GEMINI_KEY);
    expect(new URL(`http://x${captured.url}`).searchParams.has("key")).toBe(false);

    const body = captured.body as { tools?: unknown };
    expect(Array.isArray(body.tools), `tools was not an array: ${JSON.stringify(body.tools)}`).toBe(true);
    const tools = body.tools as Array<{ functionDeclarations?: unknown }>;
    expect(tools.length).toBeGreaterThan(0);
    expect(Array.isArray(tools[0]?.functionDeclarations)).toBe(true);
    const declarations = tools[0]!.functionDeclarations as Array<{ name?: unknown; parameters?: unknown }>;
    // Exactly the 3 meta-tools, not the 131 real ones. This assertion INVERTED on 2026-08-05: it
    // used to demand >50 declarations as proof the real catalog was being sent, which was the right
    // check while the route published every descriptor. It no longer does — `assistant-byok.ts`
    // sends `toolSurface.metaTools` (see `META_TOOL_DESCRIPTORS`), and the real catalog is reached
    // through `execute_delegated_tool` instead. Pinned to the exact set rather than a loose bound,
    // because "3 tools go out" is now the property worth protecting: a regression that quietly
    // reintroduced the full catalog would restore ~119 KB per message and would otherwise pass.
    expect(declarations.map((d) => d.name)).toEqual(["search_tools", "describe_tool", "execute_delegated_tool"]);

    const violations: SchemaViolation[] = [];
    declarations.forEach((decl, i) => {
      const name = typeof decl.name === "string" ? decl.name : `#${i}`;
      collectGoogleSchemaViolations(decl.parameters, `tools[0].functionDeclarations[${i}](${name}).parameters`, violations);
    });
    expect(violations, `Gemini-incompatible schema fields found:\n${JSON.stringify(violations, null, 2)}`).toEqual([]);

    // The turn actually completing: no failed-run marker, and the deputy's own reply text renders.
    await expect(dock.locator(".jini-message-error")).toHaveCount(0, { timeout: 20_000 });
    const assistantReply = dock.locator(".jini-message-assistant").last();
    await expect(assistantReply).toContainText(DEPUTY_REPLY_TEXT, { timeout: 20_000 });
  } finally {
    await deputy.close();
  }
});
