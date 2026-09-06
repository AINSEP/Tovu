/**
 * `ProjectGrid.tsx`'s derived logic.
 *
 * Both functions below arrived from Tovu-Runner inside `ProjectGrid.tsx` itself. This repo keeps
 * functions and derived logic out of `.tsx` files — components render, a sibling `*.hooks.ts` owns
 * everything they derive — which is the same rule `App.tsx`/`App.hooks.ts` already follow. Moving
 * them also makes them directly assertable without mounting the grid: neither touches React,
 * `window`, or IPC, so a test can call them on a plain `ProjectRecord`.
 */
import type { ProjectRecord } from '../contracts/project.js';

/**
 * Whether clicking a project's card should open it.
 *
 * Nothing to open yet mid-provision — `tovu init` hasn't produced a workspace to serve. A card
 * asking whether to delete itself is not an open target either: the click that dismisses the
 * wrong answer must not also open the project.
 *
 * @complexity O(1) time, O(1) space.
 */
export function isCardOpenable(project: ProjectRecord, confirming: boolean): boolean {
  return project.status !== 'provisioning' && project.status !== 'blocked' && !confirming;
}

/**
 * The human-readable name for whichever database a project was provisioned against. A `custom`
 * provider carries its own operator-supplied `label`; the fallback names the category rather than
 * leaving the card's metadata row blank.
 *
 * @complexity O(1) time, O(1) space.
 */
export function databaseLabel(project: ProjectRecord): string {
  if (project.database.kind === 'supabase') return 'Supabase';
  if (project.database.kind === 'custom') return project.database.label ?? 'Custom DB provider';
  return 'SQLite';
}
