import { describe, expect, it } from 'vitest';
import { all, andThen, err, isErr, isOk, map, mapErr, ok, unwrapOr } from './result';

describe('ok', () => {
  it('wraps a value as a success', () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });

  it('supports a void success for operations with no return value', () => {
    expect(ok()).toEqual({ ok: true, value: undefined });
  });
});

describe('err', () => {
  it('wraps an error as a failure', () => {
    expect(err({ kind: 'not_owner' })).toEqual({ ok: false, error: { kind: 'not_owner' } });
  });
});

describe('isOk / isErr', () => {
  it('narrows a success to its value type', () => {
    const r = ok('hello');
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.toUpperCase()).toBe('HELLO');
  });

  it('narrows a failure to its error type', () => {
    const r = err({ kind: 'nope' as const });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe('nope');
  });
});

describe('map', () => {
  it('transforms a success value', () => {
    expect(map(ok(2), (n) => n * 3)).toEqual({ ok: true, value: 6 });
  });

  it('leaves a failure untouched', () => {
    const failure = err('boom');
    expect(map(failure, (n: number) => n * 3)).toBe(failure);
  });
});

describe('mapErr', () => {
  it('transforms an error', () => {
    expect(mapErr(err('boom'), (e) => `${e}!`)).toEqual({ ok: false, error: 'boom!' });
  });

  it('leaves a success untouched', () => {
    const success = ok(1);
    expect(mapErr(success, (e: string) => e)).toBe(success);
  });
});

describe('andThen', () => {
  it('chains an operation that succeeds', () => {
    expect(andThen(ok(4), (n) => ok(n + 1))).toEqual({ ok: true, value: 5 });
  });

  it('short-circuits on the first failure', () => {
    const first = err('first');
    expect(andThen(first, () => ok('never runs'))).toBe(first);
  });

  it('propagates a failure from the chained operation', () => {
    expect(andThen(ok(4), () => err('second'))).toEqual({ ok: false, error: 'second' });
  });
});

describe('unwrapOr', () => {
  it('returns the value on success', () => {
    expect(unwrapOr(ok('yes'), 'fallback')).toBe('yes');
  });

  it('returns the fallback on failure', () => {
    expect(unwrapOr(err<string>('boom') as never, 'fallback')).toBe('fallback');
  });
});

describe('all', () => {
  it('collects every value when all succeed', () => {
    expect(all([ok(1), ok(2), ok(3)])).toEqual({ ok: true, value: [1, 2, 3] });
  });

  it('returns the first failure and stops', () => {
    const results = [ok(1), err('bad'), ok(3)] as const;
    expect(all([...results])).toEqual({ ok: false, error: 'bad' });
  });

  it('succeeds with an empty list', () => {
    expect(all([])).toEqual({ ok: true, value: [] });
  });
});
