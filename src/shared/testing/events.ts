import type { DomainEvent, EventPublisher } from '../events';

/**
 * Captures published events so a use case test can assert on the effects it
 * announced, without wiring real subscribers.
 *
 * Asserting on published events rather than on subscriber side effects keeps
 * the test focused on the unit under test — and keeps it passing when a new
 * subscriber is added later.
 */
export class RecordingEventPublisher implements EventPublisher {
  readonly published: DomainEvent[] = [];

  publish(event: DomainEvent): Promise<void> {
    this.published.push(event);
    return Promise.resolve();
  }

  ofType<E extends DomainEvent>(type: E['type']): E[] {
    return this.published.filter((e): e is E => e.type === type);
  }

  clear(): void {
    this.published.length = 0;
  }
}
