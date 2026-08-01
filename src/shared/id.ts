import { ulid } from 'ulid';

/**
 * ID generation is injected for the same reason time is: a use case that
 * generates its own IDs produces different output on every run, so tests can
 * only assert on shape rather than value.
 */
export interface IdGenerator {
  next(): string;
}

/**
 * ULIDs rather than UUIDv4: they sort lexicographically by creation time, so
 * a plain `ORDER BY id` gives chronological order and primary-key indexes
 * stay append-friendly instead of scattering writes across the B-tree.
 */
export const ulidGenerator: IdGenerator = {
  next: () => ulid(),
};

/**
 * Nominal typing for identifiers.
 *
 * `UserId` and `ProjectId` are both strings at runtime, but branding them
 * makes `publish(projectId, userId)` a compile error when the arguments are
 * swapped — a mistake that is otherwise invisible until production.
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };
