import type { AgentToolDefinition } from "@jini-ai/core";
import { VISITOR_TOOLS_PERMISSION } from "../../contracts/site-assistant/visitor-tools.js";

/** Four category tools from the approved review; saved-request mutations stay deferred to T4. */
export const visitorToolsAgentCatalog: AgentToolDefinition[] = [
  { name: "visitor_tools_list", sideEffects: "none", authorization: { permission: VISITOR_TOOLS_PERMISSION },
    description: "List the site's visitor-eligible built-in, plugin and created tools, their modes, limits and availability. Call before changing visitor tools. Returns {revisionSeq, defaults, callsPerTurn, tools}; unknown/unreviewed admin tools cannot be enabled. Requires visitor-tools.manage. Storage failures refuse the list.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} } },
  { name: "visitor_tool_configure", sideEffects: "mutates-durable-state", authorization: { permission: VISITOR_TOOLS_PERMISSION },
    description: "Change visitor tool mode (auto, ask, off) and/or limits using the latest visitor_tools_list revisionSeq as expectedRevisionSeq. toolId is a listed id or site for all currently available tools. Returns the same complete view as visitor_tools_list. Off, reductions and built-in public read modes run directly; increasing mode rank (off < ask < auto) on plugin/created or non-read tools, or raising limits above defaults, needs a fresh human card every time. Auto to Ask reduces exposure and runs directly. If policyState is invalid, only site mode off (without limits) can reset it, with no card. Stale revisions require a new list and retry, including a new card when applicable. Ask is stored but does not execute until T3. Requires visitor-tools.manage. Unknown ids/fields and invalid limits are refused.",
    inputSchema: { type: "object", additionalProperties: false, required: ["toolId", "expectedRevisionSeq"], properties: {
      toolId: { type: "string", pattern: "^[a-z][a-z0-9_]{0,127}$" }, expectedRevisionSeq: { type: "integer", minimum: 0 },
      mode: { type: "string", enum: ["auto", "ask", "off"] },
      limits: { type: "object", additionalProperties: false, minProperties: 1, properties: {
        perIpPerHour: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
        perSitePerDay: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
      } },
    } } },
  { name: "visitor_tool_save", sideEffects: "none", authorization: { permission: VISITOR_TOOLS_PERMISSION },
    description: "Reserved for T4: creating/updating declarative saved-request visitor tools is unavailable in this phase. Returns {available:false, code:VISITOR_TOOLS_T4_REQUIRED}; writes nothing. Use visitor_tool_configure for modes/limits of listed tools. Requires visitor-tools.manage.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} } },
  { name: "visitor_tool_delete", sideEffects: "none", authorization: { permission: VISITOR_TOOLS_PERMISSION },
    description: "Reserved for T4: permanently deleting created visitor tools is unavailable in this phase. Returns {available:false, code:VISITOR_TOOLS_T4_REQUIRED}; deletes nothing. Use visitor_tool_configure mode off to disable a tool. T4 will require permanent-delete confirmation. Requires visitor-tools.manage.",
    inputSchema: { type: "object", additionalProperties: false, required: ["toolId"], properties: { toolId: { type: "string", minLength: 1 } } } },
];
