import { describe, expect, it, vi } from 'vitest';
import type { DomainEvent } from '@/shared/events';
import { silentLogger } from '@/shared/logger';
import { createEventBus } from './event-bus';

function event(type: string): DomainEvent {
  return { type, occurredAt: new Date('2026-07-01T00:00:00.000Z') };
}

describe('createEventBus', () => {
  it('delivers an event to its subscriber', async () => {
    const bus = createEventBus(silentLogger);
    const received: DomainEvent[] = [];
    bus.subscribe('catalog.project_published', (e) => {
      received.push(e);
      return Promise.resolve();
    });

    await bus.publish(event('catalog.project_published'));

    expect(received).toHaveLength(1);
    expect(received[0]?.type).toBe('catalog.project_published');
  });

  it('delivers to every subscriber of the same type', async () => {
    const bus = createEventBus(silentLogger);
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);
    bus.subscribe('catalog.project_published', first);
    bus.subscribe('catalog.project_published', second);

    await bus.publish(event('catalog.project_published'));

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('does not deliver to subscribers of a different type', async () => {
    const bus = createEventBus(silentLogger);
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.subscribe('catalog.project_published', handler);

    await bus.publish(event('identity.user_verified'));

    expect(handler).not.toHaveBeenCalled();
  });

  it('publishing an event nobody subscribes to is not an error', async () => {
    const bus = createEventBus(silentLogger);
    await expect(bus.publish(event('nobody.listening'))).resolves.toBeUndefined();
  });

  it('isolates a failing handler so other subscribers still run', async () => {
    const bus = createEventBus(silentLogger);
    const failing = vi.fn().mockRejectedValue(new Error('subscriber exploded'));
    const healthy = vi.fn().mockResolvedValue(undefined);
    bus.subscribe('catalog.project_published', failing);
    bus.subscribe('catalog.project_published', healthy);

    await expect(bus.publish(event('catalog.project_published'))).resolves.toBeUndefined();
    expect(healthy).toHaveBeenCalledTimes(1);
  });

  it('logs a handler failure rather than swallowing it silently', async () => {
    const logged: string[] = [];
    const logger = { ...silentLogger, error: (m: string) => logged.push(m) };
    const bus = createEventBus(logger);
    bus.subscribe('catalog.project_published', () => Promise.reject(new Error('boom')));

    await bus.publish(event('catalog.project_published'));

    expect(logged).toContain('event handler failed');
  });
});
