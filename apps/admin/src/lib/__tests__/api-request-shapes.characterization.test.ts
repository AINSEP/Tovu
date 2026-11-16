import { afterEach, describe, expect, test, vi } from "vitest";

import { API_CLIENTS } from "./api-request-shapes.clients";
import samples from "./api-request-shapes.samples.json";

/**
 * @file The request-shape table (size 06, step 0a). Every admin API client member is called with
 * recorded sample arguments against a fake `fetch`, and what it sent is snapshotted: method, URL,
 * headers, body and the fetch options a server or proxy can observe. The samples were generated
 * once from the parameter types of the unsplit `lib/api.ts`; a `min` row passes only required
 * arguments and a `full` row fills every optional one, so option branches are pinned too.
 *
 * Moving a member to another client file must leave its rows byte-identical. The three members
 * that only build a URL string never fetch; their return value is the pin.
 */

type Sample = { min: unknown[]; full: unknown[] };
const SAMPLES = samples as unknown as Record<string, Sample>;
const URL_BUILDERS = new Set(["templatePreviewUrl", "mediaOriginalUrl", "mediaPreviewRenditionUrl"]);
/** Long enough for a member that reads a file before sending; only a member that keeps polling runs it out. */
const SETTLE_MS = 500;

afterEach(() => {
  vi.unstubAllGlobals();
});

function isMarker({ value, key }: { value: unknown; key: string }): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && key in value;
}

/** Turns the JSON stand-ins for values JSON cannot hold back into real ones. */
function revive({ value }: { value: unknown }): unknown {
  if (Array.isArray(value)) return value.map((item) => revive({ value: item }));
  if (value === null || typeof value !== "object") return value;
  if (isMarker({ value, key: "$blob" })) return new Blob([String(value.$blob)], { type: "text/plain" });
  if (isMarker({ value, key: "$file" })) return new File(["sample file body"], String(value.$file), { type: "text/plain" });
  if (isMarker({ value, key: "$signal" })) return new AbortController().signal;
  if (isMarker({ value, key: "$date" })) return new Date(String(value.$date));
  if (isMarker({ value, key: "$fn" })) return () => undefined;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, revive({ value: item })]));
}

function describeBody({ body }: { body: unknown }): unknown {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") return body;
  if (body instanceof Blob) return `Blob(type=${body.type}, size=${body.size})`;
  return `non-string body: ${Object.prototype.toString.call(body)}`;
}

function describeCall({ input, init }: { input: unknown; init: RequestInit }): Record<string, unknown> {
  return {
    method: init.method ?? "GET",
    url: String(input),
    headers: [...new Headers(init.headers).entries()].sort(([a], [b]) => a.localeCompare(b)),
    body: describeBody({ body: init.body }),
    credentials: init.credentials,
    keepalive: init.keepalive,
    cache: init.cache,
    hasSignal: init.signal !== undefined && init.signal !== null,
  };
}

function ownerOf({ member }: { member: string }): Record<string, (...args: unknown[]) => unknown> {
  const owners = Object.values(API_CLIENTS).filter((client) => Object.prototype.hasOwnProperty.call(client, member));
  if (owners.length !== 1) throw new Error(`${member} must belong to exactly one API client, found ${owners.length}`);
  return owners[0] as Record<string, (...args: unknown[]) => unknown>;
}

function jsonOk(): Response {
  return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
}

/** Calls one member and returns what it sent. Requests made after the member settled are not its rows. */
async function requestShape({ member, args }: { member: string; args: unknown[] }): Promise<Record<string, unknown>> {
  const calls: Record<string, unknown>[] = [];
  let open = true;
  vi.stubGlobal("fetch", (input: unknown, init: RequestInit = {}) => {
    if (!open) return new Promise<Response>(() => undefined);
    calls.push(describeCall({ input, init }));
    return Promise.resolve(jsonOk());
  });
  let outcome: string;
  try {
    const settled = Promise.resolve(ownerOf({ member })[member](...(revive({ value: args }) as unknown[])))
      .then(() => "resolved", (error: unknown) => `rejected: ${error instanceof Error ? error.name : typeof error}`);
    const waited = new Promise<string>((resolve) => setTimeout(() => resolve("still running"), SETTLE_MS));
    outcome = await Promise.race([settled, waited]);
  } catch (error) {
    outcome = `threw: ${error instanceof Error ? error.name : typeof error}`;
  }
  open = false;
  return { outcome, calls };
}

const FETCHING = Object.keys(SAMPLES).filter((member) => !URL_BUILDERS.has(member));

describe("request-shape table: what every fetching member sends", () => {
  test("the table covers every member of every client, once", () => {
    const members = Object.values(API_CLIENTS).flatMap((client) => Object.keys(client)).sort();
    expect(members).toEqual(Object.keys(SAMPLES).sort());
  });

  test.each(FETCHING)("%s", async (member) => {
    const row = {
      min: await requestShape({ member, args: SAMPLES[member].min }),
      full: await requestShape({ member, args: SAMPLES[member].full }),
    };
    expect(row).toMatchSnapshot();
  });
});

describe("URL builders: the string each one returns", () => {
  test.each([...URL_BUILDERS])("%s", (member) => {
    const build = ownerOf({ member })[member];
    const row = {
      min: build(...(revive({ value: SAMPLES[member].min }) as unknown[])),
      full: build(...(revive({ value: SAMPLES[member].full }) as unknown[])),
    };
    expect(row).toMatchSnapshot();
  });
});
