/*
 * Guards WorkRoaster's privacy promises in the Android app. If a change
 * (a new plugin, a regenerated android/ folder) quietly adds network access
 * or cloud backup, this fails before an APK is ever built.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const manifest = read('android/app/src/main/AndroidManifest.xml');
const config = JSON.parse(read('capacitor.config.json'));
const pkg = JSON.parse(read('package.json'));

test('app ID is the permanent studio ID', () => {
  assert.equal(config.appId, 'com.simplymadestudio.workroaster');
  assert.match(read('android/app/build.gradle'), /applicationId "com\.simplymadestudio\.workroaster"/);
});

test('no network access: INTERNET is removed; only the reminder and vibration permissions remain', () => {
  assert.match(manifest, /<uses-permission android:name="android\.permission\.INTERNET" tools:node="remove" \/>/);
  assert.match(manifest, /SCHEDULE_EXACT_ALARM" tools:node="remove"/);
  const requested = [...manifest.matchAll(/<uses-permission\b[^>]*>/g)].map((m) => m[0]).filter((t) => !/tools:node="remove"/.test(t));
  // The app's own request: VIBRATE, for the optional "vibrate on taps" setting.
  assert.deepEqual(requested, ['<uses-permission android:name="android.permission.VIBRATE" />']);
  // Permissions merged in from plugins: exactly the local-notification set.
  const pluginManifest = fs.readFileSync(new URL('../../node_modules/@capacitor/local-notifications/android/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
  const fromPlugin = [...pluginManifest.matchAll(/android\.permission\.([A-Z_]+)/g)].map((m) => m[1]).sort();
  const removedHere = [...manifest.matchAll(/android\.permission\.([A-Z_]+)" tools:node="remove"/g)].map((m) => m[1]);
  assert.deepEqual(fromPlugin.filter((p) => !removedHere.includes(p)), ['POST_NOTIFICATIONS', 'RECEIVE_BOOT_COMPLETED', 'WAKE_LOCK']);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
});

test('records are not copied to Google cloud backup', () => {
  assert.match(manifest, /android:allowBackup="false"/);
});

test('no tracking, ads, sign-in or remote-content libraries', () => {
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const banned = /firebase|analytics|admob|google-services|play-services|sentry|crashlytics|onesignal|push-notifications|auth|sign-?in|@capacitor\/(browser|http|preferences)/i;
  // Allowed native plugins (all local): app, local-notifications, android/core/cli.
  assert.deepEqual(deps.filter((d) => banned.test(d)), []);
  assert.doesNotMatch(read('android/build.gradle'), /google-services/);
  assert.doesNotMatch(read('android/app/build.gradle'), /google-services/);
  assert.equal(config.server?.url, undefined, 'the app must load its own bundled files, never a remote site');
});

test('FileProvider exposes only the app cache, never shared storage', () => {
  const paths = read('android/app/src/main/res/xml/file_paths.xml');
  assert.doesNotMatch(paths, /external-path|external-files-path|root-path/);
});

test('signing secrets come from the environment, never the repo', () => {
  const gradle = read('android/app/build.gradle');
  assert.match(gradle, /System\.getenv\('WORKROASTER_KEYSTORE_PATH'\)/);
  assert.doesNotMatch(gradle, /storePassword\s+['"]/);
});

test('only the launcher and the two home-screen widgets are reachable from other apps', () => {
  // Every component that declares android:exported, by name.
  const components = [...manifest.matchAll(/<(activity|receiver|service|provider)\b([^>]*?)(\/?)>/g)].map((m) => {
    const body = m[3] ? '' : manifest.slice(m.index + m[0].length, manifest.indexOf(`</${m[1]}>`, m.index));
    return {
      kind: m[1],
      name: (m[2].match(/android:name="([^"]+)"/) || [])[1],
      exported: /android:exported="true"/.test(m[2]),
      filters: [...body.matchAll(/<intent-filter>([\s\S]*?)<\/intent-filter>/g)].map((f) => [...f[1].matchAll(/android:name="([^"]+)"/g)].map((a) => a[1])),
    };
  });
  const exported = components.filter((c) => c.exported).map((c) => c.name).sort();
  assert.deepEqual(exported, ['.ClockWidget', '.MainActivity', '.SummaryWidget']);
  assert.match(manifest, /android:taskAffinity=""/);
  // The launcher is the activity's only way in: no deep links / custom schemes.
  const main = components.find((c) => c.name === '.MainActivity');
  assert.deepEqual(main.filters, [['android.intent.action.MAIN', 'android.intent.category.LAUNCHER']]);
  assert.doesNotMatch(manifest, /<data\b/);
  // Widget providers listen to the system's widget update only (a protected
  // broadcast), and don't add their own onReceive handling.
  for (const name of ['ClockWidget', 'SummaryWidget']) {
    assert.deepEqual(components.find((c) => c.name === `.${name}`).filters, [['android.appwidget.action.APPWIDGET_UPDATE']]);
    const java = read(`android/app/src/main/java/com/simplymadestudio/workroaster/${name}.java`);
    assert.doesNotMatch(java, /onReceive\(/, `${name} must not handle custom broadcasts`);
  }
  // The clock receiver is private: boot/update from the system, the rest via the app's own PendingIntents.
  const receiver = components.find((c) => c.name === '.ClockReceiver');
  assert.equal(receiver.exported, false);
  assert.deepEqual(receiver.filters, [['android.intent.action.BOOT_COMPLETED', 'android.intent.action.MY_PACKAGE_REPLACED']]);
});

test('clock notification and widgets: immutable PendingIntents, nothing sent anywhere', () => {
  const dir = 'android/app/src/main/java/com/simplymadestudio/workroaster/';
  for (const f of ['ClockNotification', 'ClockWidget', 'ClockReceiver', 'ClockPlugin', 'ClockStore', 'SummaryWidget']) {
    const java = read(`${dir}${f}.java`);
    assert.doesNotMatch(java, /java\.net|HttpURLConnection|Socket|FLAG_MUTABLE\b/, f);
    for (const m of java.matchAll(/PendingIntent\.get(?:Activity|Broadcast)\([^;]*;/g)) {
      assert.match(m[0], /FLAG_IMMUTABLE/, `${f}: ${m[0]}`);
    }
  }
  // Swiping the notification away brings it back while clocked in.
  const n = read(`${dir}ClockNotification.java`);
  assert.match(n, /setOngoing\(true\)/);
  assert.match(n, /setDeleteIntent\(/);
  assert.match(n, /setUsesChronometer\(true\)/);
});

test("Capacitor's internal file routes are closed in the app", () => {
  const main = read('android/app/src/main/java/com/simplymadestudio/workroaster/MainActivity.java');
  assert.match(main, /Bridge\.CAPACITOR_FILE_START/);
  assert.match(main, /Bridge\.CAPACITOR_CONTENT_START/);
  assert.match(main, /403/);
});

test('the app never loads remote content or opens other origins in its WebView', () => {
  assert.equal(config.server, undefined);
  assert.equal(config.android?.allowMixedContent, false);
  assert.equal(config.plugins?.CapacitorHttp?.enabled ?? false, false);
  assert.equal((config.allowNavigation || config.server?.allowNavigation || []).length, 0);
});


test('one version for the website and the app (package.json)', () => {
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.match(read('android/app/build.gradle'), /JsonSlurper\(\)\.parse\(rootProject\.file\('\.\.\/package\.json'\)\)\.version/);
  assert.match(read('vite.config.js'), /__APP_VERSION__/);
  assert.match(read('.github/workflows/build-android-apk.yml'), /does not match package\.json version/);
});

test('the upload key can never be committed (the repo is public)', () => {
  const ignore = read('.gitignore').split(/\r?\n/);
  for (const pattern of ['.signing/', '*.jks', '*.keystore', 'keystore.properties']) {
    assert.ok(ignore.includes(pattern), `.gitignore must list ${pattern}`);
  }
  // A release without the CI secrets is built unsigned, never signed with a stand-in key.
  const workflow = read('.github/workflows/build-android-apk.yml');
  assert.match(workflow, /HAS_SIGNING: \$\{\{ secrets\.WORKROASTER_KEYSTORE_BASE64 != '' \}\}/);
  assert.match(workflow, /apksigner\.jar/);
  assert.match(workflow, /SHA256SUMS\.txt/);
});

test('the agent brief stays on the owner\'s computer, not in the public repo', () => {
  const ignore = read('.gitignore').split(/\r?\n/);
  assert.ok(ignore.includes('AGENTS.md') && ignore.includes('CLAUDE.md'));
});
