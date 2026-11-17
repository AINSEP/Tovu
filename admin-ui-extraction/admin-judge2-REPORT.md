# admin-judge2 report: second judge pass on J1, J2, T1b (2026-11-17)

Plan only: no product code was edited. Facts read and commands run on Tovu `refactor/terra` @ `232764af5` and Jini
`refactor/terra` @ `65d73b0d5` (Node 24.22.3; Jini `pnpm install --frozen-lockfile` + `pnpm --no-bail -r build` exit 0;
Tovu `npm ci`, `npm --prefix apps/admin ci`, `link:jini` with `JINI_PACKAGES_DIR`). No browser was used.
Branch: `plan/admin-ui-extraction-2026-11-16` (Tovu remote). Commits are listed at the end.

## Verdicts
| Sheet | Verdict | One line |
|---|---|---|
| J1 | **READY-WITH-NOTE** | The revision-3 routable fix (`resolvePanels` with `permissions: ['*']`, real permissions through `isPanelAccessible`) is correct for every panel kind and every user (matrix below). Notes now in the sheet: two existing assertions change by the owner-approved D-11 (named), `model.panels` = visible set, agent page id of a denied route kept (T14), T9 needs the package self-reference (minimal-host lacks admin), exact STOP command, limits budget (`AdminShell` already at complexity 9/10). |
| J2 | **READY-WITH-NOTE** | Does not break any current screen if step 5 is held back: steps 1-4 are additive with "absent slot = today's markup" snapshots and no consumer exists. Judge 2 added the seams T1b proved it needs (host-owned session source, `ids`, `afterMain`, `assistantAside`, icon parity), the 4 hook-debt keys to retire, the real stylesheet for step 5 (`packages/ui/src/styles/admin.css:294-295`, not the token-only theme file) and a merge rule: step 5 lands only together with T1b step 3. |
| T1b | **BLOCKED (owner decision AU-D15, new)** | Revision 3's mapping would have broken current screens (below). Rewritten: route-parity step 0, full mapping, S5 corrected, S12-S16 added, estimate 260k → 380k. Once AU-D15 is answered "accept": READY-WITH-NOTE (needs J1-J3 and T1a landed; Opus diff review stays mandatory). |
Also recorded in INDEX: A0 DONE, A1 PARTIAL, A2 DONE (build run `admin-a0-a1`, `wave2/admin-a` @ `2eacf8519`, not merged).
J3 and T1a were not re-judged (T1a's census ran; Tovu panels declare no all-of `permissions`, so J1 cannot move a Tovu panel).

## Is the J1 routable fix correct for every panel and every user? Yes.
Ran the built `dist/core` (`resolvePanels`, `matchRoute`, `buildNav`, `hasPermission`) with the J1 rule (a)-(e):
```
unknown  dashboard:ok+nav open:ok+nav anyof:ok+nav allof:ok+nav both:ok+nav capwired:ok+nav capmissing:- hidden:ok
none     dashboard:ok+nav open:ok+nav anyof:DENIED allof:DENIED both:DENIED capwired:DENIED capmissing:- hidden:DENIED
owner    dashboard:ok+nav open:ok+nav anyof:ok+nav allof:ok+nav both:ok+nav capwired:ok+nav capmissing:- hidden:ok
anyA     dashboard:ok+nav open:ok+nav anyof:ok+nav allof:DENIED both:DENIED capwired:DENIED capmissing:- hidden:DENIED
allL     dashboard:ok+nav open:ok+nav anyof:DENIED allof:ok+nav both:DENIED capwired:DENIED capmissing:- hidden:DENIED
halfL    dashboard:ok+nav open:ok+nav anyof:DENIED allof:DENIED both:DENIED capwired:DENIED capmissing:- hidden:DENIED
bothOk   dashboard:ok+nav open:ok+nav anyof:DENIED allof:DENIED both:ok+nav capwired:DENIED capmissing:- hidden:DENIED
bothHalf dashboard:ok+nav open:ok+nav anyof:DENIED allof:DENIED both:DENIED capwired:DENIED capmissing:- hidden:DENIED
capC     dashboard:ok+nav open:ok+nav anyof:DENIED allof:DENIED both:DENIED capwired:ok+nav capmissing:- hidden:DENIED
rev2 routable (no perms arg): dashboard,open,anyof
ALL OK
```
`-` = not routable (capability missing: falls back to the default panel for everyone, unchanged). `hidden` has no nav
entry by design. Revision 2's call reproduces the B1 bug (all-of, both, capability+all-of and hidden panels unroutable).
Script (kept here so it can be re-run against a later build):
```js
const { resolvePanels, matchRoute, buildNav, hasPermission } = await import('<Jini>/packages/admin/dist/core/index.js');
const P = [
  { id: 'dashboard', nav: { label: 'D' } },
  { id: 'open', nav: { label: 'O' } },
  { id: 'anyof', nav: { label: 'A' }, anyOfPermissions: ['a.x', 'a.y'] },
  { id: 'allof', nav: { label: 'L' }, permissions: ['l.x', 'l.y'] },
  { id: 'both', nav: { label: 'B' }, permissions: ['b.x'], anyOfPermissions: ['b.y', 'b.z'] },
  { id: 'capwired', nav: { label: 'CW' }, requires: ['w'], permissions: ['c.x'] },
  { id: 'capmissing', nav: { label: 'CM' }, requires: ['m'] },
  { id: 'hidden', permissions: ['h.x'] },
].map(p => ({ description: p.id, render: null, ...p }));
// J1 rule as specified (a)-(e)
const acc = (panel, perms) => {
  if (perms === undefined) return true;
  const any = panel.anyOfPermissions ?? [], all = panel.permissions ?? [];
  const anyOk = any.length === 0 || any.some(p => hasPermission({ permissions: perms, permission: p }));
  const allOk = all.every(p => hasPermission({ permissions: perms, permission: p }));
  return anyOk && allOk;
};
const users = { unknown: undefined, none: [], owner: ['*'], anyA: ['a.y'], allL: ['l.x', 'l.y'], halfL: ['l.x'], bothOk: ['b.x', 'b.z'], bothHalf: ['b.x'], capC: ['c.x'] };
const routable = resolvePanels({ panels: P }, { capabilities: ['w'], permissions: ['*'] });
const ids = routable.map(p => p.id);
let bad = 0;
if (JSON.stringify(ids) !== JSON.stringify(P.filter(p => p.id !== 'capmissing').map(p => p.id))) { console.log('ROUTABLE WRONG', ids); bad++; }
for (const [u, perms] of Object.entries(users)) {
  const visible = routable.filter(p => acc(p, perms));
  const nav = buildNav({ panels: visible }, { defaultPanelId: 'dashboard' }).flatMap(g => g.items.map(i => i.id));
  const row = [];
  for (const p of P) {
    const m = matchRoute({ routePath: `/${p.id}`, panels: routable });
    const routed = m.panelId ?? 'dashboard(fallback)';
    const access = m.panelId ? (acc(routable.find(x => x.id === m.panelId), perms) ? 'ok' : 'DENIED') : '-';
    // expectations
    const expRouted = p.id === 'capmissing' ? 'dashboard(fallback)' : p.id;
    const expAccess = p.id === 'capmissing' ? '-' : (acc(p, perms) ? 'ok' : 'DENIED');
    if (routed !== expRouted || access !== expAccess) { bad++; console.log('MISMATCH', u, p.id, routed, access); }
    row.push(`${p.id}:${access}${nav.includes(p.id) ? '+nav' : ''}`);
  }
  console.log(u.padEnd(8), row.join(' '));
}
// old model behaviour for contrast (revision 2: no permissions arg)
const r2 = resolvePanels({ panels: P }, { capabilities: ['w'] }).map(p => p.id);
console.log('rev2 routable (no perms arg):', r2.join(','));
console.log(bad ? `FAIL ${bad}` : 'ALL OK');
```

## Would J2 or T1b break a current screen?
- **J1:** no. Tovu does not render Jini's `AdminShell`; Tovu's `TovuAdminPanel` intersects the new optional
  `anyOfPermissions` with an identical type; Tovu panels declare no all-of `permissions` (0 hits in `panels.tsx`).
- **J2 steps 1-4:** no (additive, snapshot-pinned). **J2 step 5:** yes, if merged alone: Tovu renders Jini's `Sidebar`
  and links Jini HEAD in every lane, so renamed classes would unstyle Tovu's sidebar and break Tovu TS selectors
  (`use-cms-sidebar-label-tooltips.hooks.ts:21`, `use-sites-sidebar-nav.hooks.ts:69`) and 20 e2e files. Fixed by the
  merge rule (step 5 merges only with T1b step 3).
- **T1b (revision 3):** yes. Pinned by 26 baseline `app-*` test files (259 tests, all green at `232764af5`):
  legacy `/section/:id` (Placeholder for unknown ids, `app-route-prototype-keys`), `/assistant` alias
  (`app-assistant-alias`), moved import-export/add-ons URLs (`parseRoute` `redirectPath`), the Sites `hold`/`redirect`
  gate (`app-sites-section-visibility`), the panel render signature (`{ view, params, query, Placeholder }` vs Jini's
  render args), `KitProvider overlayContainer` and `ScrollJumpButtons` inside the main column, `#admin-sidebar`
  (4 hooks) and `#main-content` (`styles.css:247`, skip link, focus-ring test), the session source that also feeds
  `AdminBootScopeContext` above the shell (a port adapter would be a second reader: S4 fails, or a re-implementation),
  `resolveAdminLayoutClassName` duplicating `admin-layout`, the drawer hook's different field names, the backdrop
  becoming a `<button>` with a UA border. None had a row. All have one now.

## What changed (per file)
- `J-shell.md`: J1 write set (+2 test files, +public-surface test, +spec docs, +changeset), `hasPermission` diff
  result (same logic; only `readonly` differs), baseline numbers, rule signature (required `permissions` key whose
  value may be `undefined`; `(required, options = {})`), routable proof, model precisions, existing-test table, T14,
  T9 command, exact STOP command (prints nothing at `65d73b0d5`), limits budget. J2: debt keys, step 1b host-owned
  session union type, stable `translateNav`, rail-override STOP result, `id`/`label` facts, `beforeMain` position,
  `assistantAside` replaces `assistant.aside`, `afterMain`, `ids`, markup parity, step-5 write set/merge timing/ripple,
  STOP reference fixed (`App.hooks.ts:9` import, `:1087` call), G8 line fix, limits budget (`SidebarRoot` 51 lines at base).
- `T1-adopt-shell.md`: T1b rewritten (mapping 22 rows, order with step 0, S1-S16, Chrome check additions, exact
  STOP list of 31 component/function names, base limits); S5's Escape claim was wrong (the inner-layer rule is the
  chat dock's, `App.hooks.ts:793`); estimate and needs.
- `INDEX.md`: owner decisions of 2026-11-17 noted; sheet-status table; AU-D15; size rows `f/members` 218→139 (8→7 files),
  `f/users` 418→218 (8→7), `f/library` 1,067→1,066 (its drift was blobs, not lines); estimates; section 9 item 6 done.
- `COMMON-ADMIN.md`: setup needs `npm --prefix apps/admin ci` and `JINI_PACKAGES_DIR=$J/packages` for `link:jini`
  in a cloud run (both failed as written); C10 minimal-host line does not work for packages it does not declare.

## Commands run (real output, classified)
| Command | Result | Class |
|---|---|---|
| Jini `pnpm --filter @jini-ai/admin build`; `npm --prefix packages/admin run test` | ok; 213 files, 2,846 tests pass | baseline |
| Jini `pnpm guard` | ok | baseline |
| Jini `pnpm check:size` | ok (157 debt entries) | baseline |
| Jini `node scripts/check-hook-injection.mjs` | exit 1, 32 "(new)" in `packages/ui` | PRE-EXISTING (BASE-RED) |
| J1 STOP (`rg resolveAdminShellModel` filtered) | prints nothing | no STOP |
| J2 step 3 STOP (the `rg` for `railOverride` and `onRailCollapsedChange` in its fenced form) | found (`Sidebar.tsx:283,286`, `use-sidebar-rail.ts:83-86`) | no STOP |
| J2 step 1 debt one-liner | 4 `AdminShell::*` keys | to retire by hand |
| T9 self-reference import of `@jini-ai/admin/core` | ok; minimal-host: ERR_MODULE_NOT_FOUND | ENV (sheet fixed) |
| S-FN50 eslint command, Jini (`Sidebar.tsx`) and Tovu (`App.tsx`, `App.hooks.ts`) | runs; findings listed in the sheets | command valid |
| Tovu `npm run link:jini` (as written) | "Missing local Jini package(s)" | ENV (COMMON fixed) |
| Tovu `npm --prefix apps/admin run typecheck` | ok (after `apps/admin` ci) | baseline |
| Tovu admin tests: `panel-access`, `app-panel-permissions`, `app-boot-request-volume` | 3 files, 51 tests pass | baseline |
| Tovu admin tests: `src/__tests__/unit/app-*` + boot volume | 26 files, 259 tests pass | baseline |
| Tovu `check:hooks` | ok | baseline |
| Tovu `check:size`, `check:complexity`, `check:boundaries` | red on `apps/website` files (none admin) | PRE-EXISTING (BASE-RED) |
| T1a census | 1 production file + `panels.tsx` type + 1 test file + comments | input for T1a |
| T1b component list (`rg ^function` on App.tsx/App.chrome.tsx) | 25 + 6 names, all mapped now | STOP check now passes |

## Still open
1. **AU-D15** (owner): agent page id for `/section/<unknown>` after T1b. Recommendation: accept.
2. J2's new seams (1b union type, `ids`, `afterMain`, `assistantAside`) and T1b's route-parity design are judge-2
   designs that no third reviewer has read; T1b's mandatory Opus diff review covers execution, not this design.
3. J3 and T1a were not re-judged in this pass; T1b depends on both.
4. A0 captured no 1024 px, dock-open, editor or dialog pictures: the shell runs must take their own "before" set.
5. A1 is PARTIAL (row 6, Step C, Step D open); A1 row 1 shifts `App.hooks.ts` line numbers by one once merged.
6. The per-screen table's other rows and its total are still `f354cfbd` figures (only members/users/library re-measured).
7. Visual parity of T1b (backdrop reset, icon caps, `aria-label` "Admin") is a Chrome-check item; nothing was viewed here.

## Commits (plan branch, all pushed fast-forward)
- `58dc9664` plan(admin-ui) judge2: T1b limits at the base measured (renderRoute 10/9, App.hooks.ts 518); adapters go in new files
- `16774349` plan(admin-ui) judge2: link-interceptor claim corrected (no double push); limits budget for AdminShell/model/Sidebar measured and planned
- `368b256b` plan(admin-ui) judge2: INDEX sheet status (A run recorded, J1/J2 READY-WITH-NOTE, T1b BLOCKED on AU-D15), size rows refreshed; COMMON setup and C10 fixes
- `2a3754d3` plan(admin-ui) judge2: T1b mapping completed (route layer, session source, link interceptor, ids, panel adapter, class-rename ripple); S5 fixed; S12-S16 added
- `97a14efe` plan(admin-ui) judge2: J2 corrections (debt keys, host-owned session, ids, afterMain, assistantAside, class-rename write set and merge timing)
- `d9eb07d8` plan(admin-ui) judge2: J1 verified for every panel kind and user; existing tests, T9 command, STOP command fixed
- the commit adding this report (and the INDEX link to it)
