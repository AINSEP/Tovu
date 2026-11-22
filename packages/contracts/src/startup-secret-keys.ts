/** Launch-credential names a desktop launcher hands a site server: an installation compatibility surface (an older installed launcher still sends exactly these names). */
export const STARTUP_SECRET_KEYS = ['TOVU_AGENT_DAEMON_TOKEN', 'TOVU_TOOL_EXEC_TOKEN', 'JINI_DESKTOP_RENDER_TOKEN',
  'TOVU_ADMIN_PASSWORD', 'TOVU_DESKTOP_MCP_TOKEN', 'TOVU_DESKTOP_MCP_HANDOFF_TOKEN'] as const;
/** Distinguishes a desktop control owner from a standalone launcher that only offers startup IPC. */
export const DESKTOP_AGENT_SERVICE_ENV = 'TOVU_DESKTOP_AGENT_SERVICE';
