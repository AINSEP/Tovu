/**
 * @file The ask when a running site's tab closes: "Stop {name} too?" (owner 2026-11-05). Closing a
 * tab never stopped anything, so without it a site can keep running with nothing on screen to say so.
 * Like the delete confirm, it is drawn in this window rather than in a `window.confirm`: a native
 * modal blocks the renderer, and that also freezes the IPC this window answers on.
 */
import { useEffect, useState } from 'react';
import type { SiteRecord } from '../contracts/project.js';
import { desktopCopy, runtimeLocale } from '../desktop-i18n.js';
import { runnerInventoryBridge } from './runner-api.js';
import { dismissOnEscape } from './site-shell-policy.js';
import { externalStopConfirm, performPowerAction, powerControl } from './use-site-power.hooks.js';

/**
 * Whether closing this site's tab has anything to ask: only a running site main is able to stop.
 * Pure. @returns `true` when Stop would do something. @complexity O(1).
 */
export function tabCloseAsksToStop({ project }: { project: SiteRecord }, _optional = {}): boolean {
  const external = Boolean(project.externalUrl) && !project.externalLauncher;
  return powerControl(project.status, { external })?.action === 'stop';
}

/**
 * The ask's words. A site another process serves also gets the Stop confirm's warning, since Stop
 * ends that whole process. Pure. @returns The ask's copy in `locale`. @complexity O(1).
 */
export function tabCloseCopy(
  { project }: { project: SiteRecord },
  { locale = runtimeLocale() }: { locale?: string } = {},
) {
  const copy = desktopCopy({ locale });
  return {
    title: copy.tabClose.stopToo.replace('{name}', () => project.displayName),
    body: externalStopConfirm({ project }, { locale })?.confirmBody ?? null,
    stop: copy.stopConfirm.confirm,
    stopping: copy.stopConfirm.confirming,
    keepRunning: copy.tabClose.keepRunning,
    cancel: copy.lastWindowQuit.cancel,
  };
}

/**
 * Holds which tab is asking. A failed stop keeps the tab and the ask, with main's reason, so the
 * operator can retry or keep the site running.
 * @param input.closeTab the tab hook's plain close. @param input.onSiteUpdated applies main's record.
 * @param options.getBridge the bridge port, read at press time.
 * @returns The site asked about (or `null`), its state, and the answers.
 * @complexity O(n) tracked sites per render to find the asked site; a stop is one IPC round trip.
 */
export function useTabCloseAsk(
  { projects, closeTab, onSiteUpdated }: {
    projects: readonly SiteRecord[];
    closeTab: (id: string) => void;
    onSiteUpdated: (record: SiteRecord) => void;
  },
  { getBridge = runnerInventoryBridge }: { getBridge?: () => Parameters<typeof performPowerAction>[2] } = {},
) {
  const [askingId, setAskingId] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const asking = projects.find((project) => project.id === askingId) ?? null;

  const cancel = () => setAskingId(null);
  useEffect(() => {
    if (askingId === null) return undefined;
    const onEscape = (event: KeyboardEvent) => dismissOnEscape({ event, dismiss: () => setAskingId(null), busy: stopping });
    document.addEventListener('keydown', onEscape, true);
    return () => document.removeEventListener('keydown', onEscape, true);
  }, [askingId, stopping]);

  const requestClose = (id: string) => {
    const project = projects.find((candidate) => candidate.id === id);
    if (!project || !tabCloseAsksToStop({ project })) {
      closeTab(id);
      return;
    }
    setError(null);
    setAskingId(id);
  };

  const keepRunning = () => {
    if (askingId !== null) closeTab(askingId);
    setAskingId(null);
  };

  const stopAndClose = async () => {
    if (askingId === null || stopping) return;
    setStopping(true);
    setError(null);
    const result = await performPowerAction('stop', askingId, getBridge());
    setStopping(false);
    if (result.error !== undefined) {
      setError(result.error);
      return;
    }
    onSiteUpdated(result.record);
    closeTab(askingId);
    setAskingId(null);
  };

  return { asking, stopping, error, requestClose, keepRunning, stopAndClose, cancel };
}
