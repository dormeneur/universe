import { sessionStoreContract } from '../application/ports/session-store.contract';
import { userRepositoryContract } from '../application/ports/user-repository.contract';
import { InMemorySessionStore, InMemoryUserRepository } from './fakes';

/**
 * The fakes are held to the same contract as the Drizzle repositories, which
 * run the identical suites in their own integration tests. Anything the fake
 * gets wrong shows up here rather than in production.
 */
userRepositoryContract('in-memory', () => Promise.resolve(new InMemoryUserRepository()));
sessionStoreContract('in-memory', () => Promise.resolve(new InMemorySessionStore()));
