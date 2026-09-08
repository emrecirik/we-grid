#!/usr/bin/env bash
# Builds a throwaway Angular app of a given major against a we-grid-angular package.
#
# The probe component is written to a fixed `probe.ts` / `probe.html` pair and bootstrapped from a
# rewritten main.ts, because the root component the CLI scaffolds is named differently across
# majors (app.component.ts up to v19, app.ts from v20). Overwriting "the" root component by name
# silently produced a build of the untouched starter app instead.
#
# Usage: probe.sh <angular-major> <scratch-dir> <probe-ts> <probe-html> [package-spec]
# Set PROBE_APP_NAME to override the generated app directory name.
set -euo pipefail

MAJOR="$1"
ROOT="$2"
PROBE_TS="$3"
PROBE_HTML="$4"
PACKAGE="${5:-we-grid-angular@latest}"
APP="${PROBE_APP_NAME:-probe$MAJOR}"

cd "$ROOT"
rm -rf "$APP"
npx --yes "@angular/cli@$MAJOR" new "$APP" --defaults --skip-git --style=scss --ssr=false \
  --package-manager=npm --skip-install
cd "$APP"

npx --yes npm@11 install --no-audit --no-fund
npx --yes npm@11 install "$PACKAGE" "@angular/cdk@$MAJOR" --no-audit --no-fund

cp "$PROBE_TS" src/app/probe.ts
cp "$PROBE_HTML" src/app/probe.html

cat > src/main.ts <<'MAIN'
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { ProbeApp } from './app/probe';

bootstrapApplication(ProbeApp, appConfig).catch((err) => console.error(err));
MAIN

node -e "
const fs = require('fs');
const json = JSON.parse(fs.readFileSync('angular.json', 'utf8'));
const options = json.projects['$APP'].architect.build.options;
options.styles = [
  'node_modules/@angular/cdk/overlay-prebuilt.css',
  'node_modules/we-grid-angular/styles/we-grid-theme.scss',
  'src/styles.scss'
];
// The probe pulls in the whole grid, well past the default 500 kB starter budget.
options.budgets = [];
fs.writeFileSync('angular.json', JSON.stringify(json, null, 2));
"

# Proof the probe actually reached the bundle: if the root component were still the starter app,
# the grid's own markup would be absent and the build would say nothing about compatibility.
npx ng build
grep -rq "we-grid__toolbar" dist/"$APP"/browser/*.js
echo "PROBE OK: Angular $MAJOR"
