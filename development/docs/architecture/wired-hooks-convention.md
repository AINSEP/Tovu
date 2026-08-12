# The `useWiredX` hook convention

Status as of 2026-08-11. No prior version of this document existed — a previous session cited
`AI-Dev-Shop/skills/impeccable/reference/hooks.md` as "the spec"; that file documents an unrelated
Claude/Codex/Cursor lifecycle hook and has nothing to do with this. Do not cite it.

**Read this before writing or converting an `apps/admin/src/**/*.hooks.ts(x)` file.** It is the
contract this codebase's hooks are supposed to follow, not a proposal.

## What it is, and why

A hook that reaches for a host dependency (`lib/api`'s `api`, `useAdminLocale()`, `lib/router`'s
`navigate`, `@jini-ai/ui`'s `useI18n()`, …) directly is only testable by mocking that dependency at
the module level (`vi.mock(...)`) or standing up the real provider tree around it. `useWiredX` trades
that for a plain function argument: the hook takes its dependencies in, a test passes a fake, done.

One sentence: **dependencies are injected, not reached for, so a hook is testable without a provider
tree or module mocking.**

## The canonical shape

Four pieces, one hook (or tightly-related group of hooks reading the same resource):

1. **`<feature>-port.hooks.ts`** — declares an interface naming exactly the methods the hook calls.
   Nothing outside this file and the dependencies file imports the real client.
2. **`<feature>-dependencies.hooks.ts`** — `default<Feature>Port`, a module-level singleton binding
   the port to the real client, plus `createFake<Feature>Port(seed)` for tests. "Every port gets a
   fake" — ship both in the same commit, always.
3. **`useX(dependencies)`** — the pure hook. Dependencies come in as the typed port (plus any other
   injected values — `navigate`, `t`, a resolved `locale: string`), never imported.
4. **`useWiredX()`** — zero-arg. Composes `useX(defaultPort, ...)`. This is what production
   components mount. Deliberately a one-liner with no logic of its own.

A component that already has a DI prop for the whole controller hook (`RedirectsProps
.useRedirectsHook?: typeof useRedirectsHook`) just repoints its default at `useWiredX` and retypes the
prop as `typeof useWiredX` — that's the entire change on the component side.

```ts
// <feature>-port.hooks.ts
export interface FooPort {
  getFoo(id: string): Promise<Foo>;
  saveFoo(id: string, patch: Partial<Foo>): Promise<Foo>;
}

// <feature>-dependencies.hooks.ts
export const defaultFooPort: FooPort = {
  getFoo: (id) => api.getFoo(id),
  saveFoo: (id, patch) => api.saveFoo(id, patch),
};
export function createFakeFooPort(seed: FakeFooPortOptions = {}): FooPort & { current: Foo } { … }

// use-foo.hooks.ts
export function useFoo(id: string, port: FooPort): FooController { … }
export function useWiredFoo(id: string): FooController {
  return useFoo(id, defaultFooPort);
}
```

Live examples, in order of how much surface they cover:

- `apps/admin/src/hooks/use-assistant-chats.hooks.ts` +
  `apps/admin/src/hooks/assistant-chats-port.hooks.ts` +
  `apps/admin/src/hooks/assistant-chats-dependencies.hooks.ts` — the original, and the one with the
  most doc-comment reasoning about *why* each design choice was made (the `portRef` pattern in
  particular — read it before assuming a port needs to be memoized).
- `apps/admin/src/features/settings/hooks/use-external-mcp.hooks.ts` — not a `useX`/`useWiredX` pair
  itself; it's the wired-dependencies *builder* for `@jini-ai/ui`'s own already-conforming
  `useSourceConfigList`. Shows the pattern composing across a package boundary.
- `apps/admin/src/features/redirects/hooks/{use-redirects,use-hit-count-cell,use-import-redirects-
  form}.hooks.ts` + `redirects-{port,dependencies}.hooks.ts` — commit `2ea11f4`. Three hooks sharing
  ONE port because they read the same resource. `Redirects.tsx`'s pre-existing DI prop repointed.
  Confirmed safe to leave the port unmemoized (no `useCallback` here depends on its identity) — read
  that commit's own reasoning before assuming every hook needs `portRef`'s ref-indirection; most don't.
- `apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts` + `page-editor-{port,dependencies}
  .hooks.ts` — a hook injecting FOUR things at once (`port`, `navigate`, `t`, a resolved `locale`
  string), not just a port. Shows the shape for a hook that reaches multiple categories at once.
- `apps/admin/src/hooks/use-admin-execution-credential.hooks.ts` + `admin-execution-credential-
  {port,dependencies}.hooks.ts` — a port scoped to TWO calls out of a file that reaches several
  things; see "When it does not apply" below for why the rest of that file's reaches were left alone.
- `apps/admin/src/features/ai-assistant/hooks/use-ai-assistant-locale-sync.hooks.ts` +
  `apps/admin/src/features/settings/hooks/use-settings-locale-sync.hooks.ts` — the smallest instance:
  injecting `{ activeLocale, setLocale }` in place of a direct `useI18n()` call. No separate port file
  — two fields don't earn one; the interface lives inline in the hook file.

## What stays a direct import — never injected

- **Pure, no-I/O rules.** `persistableMessages`, `describeApiError`, `hasUsableAdminKey`. Injecting a
  pure function lets a fake quietly change a decision rule every test needs to hold still. If it has
  no host boundary and no side effect, import it directly.
- **Generic, framework-shaped hooks one tier below this.** `useAsyncAction`, `useDirtyGuard` — used
  un-injected even by the reference implementations. Same tier as `useState`.

## When the pattern does NOT apply — three real cases, not hypotheticals

Converting a hook for symmetry, without checking these, is the mistake this section exists to
prevent. All three were found and argued through on 2026-08-11 (see
`ADS-memory/reports/implementation/2026-08-11-wired-hooks-audit.md`'s "Resolution of the 5 REVIEW
items" section for the full evidence trail); treat them as the worked examples for the shapes below.

**1. The dependency is already injected through an options object.**
`use-settings-slice.hooks.ts`'s `useSettingsSlice(options: SettingsSliceOptions<T>)` takes `load`/
`save` as plain function arguments — that IS the `useX(dependencies)` half of this pattern, done since
the file's inception. A hook whose actual host I/O already arrives as a parameter has nothing left to
convert; don't invent a second injection layer around an option that already is one.

**2. A module-level singleton ships its own dedicated test-reset seam.**
`settings-refresh-bus.ts` and `assistant-dock-bus.ts` each export a `reset*Bus()` function built for
tests, and the hooks that use them (`use-settings-slice.hooks.ts`, `use-admin-assistant-switch
.hooks.ts`) already have tests that call the REAL bus directly — `publishSettingsRefresh(...)`, no
`vi.mock` anywhere. This pattern's justification is "testable without a provider tree or module
mocking" — that's already true here, via a different, purpose-built mechanism. Wrapping a port around
a bus that already has this is motion without benefit, and for a hook with a documented history of
subtle race-condition bugs (see `use-settings-slice.hooks.ts`'s own `@complexityExemption` comment),
it's motion with real downside for nothing measurable in return.

Corollary: if a hook reaches ONLY a bus like this, once the bus is excluded there may be no
host/service dependency left in the file at all — it belongs in the "no dependency to inject" bucket,
not a conversion target, even though a naive grep for "reaches something that isn't `api`" would flag
it (`use-admin-assistant-switch.hooks.ts` is exactly this case).

**3. The hook IS a terminal reach-point, not a caller of one.**
`useAdminLocale()` is the thing every OTHER hook in this audit is told to inject (`locale: string`,
resolved once inside `useWiredX`, never a hook reference). It plays the same role `lib/api.ts`'s `api`
plays: something things get injected INSTEAD OF, not something that itself needs a port one layer
further down. A hook is a candidate for conversion because it reaches a leaf; it is the leaf here.

**Narrow to the actual pain point when a file reaches several things.** `use-admin-execution-
credential.hooks.ts` reaches `lib/execution-settings` (which reaches `api` — the real pain, proven by
its test file's `vi.mock("../../lib/api", ...)`), `localStorage` (jsdom already provides this for
free, existing tests use it directly, no mocking pain to close), and `settings-refresh-bus` (case 2,
above). The port that got built covers ONLY the first. Do not inject something just because it's in
the same file as something that needed it.

## The rules that make a conversion count

- **Every conversion needs a test that mocks/fakes the injected dependency.** No such test means the
  conversion delivered nothing — testability is the entire point.
- **If converting makes you edit an EXISTING assertion, stop.** Either you changed behavior (a bug) or
  the old test was asserting an implementation detail that's now exposed differently. Either way,
  report it — don't paper over it by rewriting the assertion to match.
- **Negative-verify every new test.** Temporarily point the hook back at the real import instead of
  the injected port, rerun, confirm the new test(s) actually fail. A test that stays green either way
  proves nothing. (`2ea11f4` and the 2026-08-11 follow-up session both did this per-file; it has
  caught real vacuous tests before.)
- **Existing test files get a call-site swap, not a rewrite.** `useX(...)` → `useWiredX(...)` in the
  `renderHook` call is the whole diff for pre-existing tests. New injected-dependency tests are added
  alongside, not instead of.

## The durable fix: a lint rule, not another sweep

As of this writing, 52 of the ~57 non-conforming hook files identified by the 2026-08-11 audit are
still unconverted, and the drift is CONTINUOUS — every feature hook written since the convention
existed (2026-07-31) has still reached for `api`/`useAdminLocale` directly except the four that
predate this document. A cleanup pass alone will always be behind the next feature branch.

`eslint.config.mjs` (~lines 50–135) already has the exact shape of rule needed, enforcing a similar
boundary for `@tanstack/react-query` via `no-restricted-imports` + `no-restricted-syntax`, with a
single-file exemption for the one place allowed to import it. The equivalent for this convention:

```js
{
  files: ['apps/admin/src/**/*.hooks.{ts,tsx}'],
  ignores: ['apps/admin/src/**/*-dependencies.hooks.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['**/lib/api'], importNames: ['api'], message: 'Inject an XPort instead — see wired-hooks-convention.md.' },
        { group: ['**/use-admin-locale.hooks'], importNames: ['useAdminLocale'], message: 'Inject a resolved locale string instead — see wired-hooks-convention.md.' },
        { group: ['**/lib/router'], importNames: ['navigate'], message: 'Inject navigate instead — see wired-hooks-convention.md.' },
      ],
    }],
  },
},
```

Use `patterns`/`group` (suffix match), not `paths` (exact specifier match) — this codebase imports
`lib/api` at three different relative depths depending on nesting, and `paths` would silently miss two
of them. Test against a hook at each nesting depth before relying on it.

This has not been landed yet — it's a repo-wide policy change, bigger blast radius than converting
individual hooks, and needs its own verification pass. Recommended: **adopt it as the conversion sweep
progresses, not after the sweep finishes.** Every hook converted before the rule lands is a hook that
won't regress once the file it's in is touched again; waiting until "the sweep is done" means the rule
lands against a codebase where non-conforming files are still the majority, and every one of them
trips the new error on unrelated changes.
