import type { IdGenerator } from '../id';

/**
 * Deterministic IDs, so a use case test can assert on the exact value it
 * persisted rather than merely on its shape.
 */
export function sequentialIds(prefix = 'id'): IdGenerator {
  let n = 0;
  return {
    next: () => `${prefix}-${++n}`,
  };
}

/** Returns the same ID every time, for tests that only need one. */
export function fixedId(value: string): IdGenerator {
  return { next: () => value };
}
