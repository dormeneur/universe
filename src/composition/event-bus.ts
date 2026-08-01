import type { DomainEvent, EventBus, EventHandler } from '@/shared/events';
import type { Logger } from '@/shared/logger';

/**
 * In-process, synchronous event bus.
 *
 * A single deployable does not need a broker: handlers run in the publisher's
 * call stack and therefore inside its transaction, which is exactly the
 * consistency guarantee we want when `discovery` reindexes after `catalog`
 * publishes a project.
 *
 * A handler that throws is logged and does not prevent the remaining handlers
 * from running. The alternative — letting one subscriber's failure abort the
 * publisher — would couple modules through their failure modes, which is the
 * coupling events exist to remove. Handlers that must not fail silently should
 * record their own failure state.
 */
export function createEventBus(logger: Logger): EventBus {
  const handlers = new Map<string, EventHandler[]>();

  return {
    subscribe<E extends DomainEvent>(type: E['type'], handler: EventHandler<E>): void {
      const existing = handlers.get(type) ?? [];
      existing.push(handler as EventHandler);
      handlers.set(type, existing);
    },

    async publish(event: DomainEvent): Promise<void> {
      const subscribers = handlers.get(event.type) ?? [];
      logger.debug('event published', { type: event.type, subscribers: subscribers.length });

      for (const handler of subscribers) {
        try {
          await handler(event);
        } catch (error) {
          logger.error('event handler failed', {
            type: event.type,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    },
  };
}
