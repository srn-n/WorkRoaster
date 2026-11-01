import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNativeApp } from '../../src/platform.js';

test('website: no Capacitor → not the app', () => {
  assert.equal(isNativeApp({}), false);
  assert.equal(isNativeApp(undefined), false);
});

test('Android app: Capacitor says native → the app', () => {
  assert.equal(isNativeApp({ Capacitor: { isNativePlatform: () => true } }), true);
});

test('Capacitor web shim or a broken object → not the app', () => {
  assert.equal(isNativeApp({ Capacitor: { isNativePlatform: () => false } }), false);
  assert.equal(isNativeApp({ Capacitor: {} }), false);
  assert.equal(isNativeApp({ Capacitor: { isNativePlatform: () => { throw new Error('x'); } } }), false);
});
