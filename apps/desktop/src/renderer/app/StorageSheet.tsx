/**
 * @file P11 ST-18a.T / ST-18b.T — the sites-home Storage sheet.
 *
 * Presentational only: everything it shows comes from the REQUIRED `useStorageSheet` host hook (bound
 * to the fixed `tovuStorageSheet` bridge in production, a fake in tests), and its words and button
 * come from the host. It never holds a path or a partition — only main-issued IDs — and a removal is
 * two steps: `ask` (main issues a confirmation) then the owner's explicit Confirm, which is the only
 * thing that calls `confirm`. Clean/Compact appear only for capabilities main positively reported.
 */
import { useState, type ComponentType, type ReactNode } from 'react';
import type {
  ByteEstimate, DesktopStorageActionKind, DesktopStorageActionResult, DesktopStoragePreview, DesktopStorageView,
} from '@tovu/contracts/desktop-storage';

export type ReadyStoragePreview = Extract<DesktopStoragePreview, { state: 'ready' }>;

/** What the host hook gives the sheet. `view` is null while loading or when main refused. */
export interface StorageSheetState {
  view: DesktopStorageView | null;
  pending: ReadyStoragePreview | null;
  result: DesktopStorageActionResult | null;
  ask: (required: { id: string; action: DesktopStorageActionKind }) => void;
  confirm: () => void;
  cancel: () => void;
}

export interface StorageSheetCopy {
  open: string; title: string; close: string; loading: string; sites: string; signIns: string; signInsUnknown: string;
  otherFolders: string; unknownSize: string; confirm: string; cancel: string;
  actions: Readonly<Record<DesktopStorageActionKind, string>>;
  bytes: (required: { bytes: number }) => string;
  confirmDetail: (required: { preview: ReadyStoragePreview }) => string;
  result: (required: { result: DesktopStorageActionResult }) => string;
}

export interface StorageButtonProps { onClick: () => void; className?: string; children: ReactNode }
export interface StorageSheetComponents { Button: ComponentType<StorageButtonProps> }

/** The host's whole binding: entry exists only when the host builds one of these. */
export interface StorageSheetSlot { useStorageSheet: () => StorageSheetState; copy: StorageSheetCopy; components: StorageSheetComponents }

interface Parts { state: StorageSheetState; copy: StorageSheetCopy; Button: ComponentType<StorageButtonProps> }

const size = (copy: StorageSheetCopy, bytes: ByteEstimate) => (bytes === null ? copy.unknownSize : copy.bytes({ bytes }));

function SitesSection({ state: { view, ask }, copy, Button }: Parts & { state: { view: DesktopStorageView } }) {
  return <section className="storage-sheet__sites"><h3>{copy.sites}</h3><ul>{view.sites.map((site) => (
    <li key={site.id}>
      <span>{site.label}</span> <span>{size(copy, site.totalBytes)}</span>
      {view.tidy.actions.map((action) => <Button key={action} className={`storage-sheet__${action}`} onClick={() => ask({ id: site.id, action })}>{copy.actions[action]}</Button>)}
    </li>))}</ul></section>;
}

function SignInsSection({ state: { view, ask }, copy, Button }: Parts & { state: { view: DesktopStorageView } }) {
  const { signIns } = view;
  if (signIns.state !== 'ok') return <section className="storage-sheet__sign-ins"><h3>{copy.signIns}</h3><p>{copy.signInsUnknown}</p></section>;
  return <section className="storage-sheet__sign-ins"><h3>{copy.signIns}</h3><ul>{signIns.items.map((item, index) => (
    <li key={item.id ?? `kept-${index}`}>
      <span>{item.label}</span> <span>{size(copy, item.cacheBytes)}</span>
      {item.id !== null && <Button className="storage-sheet__remove" onClick={() => ask({ id: item.id!, action: 'remove-sign-in' })}>{copy.actions['remove-sign-in']}</Button>}
    </li>))}</ul></section>;
}

function FoldersSection({ state: { view, ask }, copy, Button }: Parts & { state: { view: DesktopStorageView } }) {
  return <section className="storage-sheet__folders"><h3>{copy.otherFolders}</h3><ul>{view.otherFolders.map((folder, index) => (
    <li key={folder.id ?? `${folder.kind}-${index}`}>
      <span>{folder.label}</span> <span>{size(copy, folder.bytes)}</span>
      {folder.id !== null && folder.kind === 'dismissed-site' && <Button className="storage-sheet__trash" onClick={() => ask({ id: folder.id!, action: 'trash-folder' })}>{copy.actions['trash-folder']}</Button>}
    </li>))}</ul></section>;
}

function ConfirmPanel({ state: { pending, confirm, cancel }, copy, Button }: Parts) {
  if (!pending) return null;
  return <div className="storage-sheet__confirm" role="alertdialog" aria-label={copy.actions[pending.action]}>
    <p>{copy.confirmDetail({ preview: pending })}</p>
    <Button onClick={cancel}>{copy.cancel}</Button>
    <Button className="storage-sheet__confirm-button" onClick={confirm}>{copy.confirm}</Button>
  </div>;
}

/** The sheet itself. `useStorageSheet` is required: there is no default bridge-bound hook. */
export function StorageSheet({ useStorageSheet, copy, components: { Button }, onClose }: Omit<StorageSheetSlot, 'components'> & {
  components: StorageSheetComponents; onClose: () => void;
}) {
  const state = useStorageSheet();
  const { view, result } = state;
  const parts = { state, copy, Button };
  return <section className="storage-sheet" aria-label={copy.title}>
    <header><h2>{copy.title}</h2><Button onClick={onClose}>{copy.close}</Button></header>
    {view === null ? <p>{copy.loading}</p> : <>
      <SitesSection {...parts} state={{ ...state, view }} />
      <SignInsSection {...parts} state={{ ...state, view }} />
      <FoldersSection {...parts} state={{ ...state, view }} />
    </>}
    <ConfirmPanel {...parts} />
    {result && <p role="status">{copy.result({ result })}</p>}
  </section>;
}

/** The sites-home entry: a nav button that opens the sheet. Rendered only when the host built a slot. */
export function StorageSheetLauncher({ slot }: { slot: StorageSheetSlot }) {
  const [open, setOpen] = useState(false);
  const { Button } = slot.components;
  return <>
    <Button className="topnav__storage" onClick={() => setOpen((was) => !was)}>{slot.copy.open}</Button>
    {open && <StorageSheet {...slot} onClose={() => setOpen(false)} />}
  </>;
}
