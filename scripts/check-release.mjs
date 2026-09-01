import { readFile } from 'node:fs/promises';

const files = [
  'packages/core/package.json',
  'packages/prisma/package.json',
  'packages/drizzle/package.json',
  'packages/ollama/package.json'
];

const versions = [];
for (const file of files) {
  const pkg = JSON.parse(await readFile(file, 'utf8'));
  versions.push({ file, version: pkg.version });
}

const [expected] = versions.map(({ version }) => version);
const mismatches = versions.filter(({ version }) => version !== expected);
if (mismatches.length) {
  console.error(`Package versions are inconsistent; expected ${expected}`);
  for (const item of mismatches) console.error(`${item.file}: ${item.version}`);
  process.exit(1);
}

console.log(`All TypeScript packages are version ${expected}`);
