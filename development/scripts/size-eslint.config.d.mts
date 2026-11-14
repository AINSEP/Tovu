import type { Linter } from 'eslint';

export interface SizeException {
  repo: string;
  file: string;
  function?: string;
  identity?: string;
  reason: string;
}
export const sizeExceptions: { entries: SizeException[] };
export const sizeConfig: Linter.Config[];
declare const config: Linter.Config[];
export default config;
