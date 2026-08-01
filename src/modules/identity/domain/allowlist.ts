import { emailDomain, type CampusEmail } from './campus-email';

/**
 * Whether an address belongs to a domain this campus recognizes.
 *
 * `needs_review` is not a rejection. Institutions issue addresses on domains
 * nobody anticipated, and a student whose department uses an unlisted
 * subdomain must still have a way in — that is the manual approval queue
 * (PRD ID-2). Treating an unknown domain as a hard failure would silently
 * exclude exactly the students least able to complain about it.
 */
export type DomainVerdict = 'allowed' | 'needs_review';

/**
 * Entries are either an exact domain (`cs.college.ac.in`) or a suffix wildcard
 * (`*.ac.in`). A wildcard matches subdomains but never the bare domain itself,
 * so `*.ac.in` covers `college.ac.in` without accepting `ac.in`.
 */
export function classifyDomain(domain: string, allowlist: readonly string[]): DomainVerdict {
  const candidate = domain.trim().toLowerCase();

  for (const raw of allowlist) {
    const entry = raw.trim().toLowerCase();
    if (entry.length === 0) continue;

    if (entry.startsWith('*.')) {
      const suffix = entry.slice(1); // '*.ac.in' → '.ac.in'
      if (candidate.endsWith(suffix)) return 'allowed';
      continue;
    }

    if (candidate === entry) return 'allowed';
  }

  return 'needs_review';
}

export function classifyEmail(email: CampusEmail, allowlist: readonly string[]): DomainVerdict {
  return classifyDomain(emailDomain(email), allowlist);
}
