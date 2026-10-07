/** Preview policy from the 0.1.12 peer repair: reserve once per live lifecycle, resolve the
 * server only when the debounce fires, and let failed or canceled attempts be scheduled again.
 * Electron, site partitions, storage and timers are ports; this module does no I/O itself. */
export interface PreviewTarget { readonly port: number; readonly partition: string }

export interface PreviewSchedulerPorts<Timer> {
  readonly current: (required: { siteDir: string }, optional: {}) => PreviewTarget | undefined;
  readonly capture: (required: PreviewTarget & { siteDir: string }, optional: {}) => Promise<boolean>;
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
    let captured = false;
    try {
      captured = await ports.capture({ siteDir, ...target }, {});
    } catch {
      // A preview is decoration. A failed port must neither fail Start nor reserve a retry.
    }
    // A stop/restart can replace this attempt while capture awaits; its completion owns no
    // state in the replacement lifecycle, whether it succeeded or failed.
    if (!captured && attempts.get(siteDir) === attempt) attempts.delete(siteDir);
  }

  return {
    schedule({ siteDir }: { siteDir: string }, _optional = {}): void {
      if (attempts.has(siteDir)) return;
      const attempt: { timer?: Timer } = {};
      // Reserve before firing: repeated opens must not queue a second hidden window.
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
