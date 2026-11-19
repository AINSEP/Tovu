import { isReservedThemePreviewPath } from "./preview-policy.js";
import { rescanThemes } from "./theme-discovery.js";

export const themeRosterPorts = { isReservedPath: isReservedThemePreviewPath, rescan: rescanThemes };
