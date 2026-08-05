import { createRoot } from "react-dom/client";

import { isQueuedPageAction } from "./client-directives";
import { applyHighlight, findTargetElement, scrollToElement } from "./highlight";
import { installRemixIconOverride } from "./remixicon-override";
import { drainQueuedPageAction } from "./session-store";
import { SiteAssistantWidget } from "./SiteAssistantWidget";
import "./widget.css";

// Must run before `SiteAssistantWidget` ever renders a `RemixIcon` — see `remixicon-override.ts`'s
// header for why the package's own default icon-font loader is dead in this bundle's `iife` build.
installRemixIconOverride();

/**
 * @file Self-mounting entry point for the public site chat bundle (ADR-054 Task 2/3).
 *
 * Built in `lib`/`iife` mode (`vite.config.ts`) into one `dist/site-assistant.js` a themed page
 * loads with `<script defer src="...">`. There is no host code calling an exported `init()` — the
 * IIFE runs itself the moment it executes, which is the whole point of choosing this format: the
 * renderer injecting the script tag (`src/server/http/site/render.ts`, Task 3) doesn't need to know
 * anything about this bundle's internals beyond "load this file."
 *
 * `MOUNT_ID` must match `render.ts`'s injected `<div id="...">` — kept as a literal string in both
 * files rather than a shared import (this is a standalone Vite app; `render.ts` is not) with a
 * comment at each site pointing at the other, since a real shared constant would require exporting
 * across the app boundary this bundle is deliberately isolated behind.
 */
const MOUNT_ID = "tovu-site-assistant-root";

/**
 * SPEC-046 REQ-2/§4: executes a drained `scroll_to`/`highlight` action against the CURRENT page.
 * `navigate` never reaches here in practice — `SiteAssistantWidget.tsx` only ever enqueues the
 * bundled highlight/scroll_to alongside an auto-navigate, never the navigate action itself (there is
 * nothing to "drain and execute" for a navigation; it already happened by the time this page loads).
 * The `navigate` branch below is a defensive no-op, not a real path, kept only so a future caller
 * cannot silently mis-execute a navigate as if it were a scroll/highlight target.
 *
 * Deferred one animation frame past `createRoot(...).render(...)` — the target is server-rendered
 * page content, not anything React owns, so it does not depend on React's own commit, but a paint
 * tick still lets layout/web-font loading settle before `findTargetElement`/`scrollToElement` read
 * element positions, matching `check-bundle-mounts.mjs`'s own note that a real macrotask tick (not a
 * microtask) is what a browser's rendering pipeline actually needs here.
 */
function executeDrainedAction(action: ReturnType<typeof drainQueuedPageAction>): void {
  if (!isQueuedPageAction(action) || action.type === "navigate") return;
  requestAnimationFrame(() => {
    const element = findTargetElement(action.target.title);
    if (!element) return;
    scrollToElement(element);
    if (action.type === "highlight") applyHighlight(element);
  });
}

function mount(): void {
  let el = document.getElementById(MOUNT_ID);
  if (!el) {
    // Defensive, not the expected path: `render.ts` injects this element itself, ahead of this
    // `defer`red script, on every real page. Created here too so the widget still renders (e.g.
    // this bundle loaded directly against a page that doesn't inject the mount node) rather than
    // silently doing nothing.
    el = document.createElement("div");
    el.id = MOUNT_ID;
    document.body.appendChild(el);
  }
  // SPEC-046 REQ-2: drained exactly once per real mount, before anything else runs — this is the one
  // call site that makes "drains on mount" true of the actual running bundle, not just of the
  // `session-store.ts` module in isolation. The action itself is validated (`isQueuedPageAction`) and
  // executed by `executeDrainedAction` above; a stray or half-written entry from an earlier session
  // fails `isQueuedPageAction` and is silently dropped rather than acted on.
  const queuedAction = drainQueuedPageAction();
  createRoot(el).render(<SiteAssistantWidget />);
  executeDrainedAction(queuedAction);
}

mount();
