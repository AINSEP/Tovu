id: DD-admin-members-1   (template T-DEDUPE, executed with T-DELETE's reduce form; written 2026-11-16 from Tovu b28d38c6 / Jini b7666092, refactor/terra; skeleton by make-sheet.py)
feature: admin/features/members   (W1 #30, level 3)
status: READY (no owner question: the Jini port and fake are exact twins; this is not the "inline the port" question Q-WH of delete-admin-analytics.md, because the Tovu port is DELETED in favour of Jini's, and the -dependencies file keeps its convention role of binding the real client)
kind: re-kinded SPLIT/DEDUPE-UNVERIFIED -> DEDUPE (one slice, Tovu-only, no Jini commit). Why: every moving declaration already exists in Jini with identical behaviour:
  - Tovu `MembersPort` (members-port.hooks.ts:13) == Jini `MembersPort` (packages/user-management/src/react/ports.ts:55, exported from `@jini-ai/user-management/react` via `export type * from './ports.js'`). Only difference: Jini `listMembers(required: Record<string, never>)` takes `{}`; Tovu's takes nothing. Tovu `AdminMember` (lib/api.ts:1501) and Jini `AdminMember` (src/admin/models.ts:60) have the same 9 fields (Jini adds `| undefined` on optionals, assignable both ways under the app tsconfig).
  - Tovu `createFakeMembersPort` (members-dependencies.hooks.ts:27) == Jini `createFakeMembersPort` (src/react/testing.ts:321, `@jini-ai/user-management/react/testing`): same store, same `members`/`magicLinkRequests` fields, same error text "fake member not found: <id>", same `status: "disabled"` update. Only difference: Jini takes `(_required, options)`, so calls become `createFakeMembersPort({}, {...})` / `createFakeMembersPort({})`. Behaviour diff: none -> no RED test.
  - `toJiniMembersPort` (members-dependencies.hooks.ts:79) only re-wraps getMember/disableMember to drop the optional second arg: with the Tovu port typed as the Jini port it is the identity. DELETE.
  STAY-WIRING: `defaultMembersPort` (the `lib/api` binding, now typed `MembersPort` from Jini), `MEMBERS_RESOURCE` (Tovu content-refresh-bus name).

guarded files (blob at b28d38c6; mismatch = SKIP):
  - apps/admin/src/features/members/hooks/members-port.hooks.ts | blob 248e329008f7cfaf413524caf4671a6e1215ec80 | delete
  - apps/admin/src/features/members/hooks/members-dependencies.hooks.ts | blob 9f1035e0b8e01cbea8d3cc8db0653e3293d675b9 | rewrite to FILE_AFTER
  - apps/admin/src/features/members/hooks/members-controller.hooks.ts | blob 6ba31a01062f0ce61e0f7bf814166b644a2fcf8a
  - apps/admin/src/features/members/MembersPanel.tsx | blob 6d2e8610fbc402e7a4be4d22cea59e9d06fc21b9
  - apps/admin/src/features/members/__tests__/Members.unit.test.tsx | blob 0f4aac6783915c535f7d4723910100ca0e2dc3cc
  - apps/admin/src/features/members/__tests__/members-dependencies.unit.test.ts | blob 204d16fba7eaab0d9fc4eba4174458beceba8cad
  - apps/admin/src/features/members/__tests__/use-members.hooks.unit.test.ts | blob 95e67f54a22c7944d591d579359a10b18f46465f
  - development/scripts/hardwiring-debt.json | text-guarded (block below must occur once)
  - Jini (read-only) packages/user-management/src/react/testing.ts: `rg -n "export function createFakeMembersPort\(_required: Record<string, never>, options: FakeMembersPortOptions = \{\}\)"` prints line 321; packages/user-management/src/react/ports.ts: `rg -n "listMembers\(required: Record<string, never>\)"` prints 1 line. Else SKIP.

census (python3 scripts/census.py <TOVU> <file>; must equal):
  members-port.hooks.ts: members-controller.hooks.ts:7, members-dependencies.hooks.ts:2 (both static "./members-port.hooks")
  members-dependencies.hooks.ts: MembersPanel.tsx:5 static; __tests__/Members.unit.test.tsx:6 static; __tests__/members-dependencies.unit.test.ts:25 dynamic; __tests__/use-members.hooks.unit.test.ts:6 static, :8 static; hooks/members-controller.hooks.ts:6 static
reach_check: rg -n --no-heading -w "toJiniMembersPort|members-port\.hooks" apps development/scripts --glob '!**/node_modules/**' -> only the lines edited below (+ members-dependencies.hooks.ts:6 header, rewritten)

edits (exact old -> new, each must occur once in the stated file):
  hooks/members-controller.hooks.ts:
    - "import { useCallback, useMemo } from \"react\";" -> "import { useCallback } from \"react\";"
    - "import { useMembers as useJiniMembers, type MembersController as JiniController, type IdentityRefreshPort } from \"@jini-ai/user-management/react\";" -> "import { useMembers as useJiniMembers, type MembersController as JiniController, type IdentityRefreshPort, type MembersPort } from \"@jini-ai/user-management/react\";"
    - "import { defaultMembersPort, MEMBERS_RESOURCE, toJiniMembersPort } from \"./members-dependencies.hooks\";" -> "import { defaultMembersPort, MEMBERS_RESOURCE } from \"./members-dependencies.hooks\";"
    - delete line "import type { MembersPort } from \"./members-port.hooks\";"
    - delete line "  const jiniPort = useMemo(() => toJiniMembersPort({ port }), [port]);"
    - "useJiniMembers({ port: jiniPort, translate, queryScope: WORKSPACE_ID }, { refresh })" -> "useJiniMembers({ port, translate, queryScope: WORKSPACE_ID }, { refresh })"
  MembersPanel.tsx:
    - "import { defaultMembersPort, toJiniMembersPort } from \"./hooks/members-dependencies.hooks\";" -> "import { defaultMembersPort } from \"./hooks/members-dependencies.hooks\";"
    - "const port = toJiniMembersPort({ port: defaultMembersPort });" -> "const port = defaultMembersPort;"
  __tests__/Members.unit.test.tsx:
    - "import { createFakeMembersPort } from \"../hooks/members-dependencies.hooks\";" -> "import { createFakeMembersPort } from \"@jini-ai/user-management/react/testing\";"
    - "createFakeMembersPort({ members: [ACTIVE_MEMBER, otherMember] })" -> "createFakeMembersPort({}, { members: [ACTIVE_MEMBER, otherMember] })"
    - "return jsonResponse(await port.listMembers());" -> "return jsonResponse(await port.listMembers({}));"
  __tests__/use-members.hooks.unit.test.ts:
    - "import { createFakeMembersPort } from \"../hooks/members-dependencies.hooks\";" -> "import { createFakeMembersPort } from \"@jini-ai/user-management/react/testing\";"
    - replace ALL 8 occurrences of "createFakeMembersPort({ " with "createFakeMembersPort({}, { " (count before must be 8, after 0 of the old text)
  __tests__/members-dependencies.unit.test.ts:
    - "const { createFakeMembersPort, defaultMembersPort } = await import(\"../hooks/members-dependencies.hooks\");" -> "const { defaultMembersPort } = await import(\"../hooks/members-dependencies.hooks\");"
    - "import type { AdminMember } from \"@/lib/api\";" -> "import type { AdminMember } from \"@/lib/api\";\nimport { createFakeMembersPort } from \"@jini-ai/user-management/react/testing\";"
    - replace ALL 5 occurrences of "createFakeMembersPort({ " with "createFakeMembersPort({}, { "; ALL 3 occurrences of "createFakeMembersPort()" with "createFakeMembersPort({})"; ALL 3 occurrences of ".listMembers()" with ".listMembers({})" (counts before must be exactly 5 / 3 / 3)
    - comment line 7: "and `createFakeMembersPort`'s stateful" -> "and the shared `createFakeMembersPort` (`@jini-ai/user-management/react/testing`) stateful"  (if the sentence then reads oddly, leave the rest of the header unchanged; do not rewrite other lines)
    No assertion line changes besides those call-shape edits (COMMON rule 20).
  development/scripts/hardwiring-debt.json: remove exactly this object (and the comma that precedes it, so the JSON stays valid):
      {
        "rule": "HW5-jini-export",
        "file": "apps/admin/src/features/members/hooks/members-dependencies.hooks.ts",
        "line": 27,
        "reason": "Export createFakeMembersPort duplicates a Jini function without using its owner.",
        "fingerprint": "8528b17a15d6bc68fd45b35701e10d60f0710ae76dfa404e19235e26a044e87d"
      },
    i.e. delete the 7 lines from the "{" before `"rule": "HW5-jini-export",` whose next line names members-dependencies.hooks.ts through the "}," after its fingerprint. Then `node -e 'JSON.parse(require("fs").readFileSync("development/scripts/hardwiring-debt.json","utf8"))'`.

git rm -q apps/admin/src/features/members/hooks/members-port.hooks.ts

FILE_AFTER (whole new apps/admin/src/features/members/hooks/members-dependencies.hooks.ts, ending with one newline):
```ts
import type { MembersPort } from "@jini-ai/user-management/react";
import { api } from "@/lib/api";

/**
 * @file The only place under `features/members` that reaches `lib/api`. The port it binds and the
 * in-memory fake tests use both live in `@jini-ai/user-management` (`/react` and `/react/testing`);
 * Tovu keeps only this binding to its HTTP client and the content-refresh resource name.
 */

/** The live implementation, as a module-level singleton — matches `integrations/jini-admin/redirects-ports.ts`'s `redirectsHostPorts`. */
export const defaultMembersPort: MembersPort = {
  listMembers: (_required = {}) => api.listMembers(),
  getMember: ({ id }) => api.getMember({ id }),
  disableMember: ({ id }) => api.disableMember({ id }),
  requestMemberMagicLink: (input) => api.requestMemberMagicLink(input),
};

/** This screen's name on `lib/content-refresh-bus.ts` — see `taxonomy/rules.ts`'s
 *  `TAXONOMY_RESOURCE` for why this is a plain colocated constant rather than a shared registry.
 *  Agent-writable via `members_disable` (`apps/website/src/features/members/agent-tools.ts`), which
 *  flips a member's status this list renders. `members_request_magic_link` mutates durable state too
 *  but changes nothing this screen displays, so it needs no separate justification here. */
export const MEMBERS_RESOURCE = "members";
```
why_moves: members-port.hooks.ts header (the "describeApiError is deliberately NOT part of this port" carve-out) is already the shape of Jini `describeMembersError`; it is a pointer, dropped. Say so in the commit body.
baselines: development/scripts/hardwiring-debt.json (above). No other json/mjs/yml hit.
untangle_overlap: none
jini_commit: -
tovu_msg: "refactor(admin-members): use the shared MembersPort and fake from @jini-ai/user-management" | body: "Tovu keeps the lib/api binding and MEMBERS_RESOURCE; toJiniMembersPort was an identity adapter."
Order: guards; census; edits; FILE_AFTER; git rm; reach_check; eslint the 6 .ts/.tsx; JSON check; one Tovu commit (8 paths incl. the deleted one and hardwiring-debt.json).
STOP extra: eslint/types flag `MembersPort` not exported from `@jini-ai/user-management/react` -> SKIP (do not import from a deep path).
Cloud run owes: the 3 members test files + rules.unit.test.ts, Tovu typecheck, `pnpm` hardwiring gate (debt row removed). No RED test.
est. executor tokens: ~45k Sonnet.
