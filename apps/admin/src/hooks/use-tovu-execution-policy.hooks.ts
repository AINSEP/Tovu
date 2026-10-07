import { useEffect, useRef, useState } from 'react';
import type { ExecutionConfig } from '@jini-ai/ui';
import { api, type AdminDeploymentOverview } from '@/lib/api';
import { effectiveExecutionConfig, localCliAllowed, preserveSavedExecutionMode, DEPLOYED_LOCAL_CLI_NOTE } from '@/lib/tovu-execution-policy';
import { isDesktopAdmin } from '@/features/settings/ai-agent-presentation';
import { t } from '@/features/settings/settings-execution-i18n';
import '@/styles/local-cli-policy.css';

type RuntimeSnapshot = Pick<AdminDeploymentOverview, 'mode'>;

/** Tovu's deployment policy shared by every execution entry point; all host IO is injectable.
 * A failed read leaves the gate closed. Cleanup prevents a late response changing another mount.
 * No execution-setting write occurs here: the displayed fallback is not a preference migration. */
export function useTovuExecutionPolicy(
  { config, locale }: { config: ExecutionConfig; locale: string },
  { desktop = isDesktopAdmin({}), loadRuntime = api.getDeploymentOverview }: {
    desktop?: boolean; loadRuntime?: () => Promise<RuntimeSnapshot>;
  } = {},
) {
  const [mode, setMode] = useState<RuntimeSnapshot['mode']>();
  const loader = useRef(loadRuntime);
  const pending = useRef<Promise<RuntimeSnapshot | undefined> | null>(null);
  useEffect(() => {
    if (desktop) return;
    let live = true;
    pending.current = loader.current().then(
      (snapshot) => { if (live) setMode(snapshot.mode); return snapshot; },
      () => undefined, // Unknown capability stays hidden; a reload can retry discovery.
    );
    return () => { live = false; };
  }, [desktop]);
  const allowed = localCliAllowed({ mode, desktop });
  const effective = effectiveExecutionConfig({ config, allowed });
  return {
    allowed,
    config: effective,
    readAllowedForSend: async () => {
      const snapshot = await pending.current;
      return localCliAllowed({ mode: snapshot?.mode ?? mode, desktop });
    },
    visibility: allowed ? 'available' : 'hidden',
    note: !allowed && mode === 'production' && config.mode === 'local-cli' ? t(locale, DEPLOYED_LOCAL_CLI_NOTE) : null,
    // The shared tab reports its entire projected config on every field edit. Restore only mode.
    preserveChange: (next: ExecutionConfig) => preserveSavedExecutionMode({ saved: config, next, allowed }),
    subtitleKey: allowed ? 'Choose Local CLI or BYOK.' : 'Use your own API credentials',
  };
}
