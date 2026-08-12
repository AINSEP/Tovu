import { api, type AdminMedia } from "../../lib/api";
import type { MediaPickerPort } from "./media-picker-port.hooks";

/**
 * @file The only place under `components/MediaPickerDialog` that reaches `lib/api` — see
 * `media-picker-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `redirects-dependencies
 *  .hooks.ts`'s `defaultRedirectsPort`. */
export const defaultMediaPickerPort: MediaPickerPort = {
  listMedia: () => api.listMedia(),
};

/** Seed state for {@link createFakeMediaPickerPort}. */
export interface FakeMediaPickerPortOptions {
  media?: AdminMedia[];
}

/**
 * An in-memory {@link MediaPickerPort} for tests — lets a test describe "these items are
 * available to pick" directly, instead of stubbing global `fetch` or spying on `api.listMedia`.
 * Shipped alongside the real binding per the pattern's "every port gets a fake" rule.
 */
export function createFakeMediaPickerPort(options: FakeMediaPickerPortOptions = {}): MediaPickerPort {
  return {
    async listMedia() {
      return { media: [...(options.media ?? [])] };
    },
  };
}
