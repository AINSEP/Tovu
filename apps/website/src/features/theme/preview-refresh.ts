import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ToolInputError } from "@jini-ai/core";

/** Site-local notification shared by the website and agent daemon. No theme content or credentials. */
export interface ThemePreviewRefresh {
  revision: string;
  path?: string;
}
const MARKER = ".preview-refresh.json";

export function validatePreviewPath(
  { path }: { path: string },
  _optional: Record<string, never> = {},
): string {
  const reject = () => {
    throw new ToolInputError({ message: "path must be a site-relative public URL starting with /" });
  };
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u0020]/.test(path)) return reject();
  let decoded: string;
  try {
    decoded = decodeURIComponent(path.split(/[?#]/, 1)[0]);
  } catch {
    return reject();
  }
  if (/\\|^\/\/|(?:^|\/)\.\.(?:\/|$)/.test(decoded)) return reject();
  const pathname = new URL(path, "https://preview.invalid").pathname;
  if (/^\/(?:api|admin)(?:\/|$)/i.test(decoded) || /^\/(?:api|admin)(?:\/|$)/i.test(pathname))
    return reject();
  return path;
}

/** Atomic replacement: a feed in another process never reads half a frame. UUIDs avoid clock collisions. */
export function requestThemePreviewRefresh(
  { themesDir }: { themesDir: string },
  { path, revision = randomUUID() }: { path?: string; revision?: string } = {},
): ThemePreviewRefresh {
  const frame: ThemePreviewRefresh = {
    revision,
    ...(path === undefined ? {} : { path: validatePreviewPath({ path }) }),
  };
  mkdirSync(themesDir, { recursive: true });
  const temporary = join(themesDir, `${MARKER}.${randomUUID()}.tmp`);
  writeFileSync(temporary, JSON.stringify(frame), { mode: 0o600 });
  renameSync(temporary, join(themesDir, MARKER));
  return frame;
}

export function readThemePreviewRefresh(
  { themesDir }: { themesDir: string },
  _optional: Record<string, never> = {},
): ThemePreviewRefresh | null {
  try {
    const frame = JSON.parse(readFileSync(join(themesDir, MARKER), "utf8")) as ThemePreviewRefresh;
    if (typeof frame.revision !== "string" || !/^[\w-]{1,100}$/.test(frame.revision)) return null;
    if (frame.path !== undefined) validatePreviewPath({ path: frame.path });
    return frame;
  } catch {
    return null;
  }
}

/** A newly opened preview is already fresh; only later durable writes cause another load. */
export function createThemePreviewFeed(
  { read, emit }: { read: () => ThemePreviewRefresh | null; emit: (frame: ThemePreviewRefresh) => void },
  { resumeRevision }: { resumeRevision?: string } = {},
): () => void {
  let previous = resumeRevision ?? read()?.revision;
  return () => {
    const frame = read();
    if (!frame || frame.revision === previous) return;
    emit(frame);
    previous = frame.revision;
  };
}
