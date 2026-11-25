/**
 * @file The bounded launch fields an admin AG-UI start may carry beside its durable identity:
 * attachment refs, plugin refs, model and reasoning, the same fields the direct Local CLI start
 * puts in its `contextRef`. The browser sends them under `forwardedProps.durableRun.launch`; this
 * parser is the server's one bounded read of them. Everything else the browser could claim
 * (principal, recovery mode or session, page context) is deliberately not read here.
 */
const MAX_REFS = 32;
const MAX_REF_LENGTH = 512;
const MAX_SETTING_LENGTH = 200;

export interface AgUiLaunchFields {
  readonly attachmentIds?: readonly string[];
  readonly pluginRefIds?: readonly string[];
  readonly model?: string;
  readonly reasoning?: string;
}

/** Non-empty, bounded string entries only; a malformed field degrades to absent, as the run-start
 *  decoder does for the same fields. */
function readRefs({ value }: { value: unknown }, _optional = {}): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const refs = value.filter((ref): ref is string => typeof ref === "string" && ref.length > 0 && ref.length <= MAX_REF_LENGTH).slice(0, MAX_REFS);
  return refs.length > 0 ? refs : undefined;
}

function readSetting({ value }: { value: unknown }, _optional = {}): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_SETTING_LENGTH ? value : undefined;
}

/** @complexity O(MAX_REFS). */
export function readAgUiLaunchFields({ durable }: { durable: unknown }, _optional = {}): AgUiLaunchFields {
  const launch = typeof durable === "object" && durable !== null ? (durable as { launch?: unknown }).launch : undefined;
  if (typeof launch !== "object" || launch === null) return {};
  const raw = launch as Record<string, unknown>;
  const attachmentIds = readRefs({ value: raw.attachmentIds });
  const pluginRefIds = readRefs({ value: raw.pluginRefIds });
  const model = readSetting({ value: raw.model });
  const reasoning = readSetting({ value: raw.reasoning });
  return { ...(attachmentIds ? { attachmentIds } : {}), ...(pluginRefIds ? { pluginRefIds } : {}), ...(model ? { model } : {}), ...(reasoning ? { reasoning } : {}) };
}
