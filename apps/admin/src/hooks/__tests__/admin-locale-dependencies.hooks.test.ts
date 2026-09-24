import { afterEach, describe, expect, it, vi } from "vitest";

import { publishSettingsRefresh, resetSettingsRefreshBus } from "../../lib/settings-refresh-bus";
import { createFakeAdminLocalePort, defaultAdminLocalePort, DEFAULT_LOCALE } from "../admin-locale-dependencies.hooks";

/**
 * @file Two independent things live in this file and get tested separately:
 *
 * 1. `defaultAdminLocalePort.subscribeToSettingsRefresh` — the real binding's namespace-filtering
 *    wrapper (`refreshApplies`) around the module-level `lib/settings-refresh-bus`. This is the one
 *    piece of real-binding logic worth a direct test rather than only exercising it indirectly
 *    through a hook render — same reasoning `use-admin-execution-credential.hooks.test.ts` gives for
 *    testing its own bus interaction against the real bus rather than a mock of it.
 * 2. `createFakeAdminLocalePort` — the fake itself, so a bug in the test double does not read as a
 *    passing hook test for the wrong reason.
 */

afterEach(() => {
  resetSettingsRefreshBus();
});

describe("defaultAdminLocalePort — namespace filtering", () => {
  it("calls the listener when a refresh names core.language", () => {
    const listener = vi.fn();
    const unsubscribe = defaultAdminLocalePort.subscribeToSettingsRefresh(listener);
    publishSettingsRefresh(["core.language"]);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("calls the listener when a refresh names no namespace at all — the bus's 'unknown, refresh everything' case", () => {
    const listener = vi.fn();
    const unsubscribe = defaultAdminLocalePort.subscribeToSettingsRefresh(listener);
    publishSettingsRefresh();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("does NOT call the listener for a refresh naming only an unrelated namespace", () => {
    const listener = vi.fn();
    const unsubscribe = defaultAdminLocalePort.subscribeToSettingsRefresh(listener);
    publishSettingsRefresh(["core.execution"]);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("unsubscribe stops further calls, including for a still-relevant refresh", () => {
    const listener = vi.fn();
    const unsubscribe = defaultAdminLocalePort.subscribeToSettingsRefresh(listener);
    unsubscribe();
    publishSettingsRefresh(["core.language"]);
    expect(listener).not.toHaveBeenCalled();
  });
});

// 2026-09-23: ~100 hooks each call `useWiredAdminLocale()`, and every one of them mounted its own
// `GET settings/effective?namespace=core.language` — about 100 identical requests per admin page load.
describe("defaultAdminLocalePort.loadLanguage — shared read", () => {
  function stubLocaleFetch(locales: string[]) {
    let index = 0;
    const fetchMock = vi.fn(async () => {
      const locale = locales[Math.min(index++, locales.length - 1)];
      return new Response(JSON.stringify({ data: [{ key: "locale", value: locale }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }
  afterEach(() => vi.unstubAllGlobals());

  it("concurrent reads share one request", async () => {
    const fetchMock = stubLocaleFetch(["es"]);

    const reads = Array.from({ length: 100 }, () => defaultAdminLocalePort.loadLanguage());

    await expect(Promise.all(reads)).resolves.toEqual(Array(100).fill("es"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a read after the shared one settled asks the server again", async () => {
    const fetchMock = stubLocaleFetch(["es", "fr"]);
    await defaultAdminLocalePort.loadLanguage();

    await expect(defaultAdminLocalePort.loadLanguage()).resolves.toBe("fr");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a language refresh drops the in-flight read, and its listeners share one new request", async () => {
    const fetchMock = stubLocaleFetch(["en", "fr"]);
    const before = defaultAdminLocalePort.loadLanguage();
    const reads: Promise<string>[] = [];
    const unsubscribes = [1, 2, 3].map(() =>
      defaultAdminLocalePort.subscribeToSettingsRefresh(() => reads.push(defaultAdminLocalePort.loadLanguage())),
    );

    publishSettingsRefresh(["core.language"]);

    await expect(before).resolves.toBe("en");
    await expect(Promise.all(reads)).resolves.toEqual(["fr", "fr", "fr"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const unsubscribe of unsubscribes) unsubscribe();
  });

  it("a failed read is not reused", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(new Response(JSON.stringify({ data: [{ key: "locale", value: "de" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(defaultAdminLocalePort.loadLanguage()).rejects.toThrow("cannot reach the Tovu API — is the server running?");
    await expect(defaultAdminLocalePort.loadLanguage()).resolves.toBe("de");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("createFakeAdminLocalePort", () => {
  it("defaults loadLanguage() to DEFAULT_LOCALE when no initialLocale is given", async () => {
    const port = createFakeAdminLocalePort();
    await expect(port.loadLanguage()).resolves.toBe(DEFAULT_LOCALE);
  });

  it("loadLanguage() resolves to the given initialLocale", async () => {
    const port = createFakeAdminLocalePort({ initialLocale: "fr" });
    await expect(port.loadLanguage()).resolves.toBe("fr");
  });

  it("publishLocaleChange changes what the NEXT loadLanguage() resolves to", async () => {
    const port = createFakeAdminLocalePort({ initialLocale: "en" });
    port.publishLocaleChange("es");
    await expect(port.loadLanguage()).resolves.toBe("es");
  });

  it("loadLanguage() rejects with loadLanguageError when set, and keeps rejecting on repeat calls", async () => {
    const boom = new Error("boom");
    const port = createFakeAdminLocalePort({ loadLanguageError: boom });
    await expect(port.loadLanguage()).rejects.toBe(boom);
    await expect(port.loadLanguage()).rejects.toBe(boom);
  });

  it("notifies every current subscriber on publishLocaleChange", () => {
    const port = createFakeAdminLocalePort();
    const a = vi.fn();
    const b = vi.fn();
    port.subscribeToSettingsRefresh(a);
    port.subscribeToSettingsRefresh(b);
    port.publishLocaleChange("de");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("a subscriber's unsubscribe stops it, without affecting other subscribers", () => {
    const port = createFakeAdminLocalePort();
    const a = vi.fn();
    const b = vi.fn();
    const unsubscribeA = port.subscribeToSettingsRefresh(a);
    port.subscribeToSettingsRefresh(b);

    unsubscribeA();
    port.publishLocaleChange("ja");

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
});
