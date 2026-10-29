import { ASSISTANT_CLI_CAPABILITIES, type AssistantCliCapability, type AssistantCliPermissions } from '../contracts/headless/index.js';

/** The master supplies defaults except personal MCP, which requires an explicit owner grant
 * (2026-10-23). Inherited MCP configuration stays excluded by default, even with CLI parity;
 * Tovu's staged MCP catalog remains available.
 * @param required - The master default and any explicit per-capability owner choices.
 * @returns A fresh, fixed-size permissions snapshot; pure, with no I/O or errors.
 * @complexity O(1) time/space for the fixed capability list.
 * @example assistantCliPermissions({ enabled: true, capabilities: { userMcp: true } }); */
export function assistantCliPermissions(required: { enabled: boolean; capabilities?: Partial<Record<AssistantCliCapability, boolean>> }, _optional = {}): AssistantCliPermissions {
  return { enabled: required.enabled, capabilities: Object.fromEntries(ASSISTANT_CLI_CAPABILITIES.map(({ key }) =>
    [key, required.capabilities?.[key] ?? (key === "userMcp" ? false : required.enabled)])) as Record<AssistantCliCapability, boolean> };
}
