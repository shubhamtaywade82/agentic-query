import { readFile } from 'node:fs/promises';

const npmPackages = [
  'packages/core/package.json',
  'packages/prisma/package.json',
  'packages/drizzle/package.json',
  'packages/ollama/package.json'
];

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function readText(file) {
  return readFile(file, 'utf8');
}

function fail(message) {
  console.error(`check-release: ${message}`);
  process.exit(1);
}

async function main() {
  // 1. All npm packages share one coordinated version.
  const versions = [];
  for (const file of npmPackages) {
    const pkg = await readJson(file);
    if (pkg.version === undefined) fail(`${file} has no version`);
    versions.push({ file, version: pkg.version, name: pkg.name });
  }
  const [expected] = versions.map(({ version }) => version);
  const mismatches = versions.filter(({ version }) => version !== expected);
  if (mismatches.length > 0) {
    console.error(`Package versions are inconsistent; expected ${expected}`);
    for (const item of mismatches) console.error(`${item.file}: ${item.version}`);
    process.exit(1);
  }

  // 2. Ruby gemspec declares the same version.
  const gemspec = await readText('ruby/agentic_query.gemspec');
  const gemspecVersion = gemspec.match(/spec\.version\s*=\s*AgenticQuery::VERSION/);
  if (!gemspecVersion) {
    fail('ruby/agentic_query.gemspec must set spec.version from AgenticQuery::VERSION');
  }

  // 3. Ruby VERSION constant matches.
  const versionFile = await readText('ruby/lib/agentic_query/version.rb');
  const versionMatch = versionFile.match(/VERSION\s*=\s*"([^"]+)"/);
  if (!versionMatch) fail('ruby/lib/agentic_query/version.rb has no VERSION constant');
  if (versionMatch[1] !== expected) {
    fail(`ruby VERSION ${versionMatch[1]} does not match npm version ${expected}`);
  }

  // 4. CHANGELOG contains an entry for this version.
  const changelog = await readText('CHANGELOG.md');
  const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const heading = new RegExp(`^#+\\s.*\\b${escaped}\\b`, 'm');
  if (!heading.test(changelog)) {
    fail(`CHANGELOG.md has no entry for version ${expected}`);
  }

  // 5. Lockfiles exist so CI can install frozen.
  try {
    await readFile('pnpm-lock.yaml');
  } catch {
    fail('pnpm-lock.yaml is missing; commit it so CI can install with --frozen-lockfile');
  }
  try {
    await readFile('ruby/Gemfile.lock');
  } catch {
    fail('ruby/Gemfile.lock is missing; commit it so CI can use bundler-cache');
  }

  // 6. Optional tag equality when running for a release tag.
  const tag = process.env.RELEASE_TAG;
  if (tag) {
    const tagVersion = tag.startsWith('v') ? tag.slice(1) : tag;
    if (tagVersion !== expected) {
      fail(`release tag ${tag} does not match package version ${expected}`);
    }
  }

  console.log(`All packages are version ${expected}; gem, VERSION, CHANGELOG, and lockfiles are consistent.`);
}

main().catch((error) => {
  console.error(`check-release: ${error.message}`);
  process.exit(1);
});
