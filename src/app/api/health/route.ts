import { NextResponse } from 'next/server';

/**
 * Liveness probe. Deliberately does not touch the database — this answers
 * "is the process up", which is what a platform health check needs. Database
 * reachability is a separate concern and would make deploys flap whenever
 * Postgres blips.
 */
export function GET() {
  return NextResponse.json({ status: 'ok' });
}
