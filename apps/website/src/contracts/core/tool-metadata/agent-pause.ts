import { createResumeAgentWorkMetadata } from "@jini-ai/core/tool-metadata/agent-pause";

export const toolMetadata = createResumeAgentWorkMetadata({
  toolId: "resume_agent_work",
  search: {
    keywords: "resume agent work paused assistant switch webhooks scheduled posts publishes hold release approve",
    queries: ["Resume the agent work that was paused.", "Release the paused scheduled posts and webhooks."],
  },
});
