// The app's scripts (js/*.js) are plain scripts that share one scope: a name one file declares at the top level is
// usable in the files loaded after it. ESLint checks one file at a time, so this tells it those shared names, and
//
//   node tools/app-globals.mjs
//
// does the one check ESLint can't across files: it fails on a top-level name that no file uses.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as espree from 'espree';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'js');
const OPTS = { ecmaVersion: 'latest', sourceType: 'script' };
const files = () => readdirSync(DIR).filter((f) => f.endsWith('.js')).sort();

const declared = (ast) => ast.body.flatMap((st) => {
  if (st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration') return [[st.id.name, 'readonly']];
  if (st.type !== 'VariableDeclaration') return [];
  const names = [], kind = st.kind === 'const' ? 'readonly' : 'writable';
  const walk = (p) => {
    if (!p) return;
    if (p.type === 'Identifier') names.push([p.name, kind]);
    else if (p.type === 'ObjectPattern') p.properties.forEach((x) => walk(x.type === 'RestElement' ? x.argument : x.value));
    else if (p.type === 'ArrayPattern') p.elements.forEach(walk);
    else if (p.type === 'AssignmentPattern') walk(p.left);
    else if (p.type === 'RestElement') walk(p.argument);
  };
  st.declarations.forEach((d) => walk(d.id));
  return names;
});

/** { name: { file, kind } } for every top-level name in js/; kind is 'readonly' (const, function) or 'writable' (let). */
export function appGlobals() {
  const out = {};
  for (const f of files()) for (const [n, kind] of declared(espree.parse(readFileSync(join(DIR, f), 'utf8'), OPTS))) out[n] = { file: f, kind };
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const names = appGlobals();
  // A name counts as used when it appears more than once (the declaration) anywhere in js/. Approximate on purpose: a
  // property with the same name (x.list) counts too, so this misses some unused names but never flags a used one.
  const count = {};
  for (const f of files()) for (const t of espree.tokenize(readFileSync(join(DIR, f), 'utf8'), OPTS)) if (t.type === 'Identifier' && t.value in names) count[t.value] = (count[t.value] || 0) + 1;
  const unused = Object.keys(names).filter((n) => (count[n] || 0) < 2).sort();
  if (unused.length) {
    for (const n of unused) console.log(`  ${names[n].file}: '${n}' is declared but never used`);
    process.exit(1);
  }
  console.log(`app globals: ${Object.keys(names).length} shared names, all used`);
}
