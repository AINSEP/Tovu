import { createApp, createRouteDeps } from "./app.js";
import type { CreateAppOptions } from "./create-app-options.js";

/** A fresh in-memory root and the app over it. For tests and tools. Never memoized: each call builds a new root. */
export function createInMemoryApp(
  _required: Record<string, never> = {},
  optional: { app?: CreateAppOptions } = {},
): ReturnType<typeof createApp> {
  return createApp(createRouteDeps(), optional.app ?? {});
}
