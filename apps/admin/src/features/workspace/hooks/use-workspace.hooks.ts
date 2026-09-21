import { useEffect, useState } from "react";

import type { AdminWorkspace } from "@/lib/api";
import { describeApiError } from "../rules";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t } from "../workspace-i18n";
import type { Translate } from "@/lib/dictionary-translator";
import { defaultWorkspacePort } from "./workspace-dependencies.hooks";
import type { WorkspacePort } from "./workspace-port.hooks";

/**
 * @file Everything the Workspace screen does, so `Workspace.tsx` is only markup.
 *
 * Extracted verbatim — same state, same order, same effect, same error handling. Naming follows
 * `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local because nothing
 * outside `features/workspace` needs it.
 *
 * `deps.port` is injected (see `workspace-port.hooks.ts`) rather than reaching for `lib/api`'s
 * `api` directly — the same `useX(dependencies)` / `useWiredX()` split `redirects`/`widgets`/
 * `plugins`/`members` use.
 *
 * `t` (2026-08-11, standing i18n rule — a component with a hook gets a BOUND `t` from that hook,
 * not its own `useAdminLocale()`/dictionary import): this hook already called `useAdminLocale()`
 * for its own error-string translations, so exposing that SAME already-resolved `locale` as a
 * bound `t` on the return value adds no new fetch — `Workspace.tsx` used to call `useAdminLocale()`
 * a second time, entirely redundant with the resolution this hook was already doing internally. No
 * raw `locale` needed: `Workspace.tsx`'s local `WorkspaceFormStatus` subcomponent still takes
 * `locale` as its own prop (carve-out — no hook file of its own), but the value it receives can now
 * come from the same `useWorkspace()` return rather than a second `useAdminLocale()` call.
 */

export interface WorkspaceDependencies {
  port: WorkspacePort;
}

export interface WorkspaceController {
  /** `null` until the initial load settles — the caller renders a loading state. */
  workspace: AdminWorkspace | null;
  error: string | null;
  name: string;
  setName: (name: string) => void;
  slug: string;
  setSlug: (slug: string) => void;
  saving: boolean;
  saveError: string | null;
  saved: boolean;
  onSave: (e: React.FormEvent) => Promise<void>;
  /** Bound translator — `key` already resolved against the caller's locale, so `Workspace.tsx`
   *  never imports `useAdminLocale`/`workspace-i18n` itself. See this file's header. */
  t: Translate;
  /** Raw resolved locale — `Workspace.tsx`'s local `WorkspaceFormStatus` subcomponent takes
   *  `locale` directly rather than a bound translator. See this file's header. */
  locale: string;
}

/**
 * @complexity Time/space: O(1) per call — one workspace round trip on mount, one per save.
 */
export function useWorkspace({ port }: WorkspaceDependencies): WorkspaceController {
  const locale = useAdminLocale();
  const boundT = (key: string): string => t(locale, key);
  const [workspace, setWorkspace] = useState<AdminWorkspace | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function reload(): Promise<void> {
    return port
      .getWorkspace()
      .then((r) => {
        setWorkspace(r.workspace);
        setName(r.workspace.name);
        setSlug(r.workspace.slug);
      })
      .catch((e) => setError(describeApiError(e, t(locale, "failed to load workspace"), locale)));
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const { workspace: updated } = await port.updateWorkspace({ name, slug });
      setWorkspace(updated);
      setSaved(true);
    } catch (e) {
      setSaveError(describeApiError(e, t(locale, "failed to save workspace"), locale));
    } finally {
      setSaving(false);
    }
  }

  return { workspace, error, name, setName, slug, setSlug, saving, saveError, saved, onSave, t: boundT, locale };
}

/**
 * Binds the real `/api/.../workspaces/{id}` client — see `workspace-dependencies.hooks.ts`.
 *
 * The zero-argument-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `Workspace.tsx` composes this and a test composes {@link useWorkspace} with
 * `createFakeWorkspacePort`.
 */
export function useWiredWorkspace(): WorkspaceController {
  return useWorkspace({ port: defaultWorkspacePort });
}
