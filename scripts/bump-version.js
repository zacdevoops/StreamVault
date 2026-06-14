const fs = require('fs');
const path = require('path');

const appJsonPath = path.resolve(process.cwd(), 'app.json');
const raw = fs.readFileSync(appJsonPath, 'utf8');
const appConfig = JSON.parse(raw);

if (!appConfig.expo) {
  throw new Error('Invalid app.json: missing "expo" root object.');
}

const currentVersion = String(appConfig.expo.version ?? '1.0.0');
const parts = currentVersion.split('.');
if (parts.length !== 3) {
  throw new Error(`Invalid version format "${currentVersion}". Expected semver like "1.2.3".`);
}

const major = Number.parseInt(parts[0], 10);
const minor = Number.parseInt(parts[1], 10);
const patch = Number.parseInt(parts[2], 10);
if ([major, minor, patch].some((value) => Number.isNaN(value) || value < 0)) {
  throw new Error(`Invalid version numbers in "${currentVersion}".`);
}

const nextPatch = patch + 1;
const nextVersion = `${major}.${minor}.${nextPatch}`;

const currentVersionCode = Number.parseInt(String(appConfig.expo.android?.versionCode ?? 0), 10);
if (Number.isNaN(currentVersionCode) || currentVersionCode < 0) {
  throw new Error(`Invalid android.versionCode "${appConfig.expo.android?.versionCode}".`);
}
const nextVersionCode = currentVersionCode + 1;

appConfig.expo.version = nextVersion;
appConfig.expo.android = {
  ...(appConfig.expo.android ?? {}),
  versionCode: nextVersionCode,
};
appConfig.expo.ios = {
  ...(appConfig.expo.ios ?? {}),
  buildNumber: String(nextVersionCode),
};

fs.writeFileSync(appJsonPath, `${JSON.stringify(appConfig, null, 2)}\n`, 'utf8');

console.log(`Updated version: ${currentVersion} -> ${nextVersion}`);
console.log(`Updated android.versionCode: ${currentVersionCode} -> ${nextVersionCode}`);
console.log(`Updated ios.buildNumber: ${appConfig.expo.ios.buildNumber}`);
