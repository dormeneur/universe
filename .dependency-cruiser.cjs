/**
 * Architecture boundaries, enforced.
 *
 * These rules are the architecture described in docs/ARCHITECTURE.md. If a
 * rule fails, the fix is normally the design rather than the rule — editing
 * this file to make an import legal is how boundaries erode. Changing a rule
 * deliberately is fine, but record why in docs/adr/.
 */

/**
 * Files that are test code rather than shipped code. The layer-purity rules
 * below do not apply to them: a domain test necessarily imports vitest and
 * fixtures, and a contract suite necessarily imports both. Excluding them here
 * rather than loosening the rules keeps the constraint sharp for real code.
 */
const TEST_CODE = ['\\.(test|spec)\\.tsx?$', '\\.contract\\.ts$', '/testing/'];

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'A cycle means two files cannot be understood, tested, or deleted independently. ' +
        'Break it by extracting the shared piece or by inverting one direction with an interface.',
      from: {},
      to: { circular: true },
    },

    {
      name: 'domain-is-pure',
      severity: 'error',
      comment:
        'domain/ holds rules that would still be true if the app were rewritten in Go. It may ' +
        'import only shared/ and its own module domain. Keeping it framework-free is what lets ' +
        'business rules be tested in under a millisecond with no database.',
      from: { path: '^src/modules/[^/]+/domain', pathNot: TEST_CODE },
      to: {
        pathNot: ['^src/modules/[^/]+/domain', '^src/shared'],
        dependencyTypesNot: ['npm', 'npm-dev', 'core'],
      },
    },

    {
      name: 'domain-no-frameworks',
      severity: 'error',
      comment:
        'No Drizzle, React, or next/* inside domain/. Only zod and date-fns are allowed, because ' +
        'they are pure value libraries with no I/O.',
      from: { path: '^src/modules/[^/]+/domain', pathNot: TEST_CODE },
      to: {
        dependencyTypes: ['npm'],
        pathNot: ['^zod', '^date-fns', '^ulid'],
      },
    },

    {
      name: 'application-no-infrastructure',
      severity: 'error',
      comment:
        'Use cases depend on port interfaces they declare, never on a concrete adapter. That ' +
        'inversion is what lets tests pass fakes and composition/ pass Postgres.',
      from: { path: '^src/modules/[^/]+/application' },
      to: { path: '^src/modules/[^/]+/infrastructure' },
    },

    {
      name: 'application-no-presentation',
      severity: 'error',
      comment: 'Dependencies point inward. A use case must not know about a route or component.',
      from: { path: '^src/modules/[^/]+/application' },
      to: { path: '^src/modules/[^/]+/presentation' },
    },

    {
      name: 'application-no-frameworks',
      severity: 'error',
      comment:
        'Use cases orchestrate domain rules; they do not talk to Postgres or render UI. Importing ' +
        'drizzle, react, or next here means logic has drifted into the wrong layer.',
      from: { path: '^src/modules/[^/]+/application' },
      to: { dependencyTypes: ['npm'], path: '^(drizzle-orm|postgres|react|next)' },
    },

    {
      name: 'infrastructure-and-presentation-do-not-mix',
      severity: 'error',
      comment:
        'Both are outer layers and must not reach across to each other. Anything they share ' +
        'belongs inward, in application/ or domain/.',
      from: { path: '^src/modules/[^/]+/infrastructure' },
      to: { path: '^src/modules/[^/]+/presentation' },
    },

    {
      name: 'presentation-no-infrastructure',
      severity: 'error',
      comment:
        'A server action calls a use case wired in composition/, never a repository directly. ' +
        'Otherwise authorization and domain rules get bypassed at the edge.',
      from: { path: '^src/modules/[^/]+/presentation' },
      to: { path: '^src/modules/[^/]+/infrastructure' },
    },

    {
      name: 'modules-use-public-api',
      severity: 'error',
      comment:
        "Import another module through its index.ts only. Reaching into a module's internals " +
        'couples you to decisions it should stay free to change.',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/([^/]+)/(domain|application|infrastructure|presentation)',
        pathNot: '^src/modules/$1/',
      },
    },

    {
      name: 'only-composition-touches-infrastructure',
      severity: 'error',
      comment:
        'Concrete adapters are constructed in a composition file only — either the root ' +
        'container or a module assembling its own adapters. App routes, use cases, and other ' +
        'modules go through the container. Cross-module reach is blocked separately by ' +
        'modules-use-public-api, so allowing a module its own composition.ts stays safe.',
      from: {
        pathNot: [
          '^src/modules/[^/]+/infrastructure',
          '^src/composition',
          '^src/modules/[^/]+/composition\\.ts$',
        ],
      },
      to: { path: '^src/modules/[^/]+/infrastructure' },
    },

    {
      name: 'shared-depends-on-nothing',
      severity: 'error',
      comment:
        'shared/ is the kernel. If something in it needs a module, it is not shared — it belongs ' +
        'in that module.',
      from: { path: '^src/shared' },
      to: { path: '^src/(modules|composition|app)' },
    },

    {
      name: 'test-doubles-stay-in-tests',
      severity: 'error',
      comment:
        'testing/ directories hold fakes and fixtures. Production code importing them means a ' +
        'fake could ship — and that a real implementation is missing.',
      from: { pathNot: TEST_CODE },
      to: { path: ['^src/shared/testing', '^src/modules/[^/]+/testing'] },
    },

    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Unreachable file — either wire it up or delete it.',
      from: {
        orphan: true,
        pathNot: [
          '\\.d\\.ts$',
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts)$',
          '(^|/)tsconfig\\.json$',
          '\\.(test|spec)\\.tsx?$',
          '^src/app/',
          '/testing/',
        ],
      },
      to: {},
    },

    {
      name: 'no-deprecated-core',
      severity: 'error',
      comment: 'Deprecated Node core module.',
      from: {},
      to: { dependencyTypes: ['core'], path: ['^(punycode|domain|sys)$'] },
    },
  ],

  options: {
    // `doNotFollow` records the edge into a package without cruising through
    // its internals. Putting node_modules in `exclude` instead would drop
    // those edges from the graph entirely, silently disabling every rule that
    // restricts which npm packages a layer may import.
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.next' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
    },
    reporterOptions: {
      dot: { collapsePattern: 'node_modules/(@[^/]+/[^/]+|[^/]+)' },
      archi: { collapsePattern: '^src/(modules/[^/]+|shared|composition|app)' },
    },
  },
};
