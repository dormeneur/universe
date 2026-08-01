import type { Clock } from '@/shared/clock';
import { err, ok, type Result } from '@/shared/result';
import { isPlausibleGradYear, type User, type UserId } from '../domain/user';
import type { UserReader, UserWriter } from './ports/user-repository';

export const MAX_DISPLAY_NAME_LENGTH = 60;

export type OnboardingInput = {
  readonly userId: UserId;
  readonly displayName: string;
  readonly gradYear: number;
};

export type OnboardingError =
  | { readonly kind: 'user_not_found' }
  | { readonly kind: 'display_name_empty' }
  | { readonly kind: 'display_name_too_long' }
  | { readonly kind: 'grad_year_implausible' };

/**
 * Captures the details deliberately not asked for at sign-up.
 *
 * Re-runnable rather than one-shot: a student who mistypes their graduation
 * year should be able to correct it, and because the role is derived from that
 * year rather than stored, the correction takes effect immediately.
 */
export function makeCompleteOnboarding(deps: { users: UserReader & UserWriter; clock: Clock }) {
  return async function completeOnboarding(
    input: OnboardingInput,
  ): Promise<Result<User, OnboardingError>> {
    const user = await deps.users.byId(input.userId);
    if (!user) return err({ kind: 'user_not_found' });

    const displayName = input.displayName.trim().replace(/\s+/g, ' ');
    if (displayName.length === 0) return err({ kind: 'display_name_empty' });
    if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
      return err({ kind: 'display_name_too_long' });
    }

    if (!isPlausibleGradYear(input.gradYear, deps.clock.now())) {
      return err({ kind: 'grad_year_implausible' });
    }

    const updated: User = { ...user, displayName, gradYear: input.gradYear };
    await deps.users.save(updated);
    return ok(updated);
  };
}
