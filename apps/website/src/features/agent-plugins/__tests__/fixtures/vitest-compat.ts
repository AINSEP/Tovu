import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { after, mock } from "node:test";

/**
 * @file The small slice of vitest's `expect` / `vi` API the `@jini-ai/devops` deploy-target suites
 * use, over `node:assert` and `node:test`, so those suites PORT to this repo's runner unchanged
 * (deploy plan §7 risk 7: "port them, don't re-author"). Tovu has no vitest.
 *
 * Covered, and nothing else: `toBe`, `toEqual`, `toMatchObject`, `toThrow`, `toBeInstanceOf`,
 * `toBeUndefined`, `toBeNull`, `toBeDefined`, `toHaveLength`, `toMatch`, `toContain`,
 * `toBeGreaterThan`, `toHaveProperty`, `toHaveBeenCalled`, `toHaveBeenCalledTimes`, with `.not` and
 * `.rejects`; `expect.stringContaining`; `vi.fn` (+ `mockResolvedValue`, `mockClear`, `mock.calls`),
 * `vi.stubGlobal` / `vi.unstubAllGlobals`, and fake timers over `node:test`'s `mock.timers`.
 * An unsupported matcher is a TypeError at the call, never a silent pass.
 *
 * Also owns the network guard: {@link installNetworkGuard} makes the unstubbed global `fetch` throw
 * and fails the file if anything reached it, so a ported case that forgot its stub can never call
 * a real host.
 */

const ASYMMETRIC = Symbol("asymmetric-matcher");

interface AsymmetricMatcher {
  readonly [ASYMMETRIC]: true;
  matches(actual: unknown): boolean;
  readonly description: string;
}

function isAsymmetric(value: unknown): value is AsymmetricMatcher {
  return typeof value === "object" && value !== null && (value as Partial<AsymmetricMatcher>)[ASYMMETRIC] === true;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * vitest's equality: asymmetric matchers match by predicate, plain objects compare by own keys with
 * `undefined`-valued keys ignored (`toEqual`), arrays element-wise, everything else by
 * `isDeepStrictEqual`. `partial` is `toMatchObject`: only the expected object's keys must match.
 * @complexity O(n) in the size of `expected`.
 */
function equals(actual: unknown, expected: unknown, partial: boolean): boolean {
  if (isAsymmetric(expected)) return expected.matches(actual);
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length && expected.every((item, i) => equals(actual[i], item, partial));
  }
  if (isPlainRecord(expected)) {
    if (typeof actual !== "object" || actual === null || Array.isArray(actual)) return false;
    const record = actual as Record<string, unknown>;
    const keys = (source: Record<string, unknown>) => Object.keys(source).filter((key) => source[key] !== undefined);
    const expectedKeys = keys(expected);
    if (!partial && keys(record).length !== expectedKeys.length) return false;
    return expectedKeys.every((key) => equals(record[key], expected[key], partial)) && (partial || keys(record).every((key) => key in expected));
  }
  return Object.is(actual, expected) || isDeepStrictEqual(actual, expected);
}

type ErrorClass = abstract new (...args: never[]) => unknown;

function throwMatches(error: unknown, expected: unknown): boolean {
  if (expected === undefined) return true;
  const message = error instanceof Error ? error.message : String(error);
  if (typeof expected === "string") return message.includes(expected);
  if (expected instanceof RegExp) return expected.test(message);
  if (typeof expected === "function") return error instanceof (expected as ErrorClass);
  return equals(error, expected, true);
}

interface MockState {
  calls: unknown[][];
}

export interface MockFn {
  (...args: unknown[]): unknown;
  readonly mock: MockState;
  mockResolvedValue(value: unknown): MockFn;
  mockClear(): MockFn;
}

function isMockFn(value: unknown): value is MockFn {
  return typeof value === "function" && typeof (value as Partial<MockFn>).mock === "object";
}

function show(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Each matcher returns whether it passed plus the failure text for the non-negated form. */
type MatcherResult = readonly [pass: boolean, message: string];

function matchers(actual: unknown): Record<string, (...args: unknown[]) => MatcherResult> {
  const calls = () => {
    assert.ok(isMockFn(actual), "expected a vi.fn() mock");
    return actual.mock.calls;
  };
  return {
    toBe: (expected) => [Object.is(actual, expected), `expected ${show(actual)} to be ${show(expected)}`],
    toEqual: (expected) => [equals(actual, expected, false), `expected ${show(actual)} to equal ${show(expected)}`],
    toMatchObject: (expected) => [equals(actual, expected, true), `expected ${show(actual)} to match ${show(expected)}`],
    toBeInstanceOf: (cls) => [actual instanceof (cls as ErrorClass), `expected ${show(actual)} to be an instance of ${(cls as { name?: string }).name}`],
    toBeUndefined: () => [actual === undefined, `expected ${show(actual)} to be undefined`],
    toBeNull: () => [actual === null, `expected ${show(actual)} to be null`],
    toBeDefined: () => [actual !== undefined, "expected a defined value"],
    toHaveLength: (length) => [(actual as { length?: unknown })?.length === length, `expected length ${show((actual as { length?: unknown })?.length)} to be ${show(length)}`],
    toMatch: (pattern) => [
      typeof actual === "string" && (pattern instanceof RegExp ? pattern.test(actual) : actual.includes(String(pattern))),
      `expected ${show(actual)} to match ${String(pattern)}`,
    ],
    toContain: (item) => [
      typeof actual === "string" ? actual.includes(String(item)) : Array.isArray(actual) && actual.includes(item),
      `expected ${show(actual)} to contain ${show(item)}`,
    ],
    toBeGreaterThan: (bound) => [(actual as number) > (bound as number), `expected ${show(actual)} to be greater than ${show(bound)}`],
    toHaveProperty: (...args) => {
      const has = typeof actual === "object" && actual !== null && Object.hasOwn(actual, args[0] as string);
      const valueOk = args.length < 2 || (has && equals((actual as Record<string, unknown>)[args[0] as string], args[1], false));
      return [has && valueOk, `expected ${show(actual)} to have property ${String(args[0])}`];
    },
    toHaveBeenCalled: () => [calls().length > 0, "expected the mock to have been called"],
    toHaveBeenCalledTimes: (count) => [calls().length === count, `expected ${calls().length} calls to be ${show(count)}`],
    toThrow: (expected) => {
      assert.equal(typeof actual, "function", "toThrow needs a function (or .rejects)");
      try {
        (actual as () => unknown)();
      } catch (error) {
        return [throwMatches(error, expected), `expected thrown ${show((error as Error)?.message ?? error)} to match ${String(expected)}`];
      }
      return [false, "expected the function to throw"];
    },
  };
}

type Matchers = Record<string, (...args: unknown[]) => void>;
type AsyncMatchers = Record<string, (...args: unknown[]) => Promise<void>>;

function bindMatchers(actual: unknown, negate: boolean): Matchers {
  return new Proxy({} as Matchers, {
    get(_target, name: string) {
      const matcher = matchers(actual)[name];
      if (!matcher) throw new TypeError(`vitest-compat: unsupported matcher '${name}'`);
      return (...args: unknown[]) => {
        const [pass, message] = matcher(...args);
        if (pass === negate) assert.fail(negate ? `NOT: ${message}` : message);
      };
    },
  });
}

/** `.rejects`: awaits the promise, requires a rejection, then applies the matcher to the reason
 *  (`toThrow(x)` matches the reason as a thrown error). */
function bindRejects(promise: unknown, negate: boolean): AsyncMatchers {
  return new Proxy({} as AsyncMatchers, {
    get(_target, name: string) {
      return async (...args: unknown[]) => {
        try {
          await promise;
        } catch (error) {
          const matcher = matchers(error)[name];
          if (!matcher) throw new TypeError(`vitest-compat: unsupported matcher '${name}'`);
          const [pass, message]: MatcherResult =
            name === "toThrow" ? [throwMatches(error, args[0]), `expected rejection ${show((error as Error)?.message ?? error)} to match ${String(args[0])}`] : matcher(...args);
          if (pass === negate) assert.fail(negate ? `NOT: ${message}` : message);
          return;
        }
        assert.fail("expected a rejection, got a resolution");
      };
    },
  });
}

export interface Expectation extends Matchers {
  readonly not: Matchers;
  readonly rejects: AsyncMatchers;
}

export function expect(actual: unknown): Expectation {
  const positive = bindMatchers(actual, false);
  return new Proxy(positive as Expectation, {
    get(target, name: string) {
      if (name === "not") return bindMatchers(actual, true);
      if (name === "rejects") return bindRejects(actual, false);
      return target[name];
    },
  });
}

expect.stringContaining = (substring: string): AsymmetricMatcher => ({
  [ASYMMETRIC]: true,
  matches: (actual) => typeof actual === "string" && actual.includes(substring),
  description: `StringContaining ${show(substring)}`,
});

const stubbedGlobals = new Map<string, unknown>();

/** Steps fake time forward, letting awaited continuations run between timer firings. */
async function advanceTimersByTimeAsync(ms: number): Promise<void> {
  const step = 50;
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    mock.timers.tick(Math.min(step, ms - elapsed));
    for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
  }
}

export const vi = {
  fn(impl?: (...args: never[]) => unknown): MockFn {
    let implementation = impl as ((...args: unknown[]) => unknown) | undefined;
    const state: MockState = { calls: [] };
    const fn = ((...args: unknown[]) => {
      state.calls.push(args);
      return implementation?.(...args);
    }) as MockFn;
    Object.defineProperty(fn, "mock", { value: state });
    fn.mockResolvedValue = (value) => {
      implementation = async () => value;
      return fn;
    };
    fn.mockClear = () => {
      state.calls = [];
      return fn;
    };
    return fn;
  },
  stubGlobal(name: string, value: unknown): void {
    const globals = globalThis as Record<string, unknown>;
    if (!stubbedGlobals.has(name)) stubbedGlobals.set(name, globals[name]);
    globals[name] = value;
  },
  unstubAllGlobals(): void {
    const globals = globalThis as Record<string, unknown>;
    for (const [name, original] of stubbedGlobals) globals[name] = original;
    stubbedGlobals.clear();
  },
  useFakeTimers(): void {
    mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  },
  useRealTimers(): void {
    mock.timers.reset();
  },
  advanceTimersByTimeAsync,
};

/**
 * Replaces the global `fetch` with one that throws for the rest of this test file, and fails the file
 * in an `after` hook if anything called it. `vi.unstubAllGlobals` restores to this guard, not to the
 * real `fetch`, because the guard is what was installed when the first stub was taken.
 */
export function installNetworkGuard(): void {
  const reached: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    reached.push(url);
    throw new Error(`network guard: unstubbed fetch to ${url}`);
  }) as typeof fetch;
  after(() => assert.deepEqual(reached, [], "no test may reach the real network"));
}
