/**
 * @file One shared composer for the deps bag every widgets write-path function needs
 * (`write-service.ts`/`embed-service.ts`/`region-area-service.ts`).
 *
 * Replaces what used to be ~11 independently hand-built copies of this same object: 9 admin HTTP
 * routes under `server/routes/admin/widgets/` plus two separately-written, identically-named
 * `widgetsDeps()` helpers (`tool-registrations.ts`'s AI-tool surface and this same directory's own
 * `agent-tools.ts` AI-gateway surface) — see `ADS-memory/.local-artifacts/agent-reports/
 * 20260803-jini-outbox-contract.md` and `20260803-widget-delete-outbox-bug.md` for why that mattered:
 * every one of those ~11 call sites independently forgot to bridge the raw infra `outbox` port into
 * the narrower one `createEntry`/`updateEntry` declare locally (`features/entries/write-service.ts`'s
 * own header documents that bridge, `toEntryOutbox`), so every widget create/update/trash/purge threw
 * `NOT NULL constraint failed: outbox_events.id` against the real SQLite outbox — invisible against
 * the in-memory test double, which silently accepts any shape. `entries`/`content-types`/`taxonomy`
 * each compose their own deps bag in exactly ONE place; widgets never had for its own reason. This
 * file is that one place. One composer means a future fix (or a future new dependency this bag
 * needs) lands once, not on however many call sites happen to exist that day.
 *
 * Deliberately does NOT wrap `outbox` — it stays the raw, full-`DomainEvent` port here, exactly as
 * received from the route/tool layer. Bridging happens inside each domain function, at its own
 * chokepoint call (`toEntryOutbox` for `createEntry`/`updateEntry`, `toContentTypeOutbox` for
 * `registerContentType` via `entry-payload.ts`'s content-type seeding) — a single widgets function
 * can reach more than one chokepoint needing a DIFFERENT bridge (`createWidgetInstance` calls
 * `createEntry` directly AND, via `ensureWidgetContentTypesRegistered`, `registerContentType`), so
 * pre-wrapping here would either pick the wrong bridge for one of them or require this composer to
 * know about call sites it has no business knowing about.
 *
 * Declared structurally (matching the discipline `tool-registrations.ts` already established for its
 * now-retired local `WidgetsToolDeps`) rather than importing `server/routes/types`'s `RouteDeps` —
 * keeps this module free of a back-edge into the composition root. `RouteDeps` already carries every
 * field this shape needs, so every existing caller passes its own deps object straight through
 * unchanged.
 */
import type { EntryRefsRepoPort } from "../core/entry-refs/ports";
import type { AuthorizeFn, OutboxPort } from "@jini-ai/cms/core";
import type { ContentTypeRepoPort } from "../features/content-types/write-service";
import type { EntryListPort, EntryRepoPort } from "../features/entries";
import type { WidgetRegionBindingRepoPort } from "./ports";

/** The exact slice of a route/tool layer's own deps bag this domain's write-path needs. */
export interface WidgetsRouteDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  clock: { nowIso(): string };
  idGen: { newId(): string };
  outbox: OutboxPort;
  entryRepo: EntryRepoPort & EntryListPort;
  contentTypeRepo: ContentTypeRepoPort;
  entryRefsRepo: EntryRefsRepoPort;
  widgetBindingRepo: WidgetRegionBindingRepoPort;
}

/** Shared dependency bag for `write-service.ts`/`embed-service.ts` calls — every one of them takes this identical shape. */
export function buildWidgetsDeps(routeDeps: WidgetsRouteDeps) {
  return {
    entryRepo: routeDeps.entryRepo,
    contentTypeRepo: routeDeps.contentTypeRepo,
    entryRefsRepo: routeDeps.entryRefsRepo,
    clock: routeDeps.clock,
    ids: routeDeps.idGen,
    authorize: routeDeps.authorize,
    outbox: routeDeps.outbox,
  };
}

/** `region-area-service.ts` calls additionally need `bindingRepo` — same base shape, one extra field. */
export function buildWidgetsRegionDeps(routeDeps: WidgetsRouteDeps) {
  return { ...buildWidgetsDeps(routeDeps), bindingRepo: routeDeps.widgetBindingRepo };
}
