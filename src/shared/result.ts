/**
 * Expected failures are values, not exceptions.
 *
 * A caller reading a signature should be able to see every way the call can
 * fail, and the failure paths get the same type-checking as the happy path.
 * `try/catch` around business logic hides both. `throw` is reserved for bugs
 * — see `invariant` in ./errors.
 */

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export function ok(): Ok<void>;
export function ok<T>(value: T): Ok<T>;
export function ok<T>(value?: T): Ok<T | undefined> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(r: Result<T, E>): r is Ok<T> {
  return r.ok;
}

export function isErr<T, E>(r: Result<T, E>): r is Err<E> {
  return !r.ok;
}

/** Transform the success value, leaving a failure untouched. */
export function map<T, U, E>(r: Result<T, E>, f: (value: T) => U): Result<U, E> {
  return r.ok ? ok(f(r.value)) : r;
}

/** Transform the error, leaving a success untouched. */
export function mapErr<T, E, F>(r: Result<T, E>, f: (error: E) => F): Result<T, F> {
  return r.ok ? r : err(f(r.error));
}

/**
 * Chain an operation that can itself fail. Error types accumulate in the
 * union, so a caller still sees every failure mode.
 */
export function andThen<T, U, E, F>(
  r: Result<T, E>,
  f: (value: T) => Result<U, F>,
): Result<U, E | F> {
  return r.ok ? f(r.value) : r;
}

export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T {
  return r.ok ? r.value : fallback;
}

/**
 * Collect many results into one. Fails on the first error, which is what you
 * want when validating a batch that must succeed as a unit.
 */
export function all<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const r of results) {
    if (!r.ok) return r;
    values.push(r.value);
  }
  return ok(values);
}
