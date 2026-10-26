import { providerPluginOf } from "#src/features/project-keys/service";

/** One metadata query per 30 seconds; other site processes observe edited keys and detachments. */
export function watchProviderRevisions({ read, reapply }: {
  read: () => Promise<readonly { id: string; revision: number; attached_at: string }[]>;
  reapply: (input: { pluginId: string }) => Promise<"now" | "restart">;
}, optional: { schedule?: (check: () => Promise<void>, intervalMs: number) => () => void } = {}): () => void {
  let previous = new Map<string, string>();
  let running = false;
  let closed = false;
  async function check() {
    if (running || closed) return;
    running = true;
    try {
      const rows = await read();
      const next = new Map(rows.map(row => [row.id, `${row.revision}:${row.attached_at}`]));
      for (const keyId of new Set([...previous.keys(), ...next.keys()])) {
        const pluginId = providerPluginOf({ keyId });
        if (!closed && pluginId && previous.get(keyId) !== next.get(keyId)) await reapply({ pluginId });
      }
      previous = next;
    } catch { /* A transient project read must not terminate the site's polling loop. */ }
    finally { running = false; }
  }
  void check();
  const schedule = optional.schedule ?? ((run: () => Promise<void>, intervalMs: number) => {
    const timer = setInterval(() => void run(), intervalMs); timer.unref?.();
    return () => clearInterval(timer);
  });
  const cancel = schedule(check, 30_000);
  return () => { closed = true; cancel(); };
}
