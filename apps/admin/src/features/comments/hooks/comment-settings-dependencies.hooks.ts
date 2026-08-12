import { api, type CommentsSettings } from "../../../lib/api";
import type { CommentSettingsPort } from "./comment-settings-port.hooks";

/**
 * @file The only place `use-comment-settings.hooks.ts` reaches `lib/api` — see `comment-settings-
 * port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton. */
export const defaultCommentSettingsPort: CommentSettingsPort = {
  getCommentsSettings: () => api.getCommentsSettings(),
  putCommentsSettings: (patch) => api.putCommentsSettings(patch),
};

const FAKE_SETTINGS: CommentsSettings = {
  enabled: true,
  requireModeration: true,
  maxDepth: 3,
  closeAfterDays: null,
  spamAutoRejectScore: 0.05,
  maxPerIpPerHour: 10,
};

/** Seed state for {@link createFakeCommentSettingsPort}. */
export interface FakeCommentSettingsPortOptions {
  settings?: CommentsSettings;
  /** When set, `getCommentsSettings()` rejects with this instead of resolving — for
   *  load-failure tests. */
  getError?: Error;
  /** When set, `putCommentsSettings()` rejects with this instead of resolving — for
   *  save-failure tests. */
  putError?: Error;
}

/**
 * An in-memory {@link CommentSettingsPort} for tests — "every port gets a fake" (see
 * `assistant-chats-dependencies.hooks.ts`). `putCommentsSettings` merges into and returns the
 * fake's own store, matching the real route's read-your-writes shape.
 */
export function createFakeCommentSettingsPort(options: FakeCommentSettingsPortOptions = {}): CommentSettingsPort & {
  /** The fake's current stored settings. */
  settings: CommentsSettings;
} {
  const state = { settings: options.settings ?? FAKE_SETTINGS };

  return {
    get settings() {
      return state.settings;
    },
    async getCommentsSettings() {
      if (options.getError) throw options.getError;
      return { data: state.settings };
    },
    async putCommentsSettings(patch) {
      if (options.putError) throw options.putError;
      state.settings = { ...state.settings, ...patch };
      return { data: state.settings };
    },
  };
}
