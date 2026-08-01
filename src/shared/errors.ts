/**
 * Error vocabulary shared across modules.
 *
 * Module-specific failures are declared as typed unions in that module's
 * `domain/` — these are only the shapes that genuinely recur everywhere.
 * Every error carries a `kind` discriminant so `switch` statements over them
 * can be checked for exhaustiveness by the compiler.
 */

export type NotFoundError = {
  readonly kind: 'not_found';
  readonly entity: string;
  readonly id: string;
};

export type ForbiddenError = {
  readonly kind: 'forbidden';
  readonly reason: string;
};

export type InvalidInputError = {
  readonly kind: 'invalid_input';
  readonly issues: readonly string[];
};

/** Failures that recur across every module. */
export type CommonError = NotFoundError | ForbiddenError | InvalidInputError;

export function notFound(entity: string, id: string): NotFoundError {
  return { kind: 'not_found', entity, id };
}

export function forbidden(reason: string): ForbiddenError {
  return { kind: 'forbidden', reason };
}

export function invalidInput(issues: readonly string[]): InvalidInputError {
  return { kind: 'invalid_input', issues };
}

/**
 * Thrown when a condition that should be impossible turns out not to be —
 * a missing environment variable, a corrupt row, a violated invariant.
 *
 * These are bugs. They should crash loudly and get fixed, not be caught and
 * converted into a `Result`, which would hide them.
 */
export class InvariantViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvariantViolation';
  }
}

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new InvariantViolation(message);
}

/**
 * Exhaustiveness guard for discriminated unions.
 *
 * Put it in a `default:` branch and the compiler will reject the switch when
 * a new variant is added, pointing you at every place that needs updating.
 */
export function assertNever(value: never, message = 'Unexpected variant'): never {
  throw new InvariantViolation(`${message}: ${JSON.stringify(value)}`);
}
