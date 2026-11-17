import type { StandingDraftAutosaveSnapshot, StandingDraftStaleBasis } from "../../../../hooks/use-standing-draft-autosave.hooks";
import { PageExternalChangeBanner } from "../../../pages/PageEditor";
import { PostAutosaveRecoveryBanner } from "./PostAutosaveRecoveryBanner";
import { PostAutosaveStaleBanner } from "./PostAutosaveStaleBanner";
import { PostVersionConflictBanner } from "./PostVersionConflictBanner";
import { type PostSaveConflict } from "../../rules";
import { type Translate } from "@jini-ai/core/text";

/**
 * The four "something happened to your work" notices, grouped into one component so their four
 * independent render decisions are scored in this scope instead of accumulating onto `PostEditor`'s
 * — the same extraction `PostEditorHeader`/`PostEditorActions` above already document, and the
 * reason this exists at all: adding the stale-basis notice put `PostEditor` at a complexity of 10
 * against this repo's ceiling of 9.
 *
 * Deliberately NOT merged into a single "pick the most important one" banner. All four can be true
 * at once and each reports a different fact with a different remedy — see `PostAutosaveStaleBanner`'s
 * own doc for the distinction. Suppressing one because another is showing would put the operator
 * back to guessing which of their edits actually survived.
 *
 * One exception (UI check 2026-10-31): the stale-basis notice waits while the outside-change notice
 * is up. Both report the same event — the stored version moved past this editor's basis — and two
 * stacked banners for one assistant save read as two problems. The outside-change notice carries
 * the choices; if the operator keeps their edits it goes, and the stale-basis notice (still true:
 * autosaving is paused) comes back.
 *
 * Order is deliberate: recovery (work from a previous session, an explicit choice to make) first,
 * then the stale-basis notice (a condition still true right now), then the rejected save (the most
 * recent thing the operator personally did), then the outside change awaiting a choice.
 */
export function PostEditorNotices({
  recoverableDraft,
  serverUpdatedAt,
  restoreRecoveredDraft,
  discardRecoveredDraft,
  autosaveStaleBasis,
  saveConflict,
  saveOverwritingConflict,
  dismissSaveConflict,
  pendingExternalVersion,
  loadExternalChange,
  dismissExternalChange,
  t,
}: {
  recoverableDraft: StandingDraftAutosaveSnapshot | null;
  serverUpdatedAt: string;
  restoreRecoveredDraft: () => void;
  discardRecoveredDraft: () => Promise<void>;
  autosaveStaleBasis: StandingDraftStaleBasis | null;
  saveConflict: PostSaveConflict | null;
  saveOverwritingConflict: () => Promise<void>;
  dismissSaveConflict: () => void;
  pendingExternalVersion: number | null;
  loadExternalChange: () => Promise<void>;
  dismissExternalChange: () => void;
  t: Translate;
}) {
  return (
    <>
      {recoverableDraft ? (
        <PostAutosaveRecoveryBanner
          recoverableDraft={recoverableDraft}
          serverUpdatedAt={serverUpdatedAt}
          onRestore={restoreRecoveredDraft}
          onDiscard={discardRecoveredDraft}
          t={t}
        />
      ) : null}
      {autosaveStaleBasis && pendingExternalVersion == null ? <PostAutosaveStaleBanner staleBasis={autosaveStaleBasis} /> : null}
      {saveConflict ? (
        <PostVersionConflictBanner
          saveConflict={saveConflict}
          onSaveAnyway={() => void saveOverwritingConflict()}
          onDismiss={dismissSaveConflict}
          t={t}
        />
      ) : null}
      {pendingExternalVersion != null ? (
        <PageExternalChangeBanner onLoadLatest={() => void loadExternalChange()} onKeepEdits={dismissExternalChange} t={t} />
      ) : null}
    </>
  );
}
