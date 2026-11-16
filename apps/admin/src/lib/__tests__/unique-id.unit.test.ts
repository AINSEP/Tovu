import { afterEach, expect, it, vi } from "vitest";
import { uniqueId } from "../unique-id";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("uses crypto.randomUUID when the browser offers it", () => {
  vi.stubGlobal("crypto", { randomUUID: () => "uuid-1", getRandomValues: vi.fn() });
  expect(uniqueId()).toBe("uuid-1");
});

it("falls back to <ms>-<64 random bits in base 36> from getRandomValues in an insecure context", () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_700_000_000_000);
  const getRandomValues = vi.fn((array: Uint32Array) => { array[0] = 35; array[1] = 36; return array; });
  vi.stubGlobal("crypto", { getRandomValues });
  expect(uniqueId()).toBe("1700000000000-z10");
  expect(getRandomValues).toHaveBeenCalledTimes(1);
});

it("refuses a random source that returns fewer than two words rather than minting a weak id", () => {
  vi.stubGlobal("crypto", { getRandomValues: () => new Uint32Array(1) });
  expect(() => uniqueId()).toThrow("unique id random source returned fewer than two values");
});

it("with no Web Crypto at all, keeps ids distinct within the page through a sequence number", () => {
  vi.stubGlobal("crypto", undefined);
  const ids = [uniqueId(), uniqueId(), uniqueId()];
  expect(new Set(ids).size).toBe(3);
  const suffixes = ids.map(id => Number.parseInt(id.split("-")[1]!, 36));
  expect(suffixes[1]).toBe(suffixes[0]! + 1);
  expect(suffixes[2]).toBe(suffixes[1]! + 1);
});
