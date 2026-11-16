import { PAGE_CAPABILITIES, executePageCapability, type PageDriver } from '@jini-ai/agentic';
import type { ChatPagePort } from '@jini-ai/chat/react';

/** Tovu binds chat's page port to the DOM driver; chat only forwards requests and never calls driver methods. */
export function pagePortFromDriver(required: { driver: PageDriver }, _optional: Record<string, never> = {}): ChatPagePort {
  return {
    capabilityIds: PAGE_CAPABILITIES.map((capability) => capability.id),
    execute: (args, optional) => executePageCapability({ driver: required.driver, ...args }, optional),
  };
}
