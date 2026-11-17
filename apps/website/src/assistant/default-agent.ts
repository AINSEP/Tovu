/**
 * The agent a run uses when its request names none. One definition: the daemon scope, the daemon
 * core RPC and the assistant tool executor all fall back to it, so the default can never differ
 * between where a run is started and where its session or launch limits are looked up.
 */
export const DEFAULT_AGENT_ID = "claude";
