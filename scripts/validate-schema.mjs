import { BACKEND_CATALOG } from '../src/api/catalog.js';

const schemaUrl =
  process.env.STARFORGE_SCHEMA_URL ||
  'https://starforge.78.111.91.113.nip.io/api/schema/';

const response = await fetch(schemaUrl, {
  headers: {
    Accept: 'application/json',
    'User-Agent': 'starforge-console-schema-validator/1.0',
  },
  signal: AbortSignal.timeout(20_000),
});

if (!response.ok) {
  throw new Error(`Schema request failed with HTTP ${response.status}.`);
}

const schema = await response.json();
const httpMethods = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
  'trace',
]);
const canonicalPath = (path) => path.replace(/\{[^}]+\}/g, '{}');
const schemaPathEntries = Object.entries(schema.paths || {});
// Focused workspaces intentionally sit outside the generic read catalog. Keep
// their release-critical reads in the same live-schema gate so a green catalog
// result cannot conceal drift in the login, executive, assessment, session, or
// student leadership paths.
const criticalFocusedGets = [
  '/api/v1/auth/session/',
  '/api/v1/users/sessions/',
  '/api/v1/students/{pk}/leadership-profile/',
  '/api/v1/academics/exams/{pk}/readiness/',
  '/api/v1/academics/exams/{pk}/history/',
  '/api/v1/intelligence/executive-summary/',
];
const criticalFocusedOperations = [
  { method: 'delete', path: '/api/v1/users/sessions/{pk}/' },
];
const catalogPaths = Object.values(BACKEND_CATALOG).flatMap((module) =>
  module.tabs.flatMap((resource) => [
    resource.path,
    ...(resource.detailPath ? [resource.detailPath] : []),
    ...(resource.related || []).map((relation) => relation.path),
  ]),
);
const configuredPaths = [...catalogPaths, ...criticalFocusedGets];
const duplicates = configuredPaths.filter(
  (path, index) => configuredPaths.indexOf(path) !== index,
);
const missingGets = configuredPaths.filter((path) => {
  const canonical = canonicalPath(path);
  return !schemaPathEntries.some(
    ([schemaPath, operations]) =>
      canonicalPath(schemaPath) === canonical && Boolean(operations?.get),
  );
});
const missingOperations = criticalFocusedOperations.filter(({ method, path }) => {
  const canonical = canonicalPath(path);
  return !schemaPathEntries.some(
    ([schemaPath, operations]) =>
      canonicalPath(schemaPath) === canonical && Boolean(operations?.[method]),
  );
});
const result = {
  schemaUrl,
  schemaPaths: Object.keys(schema.paths || {}).length,
  schemaOperations: Object.values(schema.paths || {}).reduce(
    (total, operations) =>
      total +
      Object.keys(operations || {}).filter((method) =>
        httpMethods.has(method.toLowerCase()),
      ).length,
    0,
  ),
  modules: Object.keys(BACKEND_CATALOG).length,
  tabs: Object.values(BACKEND_CATALOG).reduce(
    (total, module) => total + module.tabs.length,
    0,
  ),
  catalogGets: catalogPaths.length,
  criticalFocusedGets: criticalFocusedGets.length,
  criticalFocusedOperations: criticalFocusedOperations.length,
  configuredGets: configuredPaths.length,
  missingGets,
  missingOperations,
  duplicates: [...new Set(duplicates)],
};

console.log(JSON.stringify(result, null, 2));

if (missingGets.length || missingOperations.length || duplicates.length) {
  process.exitCode = 1;
}
