/**
 * 验证 Firebase 配置与认证跨页面消息的来源检查。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const guard = await import('../auth/auth-guard.js').catch(() => ({}));
test('unconfigured project stays in local mode', () => {
  assert.equal(typeof guard.isConfigured, 'function');
  assert.equal(guard.isConfigured({}), false);
});
test('auth bridge rejects messages from another origin', () => {
  assert.equal(typeof guard.isAuthResponse, 'function');
  const frame = {};
  assert.equal(guard.isAuthResponse({ origin: 'https://evil.example', source: frame, data: { type: 'x-note-auth-result', requestId: 'nonce' } }, frame, 'https://safe.web.app', 'nonce'), false);
});
test('auth bridge rejects stale login responses', () => {
  assert.equal(typeof guard.isAuthResponse, 'function');
  const frame = {};
  assert.equal(guard.isAuthResponse({ origin: 'https://safe.web.app', source: frame, data: { type: 'x-note-auth-result', requestId: 'old' } }, frame, 'https://safe.web.app', 'nonce'), false);
});
test('auth bridge accepts the matching source origin and request', () => {
  assert.equal(typeof guard.isAuthResponse, 'function');
  const frame = {};
  assert.equal(guard.isAuthResponse({ origin: 'https://safe.web.app', source: frame, data: { type: 'x-note-auth-result', requestId: 'nonce' } }, frame, 'https://safe.web.app', 'nonce'), true);
});
test('project root can be reloaded without changing the unpacked extension path', async () => {
  const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
  const offscreen = await readFile('offscreen/offscreen.html', 'utf8');
  assert.equal(manifest.background.service_worker, 'build/background.js');
  assert.equal(offscreen.includes('../build/offscreen.js'), true);
});

test('firestore uses the fetch based lite client inside the extension service worker', async () => {
  const firebaseClient = await readFile('auth/firebase-client.js', 'utf8');
  const cloudStore = await readFile('sync/cloud-store.js', 'utf8');
  assert.match(firebaseClient, /from 'firebase\/firestore\/lite'/);
  assert.match(cloudStore, /from 'firebase\/firestore\/lite'/);
  assert.doesNotMatch(cloudStore, /getDocsFromServer/);
});
