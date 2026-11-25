import { useState, type ComponentProps } from "react";
import type { DataTable, RowMenu, ConfirmDialog } from "@jini-ai/admin/react";
import type { RecurringSchedulePicker, useRecurringSchedulePicker } from "@jini-ai/ui";
import type { RoutineRow } from "@jini-ai/core/contracts/site/routines";
import type { RoutinesController } from "./Routines.hooks";
import type { RoutinesT } from "./routines-i18n";
import { projectRoutineRow, type RoutineViewRow } from "./project-routine-row";
import { RoutineForm } from "./RoutineForm";

/**
 * @file The Routines screen: a table of recurring AI jobs with pause/resume, edit and delete, or a
 * plain refusal when routines are not ready. Why: everything stateful (loading, polling, writes) is in
 * the injected controller and everything visual comes from the injected kit, so this file only decides
 * what to show. A non-ready screen renders no mutation action at all, and a link opens an existing
 * authorized conversation without selecting or starting anything here.
 */
export type RoutinesKit = Readonly<{
  DataTable: typeof DataTable; RowMenu: typeof RowMenu; ConfirmDialog: typeof ConfirmDialog; RecurringSchedulePicker: typeof RecurringSchedulePicker;
}>;
export type SchedulePickerHook = typeof useRecurringSchedulePicker;
export type ConversationLinkBuilder = () => Readonly<{ hrefFor: (required: { conversationId: string }) => string }>;
type Confirming = Readonly<{ kind: "pause" | "delete"; row: RoutineRow }> | null;
type TKey = Parameters<RoutinesT>[0]["key"];

const UNAVAILABLE_KEY: Record<string, TKey> = {
  ROUTINES_UNAVAILABLE: "Routines run only while the desktop app is open.",
  ROUTINES_ASSISTANT_OFF: "Turn on the AI assistant to run routines.",
  ROUTINES_LEASE_HELD: "Routines for this site are running in another Tovu window.",
  ROUTINES_STORE_OPEN_FAILED: "Routines are unavailable because their data file could not be opened.",
};
const NOTICE_KEY = { "save-failed": "We could not save this routine. Nothing was changed.", stale: "This routine changed since you looked. The list has been reloaded.", "stale-delete": "This routine was already deleted or changed. The list has been reloaded." } as const;

function RowActions({ view, controller, kit, locale, t, onEdit, onAsk }: {
  view: RoutineViewRow; controller: RoutinesController; kit: RoutinesKit; locale: string; t: RoutinesT; onEdit: (row: RoutineRow) => void; onAsk: (confirming: Confirming) => void;
}) {
  const row = view.source;
  const items: ComponentProps<typeof RowMenu>["items"] = [
    { key: "edit", label: t({ locale, key: "Edit" }), onSelect: () => onEdit(row) },
    view.paused
      ? { key: "resume", label: t({ locale, key: "Resume routine" }), onSelect: () => void controller.setEnabled({ row, enabled: true }) }
      : { key: "pause", label: t({ locale, key: "Pause routine" }), onSelect: () => onAsk({ kind: "pause", row }) },
    { key: "delete", label: t({ locale, key: "Delete routine" }), tone: "danger", onSelect: () => onAsk({ kind: "delete", row }) },
  ];
  return <kit.RowMenu items={items} triggerLabel={`${t({ locale, key: "Routines" })}: ${view.name}`} />;
}

function Unavailable({ view, locale, t }: { view: Extract<RoutinesController["view"], { kind: "unavailable" }>; locale: string; t: RoutinesT }) {
  const key = (view.reason !== null ? UNAVAILABLE_KEY[view.reason] : undefined) ?? "Routines run only while the desktop app is open.";
  return <p role="status" data-routines-state={view.availability}>{t({ locale, key })}{view.errorId === null ? null : ` (${view.errorId})`}</p>;
}

function Confirmation({ confirming, controller, kit, locale, t, close }: {
  confirming: Confirming; controller: RoutinesController; kit: RoutinesKit; locale: string; t: RoutinesT; close: () => void;
}) {
  const deleting = confirming?.kind === "delete";
  const run = () => {
    if (confirming === null) return;
    close();
    void (deleting ? controller.remove({ row: confirming.row }) : controller.setEnabled({ row: confirming.row, enabled: false }));
  };
  return <kit.ConfirmDialog open={confirming !== null} tone={deleting ? "danger" : "warning"}
    title={t({ locale, key: deleting ? "Delete routine" : "Pause routine" })}
    body={t({ locale, key: deleting ? "Delete this routine? A run already in progress will finish." : "Pause this routine? It will not run until you resume it." })}
    confirmLabel={t({ locale, key: deleting ? "Delete routine" : "Pause routine" })} cancelLabel={t({ locale, key: "Cancel" })} onConfirm={run} onCancel={close} />;
}

function columnsOf({ controller, kit, locale, t, link, onEdit, onAsk }: {
  controller: RoutinesController; kit: RoutinesKit; locale: string; t: RoutinesT; link: ReturnType<ConversationLinkBuilder>; onEdit: (row: RoutineRow) => void; onAsk: (confirming: Confirming) => void;
}): ComponentProps<typeof DataTable<RoutineViewRow>>["columns"] {
  return [
    { key: "name", header: t({ locale, key: "Name" }), cell: (v) => <>{v.name}{v.paused ? <> <span>{t({ locale, key: "Paused" })}</span></> : null}</> },
    { key: "schedule", header: t({ locale, key: "Schedule" }), cell: (v) => v.scheduleLabel },
    { key: "agent", header: t({ locale, key: "Agent" }), cell: (v) => (v.modelLabel === null ? v.agentLabel : `${v.agentLabel} · ${v.modelLabel}`) },
    { key: "next", header: t({ locale, key: "Next run" }), cell: (v) => v.nextRunLabel ?? "—" },
    { key: "last", header: t({ locale, key: "Last run" }), cell: (v) => <>
      {v.lastRunLabel}{v.outcomeLabel === null ? null : <> · {v.outcomeLabel}{v.outcomeAtLabel === null ? null : ` ${v.outcomeAtLabel}`}</>}
      {v.badges.map((badge) => <span key={badge} className="routine-badge"> {badge}</span>)}
      {v.conversationId === null ? null : <> <a href={link.hrefFor({ conversationId: v.conversationId })}>{t({ locale, key: "Open conversation" })}</a></>}
    </> },
    { key: "actions", headerLabel: t({ locale, key: "Routines" }), cell: (v) => <RowActions view={v} controller={controller} kit={kit} locale={locale} t={t} onEdit={onEdit} onAsk={onAsk} /> },
  ];
}

export function Routines({ useRoutinesController, useSchedulePicker, useConversationDeepLink, kit, locale, theme, t, visible }: {
  useRoutinesController: (required: { visible: boolean }) => RoutinesController; useSchedulePicker: SchedulePickerHook;
  useConversationDeepLink: ConversationLinkBuilder; kit: RoutinesKit; locale: string; theme: string; t: RoutinesT; visible: boolean;
}, _optional: Record<string, never> = {}) {
  const controller = useRoutinesController({ visible });
  const link = useConversationDeepLink();
  const [editing, setEditing] = useState<{ row: RoutineRow | null } | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const { view, notice } = controller;
  const ready = view.kind === "ready";
  const rows = ready ? view.routines.map((row) => projectRoutineRow({ row, locale, t })) : [];
  const save = async (draft: Parameters<RoutinesController["save"]>[0]["draft"]) => {
    if (editing !== null && (await controller.save({ draft, row: editing.row }))) setEditing(null);
  };
  return (
    <section className="routines" data-theme={theme} aria-label={t({ locale, key: "Routines" })}>
      <h1>{t({ locale, key: "Routines" })}</h1>
      {notice === null ? null : <p role="alert">{t({ locale, key: NOTICE_KEY[notice.key] })}{notice.errorId === null ? null : ` (${notice.errorId})`}</p>}
      {view.kind === "loading" ? <p role="status">{t({ locale, key: "Loading routines…" })}</p> : null}
      {view.kind === "failed" ? <p role="alert">{t({ locale, key: "Could not load routines." })}{view.errorId === null ? null : ` (${view.errorId})`}</p> : null}
      {view.kind === "unavailable" ? <Unavailable view={view} locale={locale} t={t} /> : null}
      {ready ? <>
        <button type="button" onClick={() => setEditing({ row: null })}>{t({ locale, key: "New routine" })}</button>
        <p>{t({ locale, key: "Routines run only while Tovu desktop is open and your computer is awake." })}</p>
        {editing === null ? null : <RoutineForm row={editing.row} onSave={(draft) => void save(draft)} onCancel={() => setEditing(null)}
          useSchedulePicker={useSchedulePicker} kit={kit} locale={locale} t={t} />}
        <kit.DataTable rows={rows} rowKey={(row) => row.id} label={t({ locale, key: "Routines" })}
          empty={<p>{t({ locale, key: "No routines yet" })}</p>}
          columns={columnsOf({ controller, kit, locale, t, link, onEdit: (row) => setEditing({ row }), onAsk: setConfirming })} />
        <Confirmation confirming={confirming} controller={controller} kit={kit} locale={locale} t={t} close={() => setConfirming(null)} />
      </> : null}
    </section>
  );
}
