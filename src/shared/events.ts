/**
 * Cross-module side effects travel as events so the emitter never learns who
 * cares. `catalog` publishes `catalog.project_published`; whether `discovery`
 * reindexes and `moderation` scans is not `catalog`'s business.
 *
 * Event names are namespaced by their owning module, and each module exports
 * its own payload types from `index.ts`. The concrete bus lives in
 * `composition/` — it is in-process and synchronous, which is the right amount
 * of infrastructure for a single deployable.
 */

export interface DomainEvent {
  readonly type: string;
  readonly occurredAt: Date;
}

export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
}

export type EventHandler<E extends DomainEvent = DomainEvent> = (event: E) => Promise<void>;

export interface EventSubscriber {
  subscribe<E extends DomainEvent>(type: E['type'], handler: EventHandler<E>): void;
}

export type EventBus = EventPublisher & EventSubscriber;
