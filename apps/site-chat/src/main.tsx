import { createRoot } from "react-dom/client";

import { drainQueuedPageAction } from "./session-store";
import { SiteAssistantWidget } from "./SiteAssistantWidget";
import "./widget.css";

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
  // `session-store.ts` module in isolation. Discarded for now: no page-action kind exists yet to hand
  // it to (REQ-4 through REQ-8 are blocked on two unresolved owner decisions — see
  // `session-store.ts`'s header). The call's only real job today is deleting whatever was queued, so a
  // stray or half-written entry from an earlier session can never survive into a page load a future
  // handler will actually act on.
  void drainQueuedPageAction();
  createRoot(el).render(<SiteAssistantWidget />);
}

mount();
