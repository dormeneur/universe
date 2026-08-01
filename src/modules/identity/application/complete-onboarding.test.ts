import { describe, expect, it } from 'vitest';
import { fixedClock } from '@/shared/testing/clock';
import { deriveRole, type UserId } from '../domain/user';
import { makeUser } from '../testing/fixtures';
import { InMemoryUserRepository } from '../testing/fakes';
import { makeCompleteOnboarding, MAX_DISPLAY_NAME_LENGTH } from './complete-onboarding';

const NOW = '2026-08-01T00:00:00.000Z';

function setup(user = makeUser({ id: 'u1' as UserId, gradYear: null })) {
  const users = new InMemoryUserRepository([user]);
  return {
    users,
    completeOnboarding: makeCompleteOnboarding({ users, clock: fixedClock(NOW) }),
  };
}

describe('completeOnboarding', () => {
  it('records the name and graduation year', async () => {
    const { completeOnboarding, users } = setup();

    const result = await completeOnboarding({
      userId: 'u1' as UserId,
      displayName: 'Aditya Bharti',
      gradYear: 2028,
    });

    expect(result.ok).toBe(true);
    const stored = await users.byId('u1' as UserId);
    expect(stored?.displayName).toBe('Aditya Bharti');
    expect(stored?.gradYear).toBe(2028);
  });

  it('collapses stray whitespace in the name', async () => {
    const { completeOnboarding } = setup();

    const result = await completeOnboarding({
      userId: 'u1' as UserId,
      displayName: '  Aditya   Bharti  ',
      gradYear: 2028,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.displayName).toBe('Aditya Bharti');
  });

  it('rejects a blank name', async () => {
    const { completeOnboarding } = setup();

    const result = await completeOnboarding({
      userId: 'u1' as UserId,
      displayName: '   ',
      gradYear: 2028,
    });

    expect(result).toEqual({ ok: false, error: { kind: 'display_name_empty' } });
  });

  it('rejects an over-long name', async () => {
    const { completeOnboarding } = setup();

    const result = await completeOnboarding({
      userId: 'u1' as UserId,
      displayName: 'a'.repeat(MAX_DISPLAY_NAME_LENGTH + 1),
      gradYear: 2028,
    });

    expect(result).toEqual({ ok: false, error: { kind: 'display_name_too_long' } });
  });

  it.each([1990, 2050])('rejects an implausible graduation year (%d)', async (gradYear) => {
    const { completeOnboarding } = setup();

    const result = await completeOnboarding({
      userId: 'u1' as UserId,
      displayName: 'Student',
      gradYear,
    });

    expect(result).toEqual({ ok: false, error: { kind: 'grad_year_implausible' } });
  });

  it('rejects an unknown user', async () => {
    const { completeOnboarding } = setup();

    const result = await completeOnboarding({
      userId: 'nobody' as UserId,
      displayName: 'Student',
      gradYear: 2028,
    });

    expect(result).toEqual({ ok: false, error: { kind: 'user_not_found' } });
  });

  it('lets a mistyped year be corrected, and the role follows immediately', async () => {
    const { completeOnboarding } = setup();
    await completeOnboarding({ userId: 'u1' as UserId, displayName: 'S', gradYear: 2020 });

    const corrected = await completeOnboarding({
      userId: 'u1' as UserId,
      displayName: 'S',
      gradYear: 2029,
    });

    expect(corrected.ok).toBe(true);
    if (corrected.ok) {
      expect(deriveRole(corrected.value, new Date(NOW))).toBe('student');
    }
  });
});
