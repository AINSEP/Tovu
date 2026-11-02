// Dev preload: registers tsx for the source-mode (`.ts`) daemon and the desktop shell's source-mode
// CLI child (`apps/desktop/src/tovu-server.ts`), the same as `--import tsx`.
// It lives here, not as `createRequire(...).resolve("tsx")` in the supervisor, because tsx is a
// devDependency: the packaging guards read that literal in the built server (and the asar) as a runtime import.
import "tsx";
