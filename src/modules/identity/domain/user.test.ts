import { describe, expect, it } from 'vitest';
import { makeGitHubLink, makeUser } from '../testing/fixtures';
import {
  canLinkGitHub,
  canPost,
  canRead,
  deriveRole,
  isAlumni,
  isPlausibleGradYear,
  isProfileComplete,
} from './user';

const BEFORE_GRADUATION = new Date('2028-06-30T12:00:00.000Z');
const AFTER_GRADUATION = new Date('2028-07-01T00:00:00.000Z');

describe('deriveRole', () => {
  it('is a student before graduation day ends', () => {
    expect(deriveRole({ gradYear: 2028, role: 'student' }, BEFORE_GRADUATION)).toBe('student');
  });

  it('becomes alumni the instant graduation day ends', () => {
    expect(deriveRole({ gradYear: 2028, role: 'student' }, AFTER_GRADUATION)).toBe('alumni');
  });

  it('treats the final millisecond of graduation day as still a student', () => {
    const lastMoment = new Date('2028-06-30T23:59:59.999Z');
    expect(deriveRole({ gradYear: 2028, role: 'student' }, lastMoment)).toBe('student');
  });

  it('keeps admins as admins regardless of graduation year', () => {
    expect(deriveRole({ gradYear: 2020, role: 'admin' }, AFTER_GRADUATION)).toBe('admin');
  });

  it('recomputes from the year, so a corrected typo takes effect immediately', () => {
    // Stored role says alumni; the corrected year says otherwise. The derived
    // value wins, which is the point of deriving rather than storing.
    expect(deriveRole({ gradYear: 2030, role: 'alumni' }, AFTER_GRADUATION)).toBe('student');
  });

  it('treats an unknown graduation year as a current student', () => {
    expect(deriveRole({ gradYear: null, role: 'student' }, AFTER_GRADUATION)).toBe('student');
  });
});

describe('isProfileComplete', () => {
  it('is incomplete until a graduation year is known', () => {
    expect(isProfileComplete({ gradYear: null })).toBe(false);
    expect(isProfileComplete({ gradYear: 2028 })).toBe(true);
  });
});

describe('isAlumni', () => {
  it('tracks deriveRole', () => {
    expect(isAlumni({ gradYear: 2028, role: 'student' }, AFTER_GRADUATION)).toBe(true);
    expect(isAlumni({ gradYear: 2028, role: 'student' }, BEFORE_GRADUATION)).toBe(false);
  });
});

describe('canPost', () => {
  it('allows an active current student', () => {
    expect(canPost(makeUser({ gradYear: 2028 }), BEFORE_GRADUATION)).toBe(true);
  });

  it('refuses an alumnus, who keeps read access but not the boards', () => {
    expect(canPost(makeUser({ gradYear: 2028 }), AFTER_GRADUATION)).toBe(false);
  });

  it('refuses an account still awaiting approval', () => {
    expect(canPost(makeUser({ status: 'pending_approval' }), BEFORE_GRADUATION)).toBe(false);
  });

  it('refuses a suspended account', () => {
    expect(canPost(makeUser({ status: 'suspended' }), BEFORE_GRADUATION)).toBe(false);
  });

  it('allows an admin whose graduation year has passed', () => {
    expect(canPost(makeUser({ role: 'admin', gradYear: 2020 }), AFTER_GRADUATION)).toBe(true);
  });
});

describe('canRead', () => {
  it('allows an account awaiting approval, so review is not a dead end', () => {
    expect(canRead(makeUser({ status: 'pending_approval' }))).toBe(true);
  });

  it('refuses a suspended account', () => {
    expect(canRead(makeUser({ status: 'suspended' }))).toBe(false);
  });
});

describe('canLinkGitHub', () => {
  it('allows an active user', () => {
    expect(canLinkGitHub(makeUser())).toBe(true);
  });

  it.each(['pending_approval', 'suspended'] as const)('refuses a %s user', (status) => {
    expect(canLinkGitHub(makeUser({ status }))).toBe(false);
  });

  it('allows relinking a user who already has a link', () => {
    expect(canLinkGitHub(makeUser({ github: makeGitHubLink() }))).toBe(true);
  });
});

describe('isPlausibleGradYear', () => {
  const now = new Date('2026-08-01T00:00:00.000Z');

  it.each([2026, 2030, 2020])('accepts %d', (year) => {
    expect(isPlausibleGradYear(year, now)).toBe(true);
  });

  it.each([1998, 2040, 0])('rejects %d', (year) => {
    expect(isPlausibleGradYear(year, now)).toBe(false);
  });

  it('rejects a non-integer', () => {
    expect(isPlausibleGradYear(2027.5, now)).toBe(false);
  });
});
