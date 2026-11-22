import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Editor } from "@tiptap/react";
import type { Translate } from "@jini-ai/core/text";

import type { AdminPost } from "@/features/posts/api/posts-api.types";
import { isLiveEditor } from "@/lib/live-tiptap-editor";
import { POST_NOT_LOADED_SAVE_REFUSED, reportPostLoadFailure } from "./post-editor-messages";

/**
 * @file Puts a loaded post row into the post editor's live TipTap instance — the half of
 * `usePostEditor` that decides WHEN and INTO WHICH instance, split out so that hook stays within its
 * size ratchet. `usePostEditor` keeps `applyLoadedPost` itself (it owns every field setter).
 *
 * A loaded row goes into the newest live editor instance, never one a closure kept: `useEditor` can
 * replace its instance after mount (`lib/live-tiptap-editor.ts`), and the load used to call
 * `applyLoadedPost` with the instance it captured at mount, which TipTap may already have destroyed —
 * "Cannot read properties of null (reading 'commands')" with the title shown and the body empty, and
 * Publish then wrote that empty body over the stored post (client report 2026-11-21).
 */

/** One server row to seed the editor from, with the theme templates its template default needs. */
export interface LoadedPostRow { post: AdminPost; activeThemeTemplates: string[] }

/** A row and the editor instance it went into. */
interface AppliedRow { row: LoadedPostRow; editor: Editor }

/**
 * Whether the row the editor should show is the one in `editor` right now — false before the load
 * lands, while a new row waits for a live instance, and after `useEditor` replaced the instance the
 * row went into. Save/Publish refuse while it is false.
 * @complexity O(1).
 */
function isLoadedBodyInEditor(
  { loadedRow, appliedRow, editor }: { loadedRow: LoadedPostRow | null; appliedRow: AppliedRow | null; editor: Editor | null },
  _options: Record<string, never> = {},
): boolean {
  return loadedRow !== null && appliedRow?.row === loadedRow && appliedRow.editor === editor && isLiveEditor(editor);
}

/**
 * Holds the row the editor should show and applies it to a live instance: at once when one exists,
 * otherwise from an effect once `useEditor` renders one, and again into a replacement instance (which
 * starts empty). A failed apply leaves `post` unset, so the screen shows the plain error with no Save.
 * @param required.applyLoadedPost Seeds every field and the doc from one row into the given instance.
 * @param required.setError The editor's error line.
 * @returns `takeLoadedRow` (a fetched or assistant-written row), `clearLoadedRow` (a new route is
 *   loading) and `bodyReady` (Save/Publish may write `editor.getJSON()`).
 * @complexity O(1) per row besides `applyLoadedPost` itself.
 */
export function useLoadedPostApply(
  { editor, applyLoadedPost, setError, t }: {
    editor: Editor | null;
    applyLoadedPost: (input: LoadedPostRow & { liveEditor: Editor }) => void;
    setError: Dispatch<SetStateAction<string | null>>;
    t: Translate;
  },
  _options: Record<string, never> = {},
): { takeLoadedRow: (row: LoadedPostRow) => void; clearLoadedRow: () => void; bodyReady: boolean } {
  const [loadedRow, setLoadedRow] = useState<LoadedPostRow | null>(null);
  const [appliedRow, setAppliedRow] = useState<AppliedRow | null>(null);
  const latestEditor = useRef<Editor | null>(editor);
  latestEditor.current = editor;
  // The last row/instance pair an apply was attempted for, so the effect neither re-applies a row
  // already in this instance nor retries one that just failed.
  const attemptedApply = useRef<AppliedRow | null>(null);
  const inputs = useRef({ applyLoadedPost, setError, t });
  inputs.current = { applyLoadedPost, setError, t };

  function applyRowTo({ row, editor: liveEditor }: AppliedRow, _optional: Record<string, never> = {}): void {
    const current = inputs.current;
    attemptedApply.current = { row, editor: liveEditor };
    try {
      current.applyLoadedPost({ ...row, liveEditor });
      setAppliedRow({ row, editor: liveEditor });
      // A Save refused while loading no longer applies once the body is in.
      const refused = current.t(POST_NOT_LOADED_SAVE_REFUSED);
      current.setError((shown) => (shown === refused ? null : shown));
    } catch (e) {
      current.setError(reportPostLoadFailure({ error: e, t: current.t }));
    }
  }
  function takeLoadedRow(row: LoadedPostRow): void {
    setLoadedRow(row);
    if (isLiveEditor(latestEditor.current)) applyRowTo({ row, editor: latestEditor.current });
  }
  const applyNow = useRef(applyRowTo);
  applyNow.current = applyRowTo;
  useEffect(() => {
    if (loadedRow === null || !isLiveEditor(editor)) return;
    if (attemptedApply.current?.row === loadedRow && attemptedApply.current.editor === editor) return;
    applyNow.current({ row: loadedRow, editor });
  }, [loadedRow, editor]);

  return { takeLoadedRow, clearLoadedRow: () => setLoadedRow(null), bodyReady: isLoadedBodyInEditor({ loadedRow, appliedRow, editor }) };
}
