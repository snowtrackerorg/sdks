// Extracts the /sdk/forms + /sdk/leads subset (paths + transitively
// referenced component schemas) from a full ops-api OpenAPI document.
// Regenerate the committed fixture against a running local ops-api with:
//
//   curl -s localhost:8080/openapi.json \
//     | node scripts/extract-sdk-openapi.mjs \
//     | pnpm exec prettier --parser json > src/__fixtures__/sdk-openapi.json
//
// See src/contract.test.ts for how the fixture pins the SDK contract.
import { text } from 'node:stream/consumers';

const doc = JSON.parse(await text(process.stdin));
const wanted = ['/sdk/forms', '/sdk/forms/{form_id}', '/sdk/leads'];

const refs = new Set();
function collectRefs(node) {
  if (Array.isArray(node)) {
    for (const v of node) collectRefs(v);
  } else if (node !== null && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref' && typeof v === 'string') refs.add(v.split('/').pop());
      else collectRefs(v);
    }
  }
}

const paths = {};
for (const p of wanted) {
  if (!doc.paths?.[p]) throw new Error(`missing path ${p} — is this the ops-api openapi.json?`);
  paths[p] = doc.paths[p];
  collectRefs(doc.paths[p]);
}

const allSchemas = doc.components?.schemas ?? {};
const done = new Set();
while (refs.size > done.size) {
  for (const r of [...refs]) {
    if (done.has(r)) continue;
    done.add(r);
    if (allSchemas[r]) collectRefs(allSchemas[r]);
  }
}
const schemas = {};
for (const r of [...done].sort()) {
  if (allSchemas[r]) schemas[r] = allSchemas[r];
}

process.stdout.write(
  JSON.stringify({ servers: doc.servers, paths, components: { schemas } }, null, 2) + '\n',
);
