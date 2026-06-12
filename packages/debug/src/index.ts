// Layer 1: Spy (direct access, no registry needed)
export { spy, spyEvent, spyReactive } from "./spy";
export type { EventSpy, ReactiveSpy } from "./spy";

// Layer 2: Session (named-node testing with injection + tracing)
export { createSession } from "./session";
export type { TraceSession, SessionOptions } from "./session";

// Registry + label (for component-internal node access)
export { registry, NodeRegistry } from "./registry";
export type { NodeDescriptor, SpyTarget } from "./registry";
export { label, labelSource } from "./label";

// Trace + assertions
export type { TraceEntry } from "./trace";
export { formatTrace } from "./trace";
export type { NodeAssertion } from "./assertions";
