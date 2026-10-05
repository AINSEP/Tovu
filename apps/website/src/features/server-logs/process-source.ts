import { getServerLogBuffer, isServerLogCaptureInstalled } from "#src/platform/server-logs/index";
import type { ServerLogSourcePort } from "./read-server-logs.js";

/** This process's captured console buffer as a `ServerLogSourcePort`. */
export const processServerLogSource: ServerLogSourcePort = {
  entries: () => getServerLogBuffer().entries(),
  isCapturing: isServerLogCaptureInstalled,
};
