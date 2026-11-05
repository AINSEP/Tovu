import { createExternalMcpConnectionGate } from "../external-mcp-oauth.js";

// Every composition must wire the activation owner; omission must fail typechecking.
type GateDeps = Parameters<typeof createExternalMcpConnectionGate>[0];
const activationCheckIsOptional: {} extends Pick<GateDeps, "isPluginEnabled"> ? true : false = false;
void activationCheckIsOptional;
