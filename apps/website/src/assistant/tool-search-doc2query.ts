import { nativeToolMetadata } from '../contracts/core/tool-metadata/index.js';
/**
 * @file BLIND doc2query output — 5 synthetic questions per tool, generated 2026-08-05 by a fresh
 * subagent (Claude Sonnet 5, general-purpose) given ONLY the 131-tool id+description catalog. It
 * never saw `tool-search-quality.eval.ts`'s `HELD_OUT_CASES` or any eval file, and was explicitly
 * instructed not to search for one.
 *
 * This replaces an earlier same-day attempt where the dispatching agent (having already read the
 * held-out set to build other canaries) wrote the questions itself and produced several
 * near-verbatim lifts of held-out query text — see the "Canary 1" section of
 * `ADS-memory/reports/analysis/2026-08-05-tool-search-canaries.md` for the full contamination
 * writeup. This file is the honest redo. Scored by `tool-search-doc2query-canary.eval.ts`.
 * Phase 16 retains every question with its owning registration contract and projects this view.
 */
export const DOC2QUERY: Readonly<Record<string, readonly string[]>> = nativeToolMetadata.queries;
