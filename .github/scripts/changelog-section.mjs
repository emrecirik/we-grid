// Prints the CHANGELOG.md section for one version, so the release workflow can turn it into the
// GitHub release body instead of anyone re-typing the notes by hand.
//
// Usage: node .github/scripts/changelog-section.mjs 0.2.0
//
// Exits non-zero when the version has no section — a release published with an empty body is
// worse than a red build that says the changelog was forgotten.
import { readFileSync } from 'node:fs';

const version = process.argv[2];
if (!version) {
  console.error('usage: changelog-section.mjs <version>');
  process.exit(2);
}

const lines = readFileSync('CHANGELOG.md', 'utf8').split('\n');
// Headings look like "## 0.2.0 — 2026-09-08" or "## 0.1.0 — Initial open-source release", so the
// version is matched as a whole token rather than as a prefix: "0.2.0" must not match "0.2.0-rc1".
const heading = new RegExp(`^##\\s+v?${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
const start = lines.findIndex((line) => heading.test(line));
if (start === -1) {
  console.error(`No CHANGELOG.md section found for ${version}`);
  process.exit(1);
}

let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (/^##\s/.test(lines[i])) {
    end = i;
    break;
  }
}

const body = lines.slice(start + 1, end).join('\n').trim();
if (!body) {
  console.error(`The CHANGELOG.md section for ${version} is empty`);
  process.exit(1);
}

process.stdout.write(`${body}\n`);
