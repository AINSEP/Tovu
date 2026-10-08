/** Host settings API binding. The shared ledger read/diff-write rules live in @jini-ai/admin/core. */
import {
  loadNamespaceValues as loadValues, saveChangedEntries as saveEntries,
  readString as stringValue, readBoolean as booleanValue, readNumber as numberValue,
  type AdminSettingsPort, type LedgerCandidate,
} from "@jini-ai/admin/core";
import { api, ApiError, type SettingScope } from "./api";
export type { LedgerEntry, LedgerCandidate } from "@jini-ai/admin/core";
const ledgerPort: Pick<AdminSettingsPort, "getSettingsEffective" | "setSetting"> = {
  getSettingsEffective: async (input) => (await api.getSettingsEffective(input)).data,
  setSetting: ({ namespace, key, scope, value }) => api.setSetting({ namespace, key, scope, valueJson: value }),
};
/** Preserve the API error boundary: only an unregistered namespace reads as empty, never transport failures. */
export function loadNamespaceValues(namespace: string): Promise<Map<string, unknown>> {
  return loadValues({ namespace, port: ledgerPort }, { isUnregisteredNamespace: ({ error }) => error instanceof ApiError && error.status === 404 });
}
/** Sequential diff writes retain the server's single settings transaction boundary. */
export function saveChangedEntries(namespace: string, scope: SettingScope, candidates: readonly LedgerCandidate[]): Promise<readonly string[]> {
  return saveEntries({ namespace, scope, candidates, port: ledgerPort }, {});
}
export function readString(values: Map<string, unknown>, key: string, fallback: string): string {
  return stringValue({ values, key, fallback }, {});
}
export function readBoolean(values: Map<string, unknown>, key: string, fallback: boolean): boolean {
  return booleanValue({ values, key, fallback }, {});
}
export function readNumber(values: Map<string, unknown>, key: string, fallback: number): number {
  return numberValue({ values, key, fallback }, {});
}
