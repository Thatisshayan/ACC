'use strict';

const fs = require('fs');
const path = require('path');

const candidateElectronPkgPaths = [
  path.resolve(__dirname, 'node_modules', 'electron', 'package.json'),
  path.resolve(__dirname, '..', 'node_modules', 'electron', 'package.json'),
];

const electronPkgPath = candidateElectronPkgPaths.find((candidate) => fs.existsSync(candidate));

if (!electronPkgPath) {
  console.error('Electron package not found. Run npm install inside desktop.');
  process.exit(1);
}

const electronPkg = JSON.parse(fs.readFileSync(electronPkgPath, 'utf8'));
const packageJsonPath = path.resolve(__dirname, 'package.json');
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

pkg.devDependencies = pkg.devDependencies || {};

if (pkg.devDependencies.electron !== electronPkg.version) {
  pkg.devDependencies.electron = electronPkg.version;
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`Updated electron version to ${electronPkg.version} from ${electronPkgPath}`);
} else {
  console.log(`Electron version already matches ${electronPkg.version} from ${electronPkgPath}`);
}
