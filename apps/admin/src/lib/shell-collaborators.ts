/**
 * @file Tovu's bindings for the collaborators the `@jini-ai/admin` shell takes by injection
 * (ex5-fnd-kit review, rv-g FIX 1/3). Jini's shell imports no core implementation and writes no
 * console output; this file is where the admin app chooses them.
 */
import { orFallbackSync } from "@jini-ai/core/errors/idioms";
import { createConsoleLogger } from "@jini-ai/core/primitives";
import { browserStreamPorts, type BrowserStreamPorts } from "@jini-ai/admin/shell/lib/browser-stream";

/** The admin app's logger: core's console logger describes caught errors instead of printing them raw. */
export const adminLogger = createConsoleLogger({ prefix: "[admin]" });

/** Browser stream ports with the host's guarded call. A function, not a constant: the ports read
 *  `document`/`window`, which must not happen at module import. */
export function adminBrowserStreamPorts(_required = {}, _optional = {}): BrowserStreamPorts {
  return browserStreamPorts({ orFallbackSync });
}
