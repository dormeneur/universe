import { NextResponse, type NextRequest } from 'next/server';
import { getContainer } from '@/composition/container';
import { currentUser } from '@/modules/identity/presentation/current-user';
import { githubCallbackOutcome } from '@/modules/identity/presentation/github-messages';

/**
 * Where GitHub sends the student back.
 *
 * A route handler rather than a server action, because GitHub redirects here
 * with a plain GET. It always ends in a redirect home carrying a short outcome
 * code — the failure detail goes to the log, not the query string, so nothing
 * about the exchange leaks into browser history or a referrer header.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const container = getContainer();
  const home = new URL('/', request.nextUrl.origin);

  const linking = container.identity.githubLinking;
  if (!linking) {
    home.searchParams.set('github', 'unavailable');
    return NextResponse.redirect(home);
  }

  // The session establishes who is redeeming this, independently of the state
  // parameter. Both must agree — see checkLinkStateUsable.
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL('/sign-in', request.nextUrl.origin));

  const params = request.nextUrl.searchParams;

  // GitHub reports a refusal by redirecting here with `error`, not by failing.
  if (params.get('error')) {
    container.logger.info('student declined the GitHub authorization', {
      reason: params.get('error'),
    });
    home.searchParams.set('github', 'denied');
    return NextResponse.redirect(home);
  }

  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) {
    home.searchParams.set('github', 'invalid');
    return NextResponse.redirect(home);
  }

  const result = await linking.complete({ code, state, actorId: user.id });

  if (!result.ok) {
    container.logger.warn('GitHub link failed', { kind: result.error.kind, userId: user.id });
    home.searchParams.set('github', githubCallbackOutcome(result.error));
    return NextResponse.redirect(home);
  }

  home.searchParams.set('github', 'linked');
  return NextResponse.redirect(home);
}
