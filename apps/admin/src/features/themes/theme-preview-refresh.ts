import { WORKSPACE_ID } from "@/lib/api";
/** Theme-only notification seam. Each admin document belongs to one site; SSE is workspace-scoped. */
export interface ThemePreviewRefresh {
  revision: string;
  path?: string;
}
const listeners = new Set<(frame: ThemePreviewRefresh) => void>();
export function publishThemePreviewRefresh(
  frame: ThemePreviewRefresh,
  _optional: Record<string, never> = {},
): void {
  if (!/^[\w-]{1,100}$/.test(frame.revision)) return;
  for (const listener of [...listeners]) listener(frame);
}
export function subscribeThemePreviewRefresh(
  { listener }: { listener: (frame: ThemePreviewRefresh) => void },
  _optional: Record<string, never> = {},
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function resetThemePreviewRefresh(): void {
  listeners.clear();
}

/** A directory prefix keeps CSS imports and JS modules in the fresh asset namespace too. */
export function freshPreviewUrl(
  { url, revision, path }: { url: string; revision: string; path?: string },
  _optional: Record<string, never> = {},
): string {
  if (!url) return url;
  const absolute = /^[a-z][a-z\d+.-]*:/i.test(url);
  const parsed = new URL(url, "https://preview.invalid");
  const target = path === undefined ? parsed : new URL(path, parsed);
  target.pathname = target.pathname.replace(
    /^\/theme-assets\//,
    `/theme-preview-assets/${encodeURIComponent(revision)}/`,
  );
  target.searchParams.set("__tovu_preview", revision);
  return absolute ? target.href : `${target.pathname}${target.search}${target.hash}`;
}

/** Manual refresh uses the same durable marker as the tools, so other tabs receive it over SSE. */
export async function reloadThemePreviews(
  {
    request = () =>
      fetch(`/api/admin/v1/workspaces/${encodeURIComponent(WORKSPACE_ID)}/themes/preview-reload`, {
        method: "POST",
        credentials: "include",
      }),
  }: { request?: () => Promise<Response> } = {},
  _optional: Record<string, never> = {},
): Promise<void> {
  // Refresh immediately even if an older backend does not expose the signal endpoint yet.
  publishThemePreviewRefresh({ revision: crypto.randomUUID() });
  const response = await request();
  if (!response.ok) throw new Error("preview reload failed");
  publishThemePreviewRefresh((await response.json()) as ThemePreviewRefresh);
}
