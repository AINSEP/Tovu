import { createKit } from '@jini-ai/ui-kit/react';
import type { AgentAttrsPort } from '@jini-ai/ui-kit';
import { agentHandle } from '@jini-ai/agentic';
/** Jini owns the markup and classes; jini-media.css supplies the host presentation. */
export const tovuKit = createKit({}, { id: 'tovu' });

/** Map kit field metadata to the existing page driver's vocabulary.
 * @complexity O(1); pure attribute construction without service reads. */
export const tovuAgentAttrs: AgentAttrsPort = (required, optional = {}) => agentHandle(required, {
  ...optional, role: optional.role === 'select' ? 'field' : optional.role,
});

/* Adapter rationale retained from the previous bridge:
 * Native kit defaults to primary. Media's implicit Trash action used the host's
 * danger hierarchy; explicit module variants take precedence. Native menu items
 * now carry jini-btn-danger themselves.
 * settings-dialog styles div-based native containers with display:flex, which
 * overrides the browser's closed-dialog hiding rule. jini-media.css now scopes
 * the native closed-dialog safeguard to jini-dialog instead of data-jini-part.
 * extendKit's object API accepts component overrides; v1 has no classNames option.
 * Native leaves retain attrs/ref/behavior; the default kit now supplies the classes.
 */
