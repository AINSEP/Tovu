import { readProcessServerLogs } from "#src/platform/server-logs/index";
import type { ServerLogSourcePort } from "./read-server-logs.js";

/** This process's server log (the persisted file when configured, else the buffer) as a `ServerLogSourcePort`. */
export const processServerLogSource: ServerLogSourcePort = {
  read: () => readProcessServerLogs(),
};
