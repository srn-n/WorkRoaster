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

test('no network access: INTERNET is removed, no other permission is requested', () => {
  assert.match(manifest, /<uses-permission android:name="android\.permission\.INTERNET" tools:node="remove" \/>/);
  const requested = [...manifest.matchAll(/<uses-permission\b[^>]*>/g)].map((m) => m[0]).filter((t) => !/tools:node="remove"/.test(t));
  assert.deepEqual(requested, []);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
});

test('records are not copied to Google cloud backup', () => {
  assert.match(manifest, /android:allowBackup="false"/);
});

test('no tracking, ads, sign-in or remote-content libraries', () => {
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const banned = /firebase|analytics|admob|google-services|play-services|sentry|crashlytics|onesignal|push-notifications|auth|sign-?in|@capacitor\/(browser|http|preferences)/i;
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
