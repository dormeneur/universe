import { describe, expect, it } from 'vitest';
import { emailDomain, maskEmail, parseCampusEmail, type CampusEmail } from './campus-email';

function parsed(raw: string): CampusEmail {
  const result = parseCampusEmail(raw);
  if (!result.ok) throw new Error(`expected ${raw} to parse`);
  return result.value;
}

describe('parseCampusEmail', () => {
  it('accepts an ordinary institutional address', () => {
    expect(parseCampusEmail('aditya.bharti@college.ac.in')).toEqual({
      ok: true,
      value: 'aditya.bharti@college.ac.in',
    });
  });

  it('lowercases, so the same person cannot create two accounts', () => {
    expect(parsed('Aditya.Bharti@College.AC.IN')).toBe('aditya.bharti@college.ac.in');
  });

  it('trims surrounding whitespace from a pasted address', () => {
    expect(parsed('  student@college.edu  ')).toBe('student@college.edu');
  });

  it('accepts plus addressing, which some students use deliberately', () => {
    expect(parsed('student+uniiverse@college.ac.in')).toBe('student+uniiverse@college.ac.in');
  });

  it('rejects an empty address', () => {
    expect(parseCampusEmail('   ')).toEqual({ ok: false, error: { kind: 'email_empty' } });
  });

  it.each([
    ['no at sign', 'studentcollege.ac.in'],
    ['no domain', 'student@'],
    ['no local part', '@college.ac.in'],
    ['no dot in domain', 'student@college'],
    ['internal spaces', 'stu dent@college.ac.in'],
    ['double at', 'student@@college.ac.in'],
    ['trailing dot in local part', 'student.@college.ac.in'],
    ['leading dot in local part', '.student@college.ac.in'],
    ['hyphen-led domain label', 'student@-college.ac.in'],
  ])('rejects %s', (_label, input) => {
    expect(parseCampusEmail(input)).toEqual({ ok: false, error: { kind: 'email_malformed' } });
  });

  it('rejects an address beyond the maximum length', () => {
    const tooLong = `${'a'.repeat(250)}@college.ac.in`;
    expect(parseCampusEmail(tooLong)).toEqual({ ok: false, error: { kind: 'email_too_long' } });
  });
});

describe('emailDomain', () => {
  it('returns everything after the at sign', () => {
    expect(emailDomain(parsed('student@cs.college.ac.in'))).toBe('cs.college.ac.in');
  });
});

describe('maskEmail', () => {
  it('keeps the first two characters and the whole domain', () => {
    expect(maskEmail(parsed('aditya@college.ac.in'))).toBe('ad***@college.ac.in');
  });

  it('does not reveal a very short local part', () => {
    expect(maskEmail(parsed('ab@college.ac.in'))).toBe('a***@college.ac.in');
  });
});
