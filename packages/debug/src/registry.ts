import type { Event } from "@synx/frp/event";
import type { Reactive } from "@synx/frp/reactive";

export type SpyTarget<A = unknown> = Event<A> | Reactive<A>;

export interface NodeDescriptor<A = unknown> {
  name: string;
  kind: "source" | "derived";
  target: SpyTarget<A>;
  /** Only present for source nodes (created with E.create) */
  emit?: (value: A) => void;
}

export class NodeRegistry {
  private nodes = new Map<string, NodeDescriptor>();

  register<A>(descriptor: NodeDescriptor<A>): void {
    if (this.nodes.has(descriptor.name)) {
      console.warn(
        `[synx/debug] Node "${descriptor.name}" is already registered. Overwriting.`
      );
    }
    this.nodes.set(descriptor.name, descriptor as NodeDescriptor);
  }

  get(name: string): NodeDescriptor | undefined {
    return this.nodes.get(name);
  }

  getAll(): NodeDescriptor[] {
    return Array.from(this.nodes.values());
  }

  has(name: string): boolean {
    return this.nodes.has(name);
  }

  clear(): void {
    this.nodes.clear();
  }
}

export const registry = new NodeRegistry();
