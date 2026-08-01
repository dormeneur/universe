import { redirect } from 'next/navigation';
import { getContainer } from '@/composition/container';
import { deriveRole, isProfileComplete } from '@/modules/identity';
import {
  signOutAction,
  startGitHubLinkAction,
  unlinkGitHubAction,
} from '@/modules/identity/presentation/actions';
import { currentUser } from '@/modules/identity/presentation/current-user';
import { describeGitHubOutcome } from '@/modules/identity/presentation/github-messages';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ github?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  if (!isProfileComplete(user)) redirect('/welcome');

  const { github } = await searchParams;
  const notice = github ? describeGitHubOutcome(github) : null;
  const role = deriveRole(user, new Date());
  const linkingAvailable = getContainer().identity.githubLinking !== null;

  return (
    <main className="page">
      {user.status === 'pending_approval' ? (
        <p className="banner">
          Your email domain isn&rsquo;t on the campus list yet, so an admin is reviewing your
          account. You can look around in the meantime.
        </p>
      ) : null}

      {notice ? (
        <p className="banner" role="status">
          {notice}
        </p>
      ) : null}

      <h1>Hi, {user.displayName}</h1>
      <p className="subtle">
        Signed in as {user.email} · {role} · graduating {user.gradYear}
      </p>

      <section className="card">
        <h2>GitHub</h2>

        {user.github ? (
          <>
            <p>
              Connected as <strong>@{user.github.login}</strong>. Your public projects will be
              indexed from here once discovery lands in Phase 2.
            </p>
            <form action={unlinkGitHubAction}>
              <button className="link" type="submit">
                Disconnect GitHub
              </button>
            </form>
          </>
        ) : (
          <>
            <p>
              Not connected. Connecting GitHub is how your projects get indexed — it&rsquo;s
              optional, and signing in never depends on it.
            </p>
            {linkingAvailable ? (
              <form action={startGitHubLinkAction}>
                <button type="submit" className="inline">
                  Connect GitHub
                </button>
              </form>
            ) : (
              <p className="hint">
                GitHub connections aren&rsquo;t configured on this deployment yet.
              </p>
            )}
          </>
        )}
      </section>

      <p className="subtle" style={{ marginTop: '2.5rem' }}>
        Phase 1 complete. Project discovery arrives in Phase 2.
      </p>

      <form action={signOutAction} style={{ marginTop: '1.5rem' }}>
        <button className="link" type="submit">
          Sign out
        </button>
      </form>
    </main>
  );
}
