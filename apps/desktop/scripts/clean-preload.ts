/** Remove stale desktop compiler output before rebuilding; leave renderer assets intact.
 * Anchor paths to this script so a direct invocation from another cwd cannot delete unrelated files.
 * Filesystem errors propagate and stop the build. Node owns recursive removal on every OS.
 */
import { rmSync } from "node:fs";

for (const directory of ["preload", "contracts", "speech"]) {
  rmSync(new URL(`../dist/${directory}`, import.meta.url), { recursive: true, force: true });
}
