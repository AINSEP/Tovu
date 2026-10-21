/** Types for `check-bundle-mounts.mjs`, so its tests typecheck under this package's strict config. */
export interface BundleScenario {
  name: string;
  seed?: (storage: Storage) => void;
  verify?: (storage: Storage, document: Document, navigationAttempts: string[]) => void;
}
export interface ScenarioOptions { settleMs?: number; log?: (line: string) => void }
export const BUNDLE_PATH: string;
export const MOUNT_ID: string;
export const TRANSCRIPT_STORAGE_KEY: string;
export const ACTION_QUEUE_STORAGE_KEY: string;
export class BundleCheckError extends Error {}
export function fail(message: string): never;
export function isNavigationError(error: unknown): boolean;
export function runScenario(input: { scenario: BundleScenario; bundleSource: string }, options?: ScenarioOptions): Promise<void>;
export const scenarios: BundleScenario[];
export function checkBundleMounts(input: { bundleSource: string }, options?: ScenarioOptions): Promise<void>;
export function main(
  input?: { bundlePath?: string },
  options?: {
    readText?: (file: string) => string;
    check?: (input: { bundleSource: string }) => Promise<void>;
    error?: (line: string) => void;
    exit?: (code: number) => void;
  },
): Promise<number>;
export function isEntryPoint(input: { moduleUrl: string; argv1: string | undefined }): boolean;
