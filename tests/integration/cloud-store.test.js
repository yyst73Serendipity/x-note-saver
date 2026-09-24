/**
 * 连接真实 Firestore 模拟器，验证事务重放、并发编辑、分页和账号访问隔离。
 */
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
const cloudModule = await import('../../sync/cloud-store.js').catch(() => ({}));
let env, db, cloud;
before(async () => {
  if (!cloudModule.CloudStore) return;
  const rules = (await readFile('firestore.rules', 'utf8')).replaceAll('__OWNER_UID__', 'owner');
  env = await initializeTestEnvironment({ projectId: 'demo-x-note-saver', firestore: { host: '127.0.0.1', port: 8087, rules } });
  db = env.authenticatedContext('owner').firestore();
});
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { if (env) await env.clearFirestore(); });
const op = (id, patch, base = {}, extra = {}) => ({ id, collection: 'tweets', recordId: '123', patch, base, deleted: false, restore: false, ...extra });
function store() { assert.equal(typeof cloudModule.CloudStore, 'function'); return new cloudModule.CloudStore(db); }

test('transaction replay is idempotent even after another device edits the record', async () => {
  cloud = store();
  const first = op('one', { tweetId: '123', note: '第一版' });
  await cloud.commit('owner', first);
  await cloud.commit('owner', op('two', { note: '第二版' }, { note: '第一版' }));
  const replay = await cloud.commit('owner', first);
  assert.equal(replay.data.note, '第二版');
  assert.equal(replay.revision, 2);
});
test('two stale writers preserve conflicting notes', async () => {
  cloud = store();
  await cloud.commit('owner', op('one', { tweetId: '123', note: '原始' }));
  await Promise.all([cloud.commit('owner', op('two', { note: 'A' }, { note: '原始' })), cloud.commit('owner', op('three', { note: 'B' }, { note: '原始' }))]);
  const result = (await getDoc(doc(db, 'users/owner/tweets/123'))).data();
  assert.equal(result.conflicts.length, 1);
  assert.deepEqual(new Set([result.data.note, result.conflicts[0].local]), new Set(['A', 'B']));
});
test('offline edit cannot resurrect a remote deletion', async () => {
  cloud = store();
  await cloud.commit('owner', op('one', { tweetId: '123', note: '原始' }));
  await cloud.commit('owner', op('two', {}, {}, { deleted: true }));
  assert.equal((await cloud.commit('owner', op('three', { note: '离线编辑' }, { note: '原始' }))).deleted, true);
});
test('paged pull resumes from the saved timestamp without missing records', async () => {
  cloud = store();
  for (let i = 1; i <= 5; i++) await cloud.commit('owner', { ...op(`op-${i}`, { tweetId: String(i) }), recordId: String(i) });
  const all = [];
  let cursor;
  for await (const page of cloud.pull('owner', 'tweets', null, 2)) { all.push(...page.records); cursor = page.cursor; }
  assert.equal(new Set(all.map(r => r.id)).size, 5);
  await cloud.commit('owner', { ...op('new', { tweetId: '6' }), recordId: '6' });
  const delta = [];
  for await (const page of cloud.pull('owner', 'tweets', cursor, 2)) delta.push(...page.records);
  assert.equal(delta.some(r => r.id === '6'), true);
});
test('another authenticated account cannot read owner data', async () => {
  assert.equal(typeof cloudModule.CloudStore, 'function');
  await assertFails(getDoc(doc(env.authenticatedContext('other').firestore(), 'users/owner/tweets/123')));
});
test('anonymous clients cannot read owner data', async () => {
  assert.equal(typeof cloudModule.CloudStore, 'function');
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users/owner/tweets/123')));
});
test('owner cannot bypass its own namespace', async () => {
  assert.equal(typeof cloudModule.CloudStore, 'function');
  await assertFails(setDoc(doc(db, 'users/other/tweets/123'), { note: '不能越权' }));
});
