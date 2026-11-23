/** Types for `check-bundle-mounts.mjs`, so its tests typecheck under this package's strict config.
 *  The harness itself (and its types) is `@jini-ai/devops/checks/node`. */
import type { BundleScenarioOptions, BundleSmokeDom, BundleSmokeWindow } from '@jini-ai/devops/checks/node';

/** A scenario seen through this widget's jsdom page: real `Storage` and `Document`. */
export interface BundleScenario {
  name: string;
  seed?: (required: { storage: Storage }, options?: {}) => void;
  verify?: (required: { storage: Storage; document: Document; navigationAttempts: readonly string[] }, options?: {}) => void;
}
export const BUNDLE_PATH: string;
export const MOUNT_ID: string;
export const TRANSCRIPT_STORAGE_KEY: string;
export const ACTION_QUEUE_STORAGE_KEY: string;
export const PAGE_CONTENT_HTML: string;
/** The jsdom window as the harness sees it, with this page's real `Storage` and `Document`. */
export type JsdomSmokeWindow = BundleSmokeWindow & { readonly document: Document; readonly sessionStorage: Storage };
export function createJsdom(required: { html: string; url: string }, options?: {}): BundleSmokeDom<JsdomSmokeWindow>;
export const scenarios: BundleScenario[];
export function checkBundleMounts(input: { bundleSource: string }, options?: BundleScenarioOptions): Promise<void>;
export function main(
  input?: { bundlePath?: string },
  options?: {
    readText?: (file: string) => string;
    check?: (input: { bundleSource: string }) => Promise<void>;
    error?: (line: string) => void;
    exit?: (code: number) => void;
  },
): Promise<number>;
