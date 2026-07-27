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
const configuredPaths = Object.values(BACKEND_CATALOG).flatMap((module) =>
  module.tabs.flatMap((resource) => [
    resource.path,
    ...(resource.detailPath ? [resource.detailPath] : []),
    ...(resource.related || []).map((relation) => relation.path),
  ]),
);
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
  configuredGets: configuredPaths.length,
  missingGets,
  duplicates: [...new Set(duplicates)],
};

console.log(JSON.stringify(result, null, 2));

if (missingGets.length || duplicates.length) {
  process.exitCode = 1;
}
