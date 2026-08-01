import { describe, expect, it } from 'vitest';
import { assertNever, forbidden, invariant, InvariantViolation, notFound } from './errors';

describe('error constructors', () => {
  it('builds a not-found error carrying the entity and id', () => {
    expect(notFound('Project', 'p1')).toEqual({ kind: 'not_found', entity: 'Project', id: 'p1' });
  });

  it('builds a forbidden error carrying the reason', () => {
    expect(forbidden('not the owner')).toEqual({ kind: 'forbidden', reason: 'not the owner' });
  });
});

describe('invariant', () => {
  it('passes silently when the condition holds', () => {
    expect(() => invariant(true, 'should not throw')).not.toThrow();
  });

  it('throws InvariantViolation when the condition fails', () => {
    expect(() => invariant(false, 'user must exist')).toThrow(InvariantViolation);
    expect(() => invariant(false, 'user must exist')).toThrow('user must exist');
  });

  it('narrows the asserted value for the compiler', () => {
    const maybe: string | undefined = 'present';
    invariant(maybe, 'expected a value');
    expect(maybe.toUpperCase()).toBe('PRESENT');
  });
});

describe('assertNever', () => {
  it('throws when an unexpected variant reaches it at runtime', () => {
    // Casting is the point: this simulates a value arriving from outside the
    // type system, which is the case assertNever exists to catch.
    expect(() => assertNever('surprise' as never)).toThrow(InvariantViolation);
  });
});
