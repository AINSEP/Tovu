## Recommendation

Choose **C: a narrow UI exception, injected native effects, and optional runtime adapters**. Permit React entry points to import `@jini-ai/ui-kit/react`. Keep native filesystem, locking and process operations behind host-supplied ports. Ship their ready-made implementations through optional runtime adapters. Keep domain-to-domain imports forbidden. This deliberately amends owner rule 1 for the shared UI facade. It preserves the rules against umbrellas, containers and server assumptions. If forced to choose only A or B, choose **B with these restrictions**.

## Why

- **A treats two different dependencies alike.** `ui-kit` already provides host-swappable components through `KitProvider`. Injecting another facade around it adds contracts and wiring around an existing injection boundary. Native process execution selects a runtime and grants capabilities. That deserves an explicit boundary.

- **The original UI merge recommendation was wrong.** Keep `ui-kit` separate from `ui`. Its shared context, controls and overlay behavior are useful foundations. The larger `ui` package contains feature implementations and substantial external dependencies. It should remain optional.

- **“Foundation” does not mean “currently stable.”** I checked non-merge commits reachable from `85377c74e`, since October 1:

  | Candidate | Source-changing commits | Relevant changes |
  |---|---:|---|
  | `ui-kit` production source, excluding tests | 21 | Privacy, agent handles, fallback state and import-cycle fixes |
  | `file-lock.ts` plus `boot-identity.ts` | 12 | Live-owner protection, hostname handling and stale recovery |
  | `atomic-write.ts` | 5 | Permissions and Windows directory synchronization |
  | `process.ts` | 5 | Process sampling and platform-specific behavior |

  Seven commits touched the selected public UI contract files. Churn does not prove API incompatibility. It does mean these are young foundations whose behavior is still settling.

- **The native candidates are explicitly Node implementations.** `file-lock.ts:15–19` imports Node filesystem, crypto, OS and path APIs. `process.ts:13–15` imports child processes and timers. Their exported types also contain Node-specific shapes. A portable domain should consume a capability contract, not inherit those assumptions.

- **A subpath does not isolate installation dependencies.** Today `platform` declares `undici` and several HTML/Markdown parser peers. Importing only `platform/fs/file-lock` can reduce executable bundle reachability. It does not change that package’s manifest. npm installs ordinary peers by default; optional peers have different installation behavior. [npm documentation](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#peerdependencies)

- **Neither A nor B automatically produces small bundles.** Injection helps only when portable entry points have clean import closures. Broad barrels, native defaults and eager renderer registries can defeat that. The checker must inspect reachable modules and shipped artifacts.

- **Useful prior art combines explicit adapters with selected direct dependencies.** Hono has an explicit Node adapter. Drizzle accepts an existing database driver. SvelteKit selects deployment adapters. TanStack’s React Query package directly depends on Query Core. These support deliberate dependency direction and replaceable environments. They do not support a universal ban on sibling imports. [Hono](https://hono.dev/docs/getting-started/nodejs), [Drizzle](https://orm.drizzle.team/docs/get-started-postgresql), [SvelteKit](https://svelte.dev/docs/kit/adapters), [TanStack manifest](https://github.com/TanStack/query/blob/main/packages/react-query/package.json)

- **Copy the construction principle from Effect, without adopting its machinery.** Effect separates service interfaces from their construction dependencies. Jini can do that with ordinary typed factory arguments. No service locator is required. [Effect layers](https://effect.website/docs/v3/requirements-management/layers)

- **Strict imports do not eliminate release coordination.** Ports are public APIs too. Adding a required operation breaks consumers. Moving every contract into core can concentrate coordination there. Backstage’s explicit package-skew policy illustrates the ongoing cost of a large plugin ecosystem. Jini should publish compatibility information while keeping most packages independently releasable. [Backstage versioning policy](https://backstage.io/docs/overview/versioning-policy/)

## What a consumer writes

These are **proposed API sketches**, not existing runnable signatures. They show the same slice: a local agent backend and a React chat client.

Stores, authorization, renderer implementations and the host’s generic server adapter are supplied separately. The host chooses them under every option.

**A. Strict injection**

```ts
// backend.ts
import { nodeFiles, nodeProcesses } from '@jini-ai/node';
import { createRuntime } from '@jini-ai/agent-runtime';
import { createDaemon } from '@jini-ai/daemon';

const files = nodeFiles({ root });
const processes = nodeProcesses({ allowedCommands });
const runtime = createRuntime({ files, processes, catalog });
const daemon = createDaemon({
  execution: runtime.execution,
  eventLog,
  authorize,
  files,
  processes,
});
server.mount(daemon.routes());
```

```tsx
// chat-view.tsx
import { createChatView } from '@jini-ai/chat/react';
import {
  Button, TextField, useOverlayContainer,
} from '@jini-ai/ui-kit/react';

const Chat = createChatView({
  controls: { Button, TextField, useOverlayContainer },
  renderers,
  translate,
});

export const view = <Chat transport={transport} />;
```

The real control port would include the other controls and hooks chat needs.

A can use ready-made runtime adapters. It does **not** require the host to reconstruct filesystem implementations.

**B. Allow-listed foundations and native defaults**

```ts
// backend.ts — these factories select Node implementations internally
import { createRuntime } from '@jini-ai/agent-runtime';
import { createDaemon } from '@jini-ai/daemon';

const runtime = createRuntime({ catalog });
const daemon = createDaemon({
  execution: runtime.execution,
  eventLog,
  authorize,
});
server.mount(daemon.routes());
```

```tsx
// chat-view.tsx — ChatPane imports the shared UI facade
import { KitProvider } from '@jini-ai/ui-kit/react';
import { ChatPane } from '@jini-ai/chat/react';

export const view = (
  <KitProvider kit={kit}>
    <ChatPane transport={transport} renderers={renderers} />
  </KitProvider>
);
```

This is convenient on Node. Portable entry points would still need separation from those native defaults.

**C. My recommendation**

Use **A’s backend code** and **B’s UI code**.

The host explicitly chooses native capabilities. React views share one established component facade. Rich renderers remain injected.

For this bounded slice, budget approximately:

| Option | Glue, including imports and lifecycle wiring |
|---|---:|
| A | 45–80 lines |
| B | 25–45 lines |
| C | 35–60 lines |

These are design estimates, not measurements. Store implementations and application policy are excluded equally. A and C have essentially identical backend wiring.

**Runtime adapter packages**

Ship them when there is a real consumer:

- `@jini-ai/node` implements filesystem, locking and process capabilities.
- `@jini-ai/workers` implements supported Worker capabilities and accepts explicit platform bindings.
- Browser clients import chat transport and UI code without installing native adapters.
- Electron uses native adapters in its main process and browser-safe entries in its renderer.

These packages must import only core and declared external dependencies. They must not construct daemon, chat, storage or authentication services. A wrapper that merely imports the existing broad `platform` package would preserve its installation baggage.

That does **not** conflict with the no-umbrella rule. A runtime adapter implements capabilities. An umbrella chooses and assembles application services.

Workers must not receive pretend filesystem locks or subprocess implementations. Unsupported execution requires a remote executor or a different execution capability.

For discoverability, publish small, maintained composition examples for Node, Workers and browser clients. They provide batteries without becoming runtime dependencies.

## Rules to enforce

1. **Domain packages import only core.** Add one explicit exception for approved React entry points importing `ui-kit/react`. Record source entry point and destination subpath. Avoid package-wide wildcards.

2. **Keep foundations small.** `ui-kit` may depend on core and declared React peers. It must not import domain engines. Do not move interpreters, domain screens or arbitrary query services into it to erase pair counts.

3. **Inject native effects into portable code.** Runtime adapters implement small capability interfaces. Avoid ports that mirror hundreds of Node APIs or one enormous `Platform` interface.

4. **Check transitive runtime closure.** Browser and Worker entries must not reach Node built-ins, native drivers or desktop modules. Also check emitted declarations for runtime-specific types.

5. **Check the entire shipped surface.** Include re-exports, relative sibling paths, dynamic imports, `.mjs`, JSDoc types, generated declarations and bundled plugin artifacts. Require an acyclic package graph.

6. **Declare every dependency.** Use ordinary dependencies for implementations. Use required peers where shared host identity matters, particularly React and the UI facade. Do not turn every injected collaborator into a peer dependency. Do not use optional-peer lazy loading.

7. **Protect identity and lifecycle.** Share explicit instances where required. Define who closes resources. Preserve lock ownership, cancellation, transaction and overlay behavior. Structural compatibility alone does not prove those semantics.

8. **Keep core disciplined.** Shared contracts and approved pure helpers belong there. Shared state, native defaults, vendor implementations and cross-domain assembly do not.

Under C, all remaining domain and native crossings disappear. A small declared set of UI-facade crossings remains.

## Cost to get there from today

Proceed with the review’s phases 0–3. They address the valuable cleanup under every option. Its estimate is **10–16k touched lines** for roughly 60 pairs. I read both plans; I did not independently validate their implementation-size estimates.

Then classify the remaining pairs individually:

- Retain approved React-to-`ui-kit` edges.
- Inject `chat → ui`, `ui → agentic`, and `user-management → admin` collaborators. These are not foundations.
- Inject filesystem, lock and process capabilities. Reuse the existing implementations.
- Extract a narrow runtime package only where it improves installation isolation.

The review estimates another **10–17k lines for A** or **2–4k for B**. For C, use **5–9k additional touched lines** as an initial planning allowance. The main uncertainty is the UI renderer boundary and native capability shape.

Stage additive APIs first. Ship required-port changes and removed exports in a coordinated breaking release. After migration, release packages independently against documented contract ranges.

## Risks

- **UI version skew remains possible.** The existing shared-context mechanism helps identity. It does not prove behavioral compatibility. Test supported facade versions together.
- **Port proliferation can recreate A’s cost.** Prefer a few cohesive capability objects. Keep construction requirements out of ordinary business methods.
- **Broad B can become a permanent escape hatch.** “Foundation” must describe a checked dependency and runtime boundary.
- **Runtime adapters can become umbrellas gradually.** Reject factories that silently select databases, authorization, servers or domain packages.
- **Portability remains work.** Removing sibling imports will not remove direct Node APIs already inside domains.
- **Contract changes still need coordination.** Maintain compatibility fixtures and packed-consumer checks. Avoid requiring all 39 packages to share one version indefinitely.

This consultation was read-only at Jini `85377c74e`. No edits, builds, installs or tests were performed.