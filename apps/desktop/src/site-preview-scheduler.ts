/** Coalesce readiness events for a public visit, resolve the server when the debounce fires,
 * and allow the next visit to refresh. Cancellation invalidates in-flight captures too.
 * Electron, site partitions, storage and timers are ports; this module does no I/O itself. */
export interface PreviewTarget { readonly port: number; readonly partition: string; readonly scheme?: "http" | "https" }

export interface PreviewSchedulerPorts<Timer> {
  readonly current: (required: { siteDir: string }, optional: {}) => PreviewTarget | undefined;
  readonly capture: (required: PreviewTarget & { siteDir: string }, optional: { isCurrent?: () => boolean }) => Promise<boolean>;
  readonly schedule: (required: { work: () => void; delayMs: number }, optional: {}) => Timer;
  readonly cancel: (required: { timer: Timer }, optional: {}) => void;
}

export function createSitePreviewScheduler<Timer>(
  { ports }: { ports: PreviewSchedulerPorts<Timer> }, { debounceMs = 1500 }: { debounceMs?: number } = {},
) {
  const attempts = new Map<string, { timer?: Timer }>();

  async function fire(siteDir: string, attempt: { timer?: Timer }): Promise<void> {
    if (attempts.get(siteDir) !== attempt) return;
    attempt.timer = undefined;
    const target = ports.current({ siteDir }, {});
    if (!target) { attempts.delete(siteDir); return; }
    try {
      await ports.capture({ siteDir, ...target }, { isCurrent: () => attempts.get(siteDir) === attempt });
    } catch {
      // A preview is decoration. A failed port must neither fail Start nor reserve a retry.
    }
    // A stop/restart can replace this attempt while capture awaits; its completion owns no
    // state in the replacement lifecycle, whether it succeeded or failed.
    if (attempts.get(siteDir) === attempt) attempts.delete(siteDir);
  }

  return {
    schedule({ siteDir }: { siteDir: string }, _optional = {}): void {
      if (attempts.has(siteDir)) return;
      const attempt: { timer?: Timer } = {};
      // Coalesce one visit's readiness events; the next public visit may refresh even after success.
      attempts.set(siteDir, attempt);
      attempt.timer = ports.schedule({ work: () => { void fire(siteDir, attempt); }, delayMs: debounceMs }, {});
    },
    cancel({ siteDir }: { siteDir: string }, _optional = {}): void {
      const attempt = attempts.get(siteDir);
      if (attempt?.timer !== undefined) ports.cancel({ timer: attempt.timer }, {});
      attempts.delete(siteDir);
    },
  };
}
