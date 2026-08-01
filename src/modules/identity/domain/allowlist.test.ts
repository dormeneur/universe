import { describe, expect, it } from 'vitest';
import { classifyDomain, classifyEmail } from './allowlist';
import { parseCampusEmail, type CampusEmail } from './campus-email';

const ALLOWLIST = ['college.ac.in', '*.college.ac.in', '*.edu.in'];

function parsed(raw: string): CampusEmail {
  const result = parseCampusEmail(raw);
  if (!result.ok) throw new Error(`expected ${raw} to parse`);
  return result.value;
}

describe('classifyDomain', () => {
  it('allows an exact match', () => {
    expect(classifyDomain('college.ac.in', ALLOWLIST)).toBe('allowed');
  });

  it('allows a subdomain covered by a wildcard', () => {
    expect(classifyDomain('cs.college.ac.in', ALLOWLIST)).toBe('allowed');
  });

  it('allows a deep subdomain', () => {
    expect(classifyDomain('students.cs.college.ac.in', ALLOWLIST)).toBe('allowed');
  });

  it('sends an unrelated domain to review rather than rejecting it', () => {
    expect(classifyDomain('gmail.com', ALLOWLIST)).toBe('needs_review');
  });

  it('does not let a wildcard match the bare suffix itself', () => {
    // '*.edu.in' must not admit every address at 'edu.in'.
    expect(classifyDomain('edu.in', ALLOWLIST)).toBe('needs_review');
  });

  it('does not match a domain that merely ends with the same letters', () => {
    // 'notcollege.ac.in' ends with 'college.ac.in' as a substring but is a
    // different organisation — the wildcard must anchor on a dot.
    expect(classifyDomain('notcollege.ac.in', ['*.college.ac.in'])).toBe('needs_review');
  });

  it('is case insensitive on both sides', () => {
    expect(classifyDomain('CS.College.AC.IN', ['*.college.AC.in'])).toBe('allowed');
  });

  it('ignores blank entries rather than treating them as a match-all', () => {
    expect(classifyDomain('gmail.com', ['', '   '])).toBe('needs_review');
  });

  it('sends everything to review when the allowlist is empty', () => {
    expect(classifyDomain('college.ac.in', [])).toBe('needs_review');
  });
});

describe('classifyEmail', () => {
  it('classifies by the address domain', () => {
    expect(classifyEmail(parsed('student@cs.college.ac.in'), ALLOWLIST)).toBe('allowed');
    expect(classifyEmail(parsed('student@gmail.com'), ALLOWLIST)).toBe('needs_review');
  });
});
