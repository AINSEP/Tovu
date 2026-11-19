import { markersOfType } from "@jini-ai/cms/widgets/markers";
import type { DiscoveredTheme } from "./theme.js";


/** The canonical filename(s) `static`-tier themes use for a reusable, content-agnostic document
 *  shell — the same role `"index"` plays for the home route in {@link renderStaticTierHomePage}, just
 *  for any OTHER route. A Tovu-owned convention, not a per-theme manifest choice (see
 *  {@link resolveStaticTierPageShellFallback}'s own doc for why that distinction matters).
 *
 *  ORDERED, new name first: bundled themes use `pages-default.html`; installed or imported legacy
 *  themes may still use `page-shell.html`. Keep this compatibility shim for their stored choices. */
const STATIC_TIER_PAGE_SHELL_IDS: readonly string[] = ["pages-default", "page-shell"];

/**
 * WIDENED 2026-09-16 to every `kind: "page"` row, not just `"html"`-format ones. The owner's words:
 * "it shouldnt need to be saved to render correctly." A Page is BORN `"doc"`-format — `createPost`
 * forces `(bodyFormat: "doc", bodyHtml: null)` by construction (`features/post/post.ts`'s
 * `resolveBodyFields`, the CIC-3 write chokepoint) for the agent tool and the admin's own "New Page"
 * button alike, and only the first save births the html row. The original `"html"` restriction was
 * therefore not a rule about document shape at all; it was an unstated assumption that every Page
 * reaching here had already been saved once. Measured on a doc-format Page before widening: the live
 * site served a 1231-byte Tovu-generic `pageShell()` with no `data-theme` and no `/theme-assets/` —
 * the EXACT symptom described below, still live for the one shape the fix did not cover.
 *
 * This cannot reopen the `terms-of-service` regression that `isEligibleForTemplateBranch`'s own gate
 * exists to prevent, and the distinction is the whole reason this function is safe to widen: that
 * regression was doc Pages landing on `theme.manifest.templates[0]` — array POSITION, which carries
 * no "this is a page shell" meaning. This function never reads manifest ordering; it looks up a
 * Tovu-owned closed vocabulary ({@link STATIC_TIER_PAGE_SHELL_IDS}) and returns `undefined` when the
 * theme ships neither name, leaving the record on the generic path exactly as before.
 *
 * The 2026-09-02 fix for a live bug: an `html`-format `kind: "page"` row with no explicit
 * `templateChoice` — the state EVERY Page starts in (neither the agent create tool nor the admin
 * Pages editor sets this column on creation; see this repo's `content_post_create` tool and
 * `PageEditor.tsx`'s picker, both of which persist `null`/`""` until an author makes an explicit
 * choice) — is correctly kept OUT of the template branch by {@link isPageTemplateChoiceEligible}. The
 * doc above that gate claims the generic (non-template) path it falls through to is Pages' "normal,
 * fully-functional, default behavior". That claim is true for the `declarative`/`templated`/
 * `handlebars` tiers, where a theme never has a real standalone document of its own — `pageShell()`
 * IS those themes' only shell, template or not. It was FALSE for `static` tier: a static theme's real
 * pages are complete documents (`<html data-theme>`, real `/theme-assets/` scripts, icons, a
 * manifest) that `pageShell()` cannot reproduce — it never sets `data-theme`, never references the
 * theme's own scripts/icons, and only inlines `theme.css`'s raw bytes into a `<style>` tag
 * (`render.ts`'s own `pageShell`). Observed live: an agent-authored Page landed on Tovu's generic
 * `siteHeader`/`siteFooter` markup with zero `/theme-assets/` references and no `data-theme`
 * attribute, instead of the active theme's real chrome.
 *
 * This function restores that claim for `static` tier by giving the generic path a document shell to
 * render into, WITHOUT guessing at the row's intended CONTENT template — the exact distinction that
 * matters against the regression `isEligibleForTemplateBranch`'s own doc records (`resolveTemplate`'s
 * "never chosen -> theme's first template" arm, safe for Posts, put `terms-of-service` et al. under a
 * Post-shaped template's chrome because array position 0 carries no "this is a generic page shell"
 * meaning). This does not read `theme.manifest.templates` or its ordering at all: it looks up one of a
 * small, ORDERED set of canonical, Tovu-owned filenames ({@link STATIC_TIER_PAGE_SHELL_IDS}, new name
 * first) — the same closed-vocabulary lookup `renderStaticTierHomePage` already performs for
 * `"index.html"` on the home route, extended to cover every other route a static theme has no
 * dedicated template for.
 *
 * Both bundled static themes ship `pages-default.html`. Installed or imported themes can still
 * use the legacy `page-shell.html`; both resolve in that order. A theme shipping neither name
 * returns `undefined`, preserving the caller's generic `pageShell()` fallback.
 *
 * That degrade stays deliberate — guessing at some other template is what put `terms-of-service`
 * under a Post-shaped template's chrome, so a miss must remain a no-op rather than a substitution. What it must not
 * remain is SILENT: the miss now emits {@link warnPageShellFallbackMissOnce}'s `[theme] …` warning
 * (this module's existing `console.warn` convention, see `renderStaticPage`), once per distinct
 * message rather than once per request, so the state is visible in the server log instead of being
 * inferable only by eyeballing a rendered page.
 *
 * Scoped to `kind: "page"` + `bodyFormat: "html"` only: `kind: "post"` and `bodyFormat: "doc"` Pages
 * already have their own, unaffected "never chosen" handling (`isPageTemplateChoiceEligible` above)
 * and must keep it — this function is never consulted for either, by construction of its own
 * `post.kind`/`post.bodyFormat` check, not by relying on the caller to gate correctly.
 *
 * @complexity O(n) in the shell template's HTML length for the one `markersOfType` slot check
 *   (identical cost shape to `resolveTemplate`'s own `resolveAgainstTheme`); O(1) otherwise.
 */
/**
 * Miss diagnostics {@link resolveStaticTierPageShellFallback} has already emitted, keyed by the exact
 * message text (which embeds the theme id and the reason), so each distinct miss is reported once per
 * process.
 *
 * De-duplicated where `renderStaticPage`'s two `[theme]` warnings are not, because the two are
 * bounded differently: those fire per page render and a theme has a fixed, small page count, while
 * this one sits on the generic-fallback path taken by EVERY request to EVERY untemplated `html` Page
 * on the site — an unbounded warn would bury its own signal within minutes of real traffic. Bounded
 * by (installed static themes x 2 reasons), so it cannot grow with traffic.
 */
const warnedPageShellFallbackMisses = new Set<string>();

/**
 * Emits a page-shell miss diagnostic at most once per distinct message.
 *
 * @param message - The full `[theme] …` warning text; doubles as the de-duplication key.
 * @returns Nothing. Side effect: one `console.warn`, only on the first call for this message.
 * @complexity O(1) — one `Set` lookup plus at most one insert.
 */
function warnPageShellFallbackMissOnce({ message }: { message: string }, _optional = {}): void {
  if (warnedPageShellFallbackMisses.has(message)) return;
  warnedPageShellFallbackMisses.add(message);
  console.warn(message);
}

/** {@link findPageShellCandidate}'s outcome — never more than one usable/slotless id at a time,
 *  since the search stops the moment a usable one is found. */
type PageShellCandidateOutcome = { kind: "usable"; id: string } | { kind: "slotless"; id: string } | { kind: "none" };

/**
 * Walks {@link STATIC_TIER_PAGE_SHELL_IDS} in order and reports the first candidate the theme both
 * SHIPS and can actually use (a real `"content"` slot). When nothing usable turns up, reports the
 * FIRST slotless candidate seen instead (so the caller's miss diagnostic can name the one this
 * function would have preferred), or `{ kind: "none" }` when the theme ships neither candidate at
 * all. Split out of {@link resolveStaticTierPageShellFallback} purely to keep that function's own
 * branch count proportional to "gate, then react to one outcome" rather than also the search's own
 * branching (complexity ceiling).
 *
 * @complexity O(n) in `STATIC_TIER_PAGE_SHELL_IDS.length` (a small, fixed constant) — at most one
 *   `markersOfType` slot check per candidate the theme actually ships.
 */
function findPageShellCandidate(theme: DiscoveredTheme): PageShellCandidateOutcome {
  let slotlessId: string | undefined;
  for (const id of STATIC_TIER_PAGE_SHELL_IDS) {
    const html = theme.pages[id];
    if (html === undefined) continue;
    if (markersOfType({ html: html, type: "content" }).length > 0) return { kind: "usable", id };
    slotlessId ??= id;
  }
  return slotlessId !== undefined ? { kind: "slotless", id: slotlessId } : { kind: "none" };
}

/** The `[theme] …` miss diagnostic for {@link resolveStaticTierPageShellFallback}'s two non-`"usable"`
 *  {@link PageShellCandidateOutcome}s — split out purely to keep that function's own branch count
 *  down; has no side effect of its own, {@link warnPageShellFallbackMissOnce} still owns emitting it. */
function pageShellMissMessage({ themeId, candidate }: { themeId: string; candidate: { kind: "slotless"; id: string } | { kind: "none" } }, _optional = {}): string {
  const candidateFilenames = STATIC_TIER_PAGE_SHELL_IDS.map((id) => `${id}.html`);
  const named =
    candidate.kind === "slotless"
      ? `a '${candidate.id}.html' with no {"type":"content"} slot`
      : `none of '${candidateFilenames.join("', '")}'`;
  return `[theme] static theme '${themeId}' ships ${named}; untemplated html Pages render in Tovu's generic chrome instead of this theme's own document`;
}

export function resolveStaticTierPageShellFallback(
  required: {
    theme: DiscoveredTheme;
    post: { kind: "post" | "page"; bodyFormat: "doc" | "html"; templateChoice?: string | null };
  },
  _optional: Record<string, never> = {}
): string | undefined {
  const { theme, post } = required;
  if (theme.manifest.tier !== "static") return undefined;
  // `kind` only — the `bodyFormat === "html"` half of this gate was removed 2026-09-16, see the
  // WIDENED note on this function's own doc. `bodyFormat` is not read at all now, and the parameter
  // keeps it only because callers pass whole records.
  if (post.kind !== "page") return undefined;
  // 2026-09-23: a bare Page (`isBarePageChoice`) never gets a theme's page shell either — the owner's
  // ruling is NO theme chrome for `""`, and a page shell IS theme chrome. `renderTemplateBranchIfEligible`
  // (`routes/site/pages.ts`) already intercepts a bare Page before either gate runs; this check is
  // belt-and-suspenders so a caller that skips that interception still cannot reach a page shell here.
  if (post.templateChoice === "") return undefined;

  const candidate = findPageShellCandidate(theme);
  if (candidate.kind === "usable") return `${candidate.id}.html`;

  warnPageShellFallbackMissOnce({ message: pageShellMissMessage({ themeId: theme.manifest.id, candidate }) });
  return undefined;
}
