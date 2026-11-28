import assert from "node:assert/strict";
import test from "node:test";
import { registerSiteStoreHooks, siteStoreHooksFor, type SiteStoreHooks } from "../store-close-hooks.js";

/** @file The side table that hands a composition's own store-close hooks to its serving host, keyed by the route deps object. */

function hooks(dbPath: string): SiteStoreHooks {
  return { dbPath, beforeStoreClose: () => {}, onStoreClose: () => {} };
}

test("the hooks registered for a route deps object are the ones looked up for it, and another deps object owns none", () => {
  const first = {}, second = {}, unregistered = {};
  const firstHooks = hooks("/sites/first/content.db"), secondHooks = hooks("/sites/second/content.db");
  registerSiteStoreHooks({ routeDeps: first, hooks: firstHooks });
  registerSiteStoreHooks({ routeDeps: second, hooks: secondHooks });
  assert.equal(siteStoreHooksFor({ routeDeps: first }), firstHooks);
  assert.equal(siteStoreHooksFor({ routeDeps: second }), secondHooks);
  assert.equal(siteStoreHooksFor({ routeDeps: unregistered }), undefined, "a composition that owns no content store never registers");
});

test("registering again for the same route deps replaces the earlier hooks", () => {
  const routeDeps = {};
  const replacement = hooks("/sites/moved/content.db");
  registerSiteStoreHooks({ routeDeps, hooks: hooks("/sites/old/content.db") });
  registerSiteStoreHooks({ routeDeps, hooks: replacement });
  assert.equal(siteStoreHooksFor({ routeDeps }), replacement);
});
