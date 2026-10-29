import type { SettingsRepoPort } from '@jini-ai/core/settings';
export type { OperatorLocaleDeps } from './plugin-host.js';

/** Structural signature of `@jini-ai/core/settings`'s `getEffective`, narrowed to what is read here. */
export type GetEffectiveSetting = (
  deps: { repo: SettingsRepoPort },
  input: { namespace: string; key: string; scopeContext: { workspaceId: string; principalId: string } },
) => Promise<{ value: unknown } | null>;
