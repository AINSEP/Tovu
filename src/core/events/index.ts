/**
 * Barrel exports for core event infrastructure.
 */
export { InMemoryEventBus, InMemoryOutbox } from "./memory-bus.js";
export { processOutbox } from "./outbox-worker.js";
