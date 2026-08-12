import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { describeApiError, type AdminTaxonomy, type AdminTaxonomyWithTerms, type AdminTerm } from "../../../lib/api";
import { describeDeleteBlocked, findSelectedTerm, type DeleteBlockedState } from "../rules";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { TAXONOMY_DICT, t as translate } from "../taxonomy-i18n";
import { defaultTaxonomyPort } from "./taxonomy-dependencies.hooks";
import type { TaxonomyPort } from "./taxonomy-port.hooks";

/**
 * @file Everything the top-level `Taxonomy` screen does, so `Taxonomy.tsx` is only markup.
 *
 * Extracted verbatim — same state, same effect, same error string. `selected`'s `useMemo` body
 * moved to `rules.ts`'s `findSelectedTerm` (Pattern 2: a `useMemo` body that is a pure function of
 * its inputs); the `useMemo` wrapper itself stays here since memoization is a hook concern, not a
 * rule of the domain.
 *
 * `formOpen`/`setFormOpen` (web-design pass, 2026-08-05): the "New taxonomy" form used to render
 * permanently open above the list — a heavy bordered `.notice` box competing with the list for
 * attention on every load, unlike every sibling list screen (`Integrations.tsx`, `Roles.tsx`),
 * which collapse their own create form behind a `.page-actions` header toggle and default to
 * closed. Mirrors `useIntegrations`'s own `formOpen` shape exactly (same default `false`, same
 * `boolean | ((prev) => boolean)` setter signature) so `Taxonomy.tsx`'s header button can reuse
 * that idiom verbatim.
 *
 * Delete term/taxonomy (web-design pass, 2026-08-05, backend contract from `taxonomy-delete-api`
 * dispatch): mirrors `useMenus`'s `pendingForceDelete`/`forceDeleting`/`confirmForceDelete` shape —
 * same "hold the pending row, a busy flag, and a confirm function" triangle — with one addition
 * neither `useMenus` nor any other screen's delete needs: a *blocked* outcome. The route can refuse
 * with a 409 (content still assigned, or a term still has children) instead of succeeding or
 * hard-failing, and that refusal is not an error to bury in the generic `error` banner — it is
 * expected, recoverable, and names its own remedy (`rules.ts`'s `describeDeleteBlocked`). Kept as
 * its own `{ termId, state } | null` (not folded into `error`) so `Taxonomy.tsx` can show it scoped
 * to the specific row it's about, the same way `Comments.tsx`'s per-row `rs.error` does, rather than
 * a page-level banner that doesn't say which of several terms it's talking about.
 *
 * `port` is injected — see `taxonomy-port.hooks.ts` (shared with `use-term-detail-panel.hooks.ts`,
 * since both read/write the same taxonomy/term resource) — rather than importing `lib/api`
 * directly, so a test can describe load/delete outcomes against `createFakeTaxonomyPort` instead
 * of stubbing global `fetch`. `useWiredTaxonomy` below is the zero-argument pair `Taxonomy.tsx`
 * actually mounts.
 *
 * `t` (standing i18n rule, 2026-08-11 — a component with a hook gets a BOUND `t` from that hook,
 * not its own `useAdminLocale()`/dictionary import, same shape `use-pages.hooks.ts` established) is
 * now ALSO a third positional argument, alongside the existing `port`/`locale` pair — kept
 * positional rather than folded into an object to match this hook's own existing call shape rather
 * than inventing a second one. `taxonomy-i18n.ts`'s own `t(locale, key)` — aliased `translate` here
 * to avoid colliding with the new bound `(key) => string` argument of the same name — stays a
 * direct import for this hook's OWN error strings: a pure lookup that already takes `locale`
 * explicitly, not a host reach.
 */

export interface TaxonomyController {
  taxonomies: AdminTaxonomyWithTerms[] | null;
  error: string | null;
  selectedTermId: string | null;
  setSelectedTermId: (termId: string | null) => void;
  selected: ReturnType<typeof findSelectedTerm>;
  load: () => void;
  formOpen: boolean;
  setFormOpen: (open: boolean | ((prev: boolean) => boolean)) => void;

  /** The term a "Delete term" click is asking to confirm — `null` when that dialog is closed.
   *  `ConfirmDialog` stays mounted unconditionally in the view (see its own doc comment); this
   *  drives its `open` prop. Also clears `deleteTermBlocked` (see below) whenever it's called, so a
   *  stale blocked reason from a previous term's attempt never bleeds into the next one's dialog. */
  pendingDeleteTerm: AdminTerm | null;
  requestDeleteTerm: (term: AdminTerm | null) => void;
  deleteTermBusy: boolean;
  /** Set when the delete route refused this term with a 409 — cleared on the next
   *  `requestDeleteTerm` call or the next successful `load()`. Scoped to the specific `termId` that
   *  was refused so `Taxonomy.tsx` can render it against that row rather than a page-level banner. */
  deleteTermBlocked: { termId: string; state: DeleteBlockedState } | null;
  confirmDeleteTerm: () => Promise<void>;

  /** Same triangle as `pendingDeleteTerm`/`deleteTermBusy`/`deleteTermBlocked`, for "Delete
   *  taxonomy" instead of "Delete term". */
  pendingDeleteTaxonomy: AdminTaxonomy | null;
  requestDeleteTaxonomy: (taxonomy: AdminTaxonomy | null) => void;
  deleteTaxonomyBusy: boolean;
  deleteTaxonomyBlocked: { taxonomyId: string; state: DeleteBlockedState } | null;
  confirmDeleteTaxonomy: () => Promise<void>;
  /** Bound translator — `Taxonomy.tsx`'s only source of UI copy; see this file's own header. */
  t: (key: string) => string;
}

/** The shape `confirmDeleteTerm`/`confirmDeleteTaxonomy` both repeat: guard on nothing pending, set
 *  a busy flag, delete, and on failure split a 409 "blocked" refusal (its own recoverable state,
 *  see the controller doc comment) from a hard error — the "whole-hook" complexity view (brief §2)
 *  counts both ~20-line blocks against `useTaxonomy` even though each is individually small under
 *  ESLint's own per-function view. `onSuccess` carries the one thing that genuinely differs beyond
 *  which id/state pair is involved: term-delete clears `selectedTermId` when the deleted term WAS
 *  selected, taxonomy-delete clears it when the selected term belonged to the deleted taxonomy. */
async function runGuardedDelete(
  id: string,
  deleteCall: (id: string) => Promise<unknown>,
  setBusy: Dispatch<SetStateAction<boolean>>,
  clearPending: () => void,
  onSuccess: () => void,
  onBlocked: (blocked: DeleteBlockedState) => void,
  setError: Dispatch<SetStateAction<string | null>>,
  load: () => void,
  failureFallback: string,
): Promise<void> {
  setBusy(true);
  try {
    await deleteCall(id);
    clearPending();
    onSuccess();
    load();
  } catch (e) {
    clearPending();
    const blocked = describeDeleteBlocked(e);
    if (blocked) {
      onBlocked(blocked);
    } else {
      setError(describeApiError(e, failureFallback));
    }
  } finally {
    setBusy(false);
  }
}

export function useTaxonomy(port: TaxonomyPort, locale: string, t: (key: string) => string): TaxonomyController {
  const [taxonomies, setTaxonomies] = useState<AdminTaxonomyWithTerms[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTermId, setSelectedTermId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const [pendingDeleteTerm, setPendingDeleteTermState] = useState<AdminTerm | null>(null);
  const [deleteTermBusy, setDeleteTermBusy] = useState(false);
  const [deleteTermBlocked, setDeleteTermBlocked] = useState<{ termId: string; state: DeleteBlockedState } | null>(
    null
  );

  const [pendingDeleteTaxonomy, setPendingDeleteTaxonomyState] = useState<AdminTaxonomy | null>(null);
  const [deleteTaxonomyBusy, setDeleteTaxonomyBusy] = useState(false);
  const [deleteTaxonomyBlocked, setDeleteTaxonomyBlocked] = useState<{
    taxonomyId: string;
    state: DeleteBlockedState;
  } | null>(null);

  function load() {
    port
      .listTaxonomies()
      .then((r) => setTaxonomies(r.items))
      .catch((e) => setError(describeApiError(e, translate(locale, "failed to load taxonomies"))));
  }

  useEffect(load, [port]);

  const selected = useMemo(() => findSelectedTerm(taxonomies, selectedTermId), [taxonomies, selectedTermId]);

  function requestDeleteTerm(term: AdminTerm | null) {
    setPendingDeleteTermState(term);
    setDeleteTermBlocked(null);
  }

  async function confirmDeleteTerm() {
    // Matches `confirmDeleteTaxonomy`'s guard below. This read `if (false) return;` from 87e07f6
    // until 2026-08-06 — a neutered guard that let the `as AdminTerm` cast below dereference
    // `null`, so calling this with nothing pending threw `Cannot read properties of null
    // (reading 'id')` instead of no-op'ing. The existing "is a no-op when nothing is pending"
    // test caught it and had been failing on main since. Narrowing here also removes the need
    // for the cast, so the same class of bug cannot be reintroduced silently.
    if (!pendingDeleteTerm) return;
    const term = pendingDeleteTerm;
    await runGuardedDelete(
      term.id,
      port.deleteTerm,
      setDeleteTermBusy,
      () => setPendingDeleteTermState(null),
      // A deleted term can no longer own the detail panel it might currently be selected into.
      () => {
        if (selectedTermId === term.id) setSelectedTermId(null);
      },
      (blocked) => setDeleteTermBlocked({ termId: term.id, state: blocked }),
      setError,
      load,
      translate(locale, "Failed to delete term"),
    );
  }

  function requestDeleteTaxonomy(taxonomy: AdminTaxonomy | null) {
    setPendingDeleteTaxonomyState(taxonomy);
    setDeleteTaxonomyBlocked(null);
  }

  async function confirmDeleteTaxonomy() {
    if (!pendingDeleteTaxonomy) return;
    const taxonomy = pendingDeleteTaxonomy;
    await runGuardedDelete(
      taxonomy.id,
      port.deleteTaxonomy,
      setDeleteTaxonomyBusy,
      () => setPendingDeleteTaxonomyState(null),
      // A deleted taxonomy takes every one of its terms with it (the route's own cascade) —
      // whatever was selected can't still exist if it belonged to this taxonomy.
      () => {
        if (selected?.taxonomy.taxonomy.id === taxonomy.id) setSelectedTermId(null);
      },
      (blocked) => setDeleteTaxonomyBlocked({ taxonomyId: taxonomy.id, state: blocked }),
      setError,
      load,
      translate(locale, "Failed to delete taxonomy"),
    );
  }

  return {
    taxonomies,
    error,
    selectedTermId,
    setSelectedTermId,
    selected,
    load,
    formOpen,
    setFormOpen,
    pendingDeleteTerm,
    requestDeleteTerm,
    deleteTermBusy,
    deleteTermBlocked,
    confirmDeleteTerm,
    pendingDeleteTaxonomy,
    requestDeleteTaxonomy,
    deleteTaxonomyBusy,
    deleteTaxonomyBlocked,
    confirmDeleteTaxonomy,
    t,
  };
}

/**
 * Binds the real `/api/.../taxonomy` client and a `TAXONOMY_DICT`-bound translator — see
 * `taxonomy-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Taxonomy.tsx`
 * composes this and a test composes {@link useTaxonomy} with `createFakeTaxonomyPort`.
 */
export function useWiredTaxonomy(): TaxonomyController {
  const locale = useAdminLocale();
  const t = (key: string): string => TAXONOMY_DICT[locale]?.[key] ?? key;
  return useTaxonomy(defaultTaxonomyPort, locale, t);
}
