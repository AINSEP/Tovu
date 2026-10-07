import { existsSync } from "node:fs";
import { join } from "node:path";

/** D-22: advertise an existing thumbnail instead of making each browser probe jpg then png. */
export function themePreviewImage(
  { dir, id }: { dir: string; id: string },
  { assetsServed = true }: { assetsServed?: boolean } = {},
): string | null {
  // Public asset middleware mounts static and templated roots; a file in another tier is not a URL.
  if (!assetsServed) return null;
  for (const extension of ["jpg", "png"]) {
    if (existsSync(join(dir, "screenshots", `index.${extension}`))) {
      return `/theme-assets/${encodeURIComponent(id)}/screenshots/index.${extension}`;
    }
  }
  return null;
}
