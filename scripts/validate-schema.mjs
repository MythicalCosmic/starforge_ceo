import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BACKEND_CATALOG } from '../src/api/catalog.js';
import {
  isManagementOperation,
  managementOperations,
  permissionForOperation,
  readOperations,
} from '../src/lib/openApiOperations.js';

const schemaUrl =
  process.env.STARFORGE_SCHEMA_URL ||
  'https://starforge.78.111.91.113.nip.io/api/schema/';

const response = await fetch(schemaUrl, {
  headers: {
    Accept: 'application/json',
    'User-Agent': 'starforge-console-schema-validator/1.0',
  },
  // The generated document is currently about 1.4 MB. Leave enough room for
  // a cold application worker while still failing a genuinely stalled gate.
  signal: AbortSignal.timeout(60_000),
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
const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(path));
    } else if (
      /\.(?:js|jsx|mjs)$/.test(entry.name) &&
      !/\.(?:test|spec)\./.test(entry.name) &&
      !entry.name.toLowerCase().includes('mock')
    ) {
      files.push(path);
    }
  }
  return files;
}

const sourceReferences = new Map();
for (const file of await sourceFiles(join(repositoryRoot, 'src'))) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/\/api\/v1\/[^'"`\s),;]*/g)) {
    const path = match[0]
      .split('?')[0]
      .replace(/\$\{[^}]+\}/g, '{}')
      .replace(/\{[^}]+\}/g, '{}');
    // This is the request-client trust boundary, not an endpoint reference.
    if (path === '/api/v1/') continue;
    const location = `${relative(repositoryRoot, file)}:${source.slice(0, match.index).split('\n').length}`;
    if (!sourceReferences.has(path)) sourceReferences.set(path, new Set());
    sourceReferences.get(path).add(location);
  }
}

const missingSourcePaths = [...sourceReferences.entries()]
  .filter(([path]) => !schemaPathEntries.some(([schemaPath]) => {
    const canonical = canonicalPath(schemaPath);
    return canonical === path || canonical === `${path}/`;
  }))
  .map(([path, locations]) => ({ path, locations: [...locations] }));
const advertisedWrites = schemaPathEntries.reduce(
  (total, [, operations]) => total + ['post', 'put', 'patch', 'delete'].filter((method) => operations?.[method]).length,
  0,
);
const advertisedReads = schemaPathEntries.reduce(
  (total, [, operations]) => total + (operations?.get ? 1 : 0),
  0,
);
const parsedWrites = managementOperations(schema, { includeNonManagement: true });
const parsedReads = readOperations(schema);
const managementWrites = parsedWrites.filter(isManagementOperation);
const dedicatedProtocolWrites = parsedWrites.filter((operation) => !isManagementOperation(operation));
const writesWithoutCapability = managementWrites.filter((operation) => !permissionForOperation(operation));
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
  advertisedWrites,
  advertisedReads,
  sourceApiReferences: sourceReferences.size,
  managementWrites: managementWrites.length,
  dedicatedProtocolWrites: dedicatedProtocolWrites.length,
  actionCoverage: parsedWrites.length === advertisedWrites
    ? `${parsedWrites.length}/${advertisedWrites}`
    : `${parsedWrites.length}/${advertisedWrites} (incomplete)`,
  readCoverage: parsedReads.length === advertisedReads
    ? `${parsedReads.length}/${advertisedReads}`
    : `${parsedReads.length}/${advertisedReads} (incomplete)`,
  writesWithoutCapability: writesWithoutCapability.map((operation) => operation.key),
  configuredGets: configuredPaths.length,
  missingGets,
  missingOperations,
  missingSourcePaths,
  duplicates: [...new Set(duplicates)],
};

console.log(JSON.stringify(result, null, 2));

if (
  missingGets.length ||
  missingOperations.length ||
  missingSourcePaths.length ||
  duplicates.length ||
  parsedWrites.length !== advertisedWrites ||
  parsedReads.length !== advertisedReads ||
  writesWithoutCapability.length
) {
  process.exitCode = 1;
}
