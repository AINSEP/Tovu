/** Scan roots for the payload half of the staged-closure audit (`scripts/verify-staged-closure.ts`). */
import path from 'node:path';
import type { PackagingFilesystemPort } from '@jini-ai/devops/packaging/electron';

/** The composed agent-plugin root inside the payload's `dist/` (`build-server.mjs`). */
const AGENT_PLUGINS = path.join('content', 'agent-plugins');

/** A plugin's `skills/` folder: `content/agent-plugins/<id>/skills`. */
function isSkillFolder({ relative }: { relative: string }): boolean {
  return path.basename(relative) === 'skills' && path.dirname(path.dirname(relative)) === AGENT_PLUGINS;
}

/**
 * Every file under the payload's `dist/` except agent-plugin skill folders. A skill folder is
 * material an agent reads (SKILL.md, `examples/*.tsx` written against the reader's own project,
 * scripts the agent runs in its own workspace); the server never imports it, so its imports are not
 * runtime edges. Plugin tool modules beside it stay in scope: the server loads those by path.
 * @complexity O(entries) under `dist`; one stat per entry.
 */
export function payloadClosureScan({ dist }: { dist: string }, { fs }: { fs: Pick<PackagingFilesystemPort, 'entries' | 'stat'> }): string[] {
  const walk = (relative: string): string[] => {
    const absolute = path.join(dist, relative);
    if (fs.stat({ path: absolute }).kind !== 'directory') return [absolute];
    if (isSkillFolder({ relative })) return [];
    return fs.entries({ path: absolute }).flatMap(name => walk(path.join(relative, name)));
  };
  return walk('');
}
