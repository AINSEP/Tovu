// Dev preload: registers tsx for the source-mode (`.ts`) daemon, the same as `--import tsx`.
// It lives here, not as `createRequire(...).resolve("tsx")` in the supervisor, because tsx is a
// devDependency: the packaging guard reads that literal in the built server as a runtime import.
import "tsx";
