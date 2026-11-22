/**
 * Compatibility entry point for the unified production complexity ratchet.
 *
 * Admin's former file-level allowance hid new functions in grandfathered files;
 * the shared checker tracks each violation separately and keeps admin at 9/9.
 * Tests and measurements remain outside the production ceiling. Historical debt
 * notes are preserved in complexity-debt-history.md.
 */
import { pathToFileURL } from "node:url";
import { main } from "./check-src-complexity-drift.js";

export { findViolations } from "./check-src-complexity-drift.js";

// Keep imports side-effect-free, just as the previous admin checker did.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
