/** Types for `measure-bundles.mjs`, so its tests typecheck under this package's strict config. */
export interface BundleRow { asset: string; raw: number; gzip: number }
export const ASSETS: string[];
export const BUNDLE_TOTALS: [string, string[]][];
export const LOADER_GZIP_BUDGET: number;
export function measureBundles(input: { read: (name: string) => Uint8Array }): BundleRow[];
export function assertLoaderBudget(input: { rows: BundleRow[] }): void;
export function main(
  input?: { distDir?: string },
  options?: { readFile?: (file: string) => Uint8Array; table?: (rows: BundleRow[]) => void },
): BundleRow[];
export function isEntryPoint(input: { moduleUrl: string; argv1: string | undefined }): boolean;
