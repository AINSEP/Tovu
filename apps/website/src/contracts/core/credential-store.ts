import { ToolInputError } from '@jini-ai/core';

/** A safe create conflict that each credential domain can map onto its existing form error. */
export class ProjectKeyCreateConflictError extends ToolInputError {
  constructor(_required: Record<string, never>, _options = {}) {
    super({ message: 'Shared Keys already has this key identity or label. Choose Use a saved key, or give the new key a different label. Details: P25_KEY_CREATE_CONFLICT; secret values omitted.' });
  }
}
