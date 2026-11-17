import { createSiteChatAssetReadiness, renderLazySiteChatMarkup, type SiteChatSelection } from "../site-chat-markup.js";
import { existsSync } from "node:fs";
import path from "node:path";
// The leaf, not the site-dir barrel: this file runs inside the 64 MB theme render workers, and the
// barrel's site-registry/repair/new-site members load the database (`worker-import-graph.test.ts`).
import { resolveAppDistDir } from "#src/platform/site-dir/product-root";

/**
 * The DOM id `apps/site-chat/src/main.tsx`'s bundle mounts itself into. Kept as a literal string in
 * both files rather than a shared import — `site-chat` is a standalone Vite app outside this
 * server's module graph (see that file's own header for the same tradeoff on this exact constant).
 */
const SITE_ASSISTANT_MOUNT_ID = "tovu-site-assistant-root";

/**
 * ADR-054 Task 2/3 — the visitor chat's mount node plus its lazy `<script defer>`, injected once here
 * rather than into any of the five theme templates (see this file's own module doc). `defer`, not a
 * blocking `<script>` or a bare module tag with no attribute: the ADR's own "Costs and open risks"
 * section requires this to never block first paint, and `defer` is what guarantees the browser keeps
 * parsing/painting the rest of the document while the loader fetches, only running it once parsing
 * finishes.
 *
 * Gated on `enabled` — never unconditional. `src/assistant/public-assistant-settings.ts`'s file
 * header spells out the contract this obeys: `publicEnabled: false` means the public page ships NO
 * assistant bundle and NO mount markup, and "a CSS or JavaScript-level hide is a defect against this
 * contract, not a shortcut." Emitting `hidden`/`display:none` markup here when disabled would be
 * exactly that defect, so the disabled case returns nothing at all rather than an inert tag.
 *
 * The old eager bundle shipped a stylesheet alongside the script — a real, measured omission until a
 * browser check caught it (2026-08-03): the mount div and script alone got the FAB rendering, but
 * with none of `apps/site-chat/src/widget.css`'s positioning/sizing loaded, so it rendered as a bare
 * unstyled `<button>` (33×28px, page-flow position) instead of the designed fixed 56×56 circle.
 * `ChatPane`'s OWN internal theme still injects itself as a runtime `<style>` tag regardless (see
 * `AssistantDock.tsx`'s file header for that mechanism) — that part never needed this link. Only the
 * HOST-supplied layout CSS (`.chat-fab`/`.tovu-site-assistant__panel` position/size) does, because
 * nothing else on an arbitrary themed page provides it. Placed in `<head>` (not deferred like the
 * script) since it is small (under 1KB) and a visible FAB pop-in after paint would be a worse
 * regression than the negligible render-blocking cost of one tiny stylesheet. The lazy adapter
 * now supplies inline bubble CSS for first paint; Jini loads the full widget CSS on activation.
 * Missing lazy assets (including a legacy dev proxy) emit no widget, never an eager React fallback.
 */
const siteChatAssetsReady = createSiteChatAssetReadiness({
  exists: ({ directory, name }) => existsSync(path.join(directory, name)),
});

/** Both widgets share the tiny loader once deployment artifacts are ready. Default remains React.
 * Readiness fails closed so incomplete builds cannot eagerly fetch the React widget. */
export function siteAssistantMarkup(enabled: SiteChatSelection): { head: string; body: string } {
  if (!enabled) return { head: "", body: "" };
  const variant = enabled === "vanilla" ? "vanilla" : "react";
  const distDir = process.env.TOVU_SITE_CHAT_DIST ?? resolveAppDistDir({ app: "site-chat" });
  const assetsReady = !process.env.TOVU_SITE_CHAT_DEV_PROXY_URL &&
    siteChatAssetsReady({ directory: distDir, variant });
  return renderLazySiteChatMarkup({ enabled: true, variant, assetsReady, mountId: SITE_ASSISTANT_MOUNT_ID })
    ?? { head: "", body: "" };
}
