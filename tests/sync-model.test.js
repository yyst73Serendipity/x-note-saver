/**
 * 验证真实数据模型的迁移、离线操作和并发合并行为。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
const model = await import('../storage/model.js').catch(() => ({}));
const record = (data, extra = {}) => ({ data, revision: 1, deleted: false, conflicts: [], ...extra });
const operation = (patch, base = {}) => ({ id: 'op-1', collection: 'tweets', recordId: '123', patch, base, deleted: false, restore: false });

test('migrateLegacy keeps original note and uses tweetId as stable identity', () => {
  assert.equal(typeof model.migrateLegacy, 'function');
  const workspace = model.migrateLegacy([{ id: 'old', tweetId: '123', note: '笔记', category: '学习' }], ['未分类', '学习']);
  assert.equal(model.project(workspace).tweets[0].note, '笔记');
  assert.equal(model.project(workspace).tweets[0].id, '123');
  assert.equal(model.project(workspace).tweets[0].category, '学习');
});
test('mergeOperation preserves remote changes to unrelated fields', () => {
  assert.equal(typeof model.mergeOperation, 'function');
  const result = model.mergeOperation(record({ note: '旧', readLater: true }), operation({ note: '新' }, { note: '旧', readLater: false }));
  assert.equal(result.data.readLater, true);
  assert.equal(result.data.note, '新');
});
test('concurrent notes preserve both versions without replacing remote note', () => {
  assert.equal(typeof model.mergeOperation, 'function');
  const result = model.mergeOperation(record({ note: '设备B' }), operation({ note: '设备A' }, { note: '原始' }));
  assert.equal(result.data.note, '设备B');
  assert.deepEqual(result.conflicts, [{ id: 'op-1', local: '设备A' }]);
});

test('note size is bounded so conflict metadata cannot exceed Firestore document size', () => {
  assert.throws(() => model.validateTweet({ tweetId: '123', note: '字'.repeat(50000) }), /笔记过长/);
});

test('a record cannot accumulate enough conflicts to block the whole sync queue', () => {
  let remote = record({ note: '云端' });
  for (let index = 0; index < 10; index++) {
    remote = model.mergeOperation(remote, { ...operation({ note: `设备${index}` }, { note: '原始' }), id: `op-${index}` });
  }
  assert.equal(remote.conflicts.length <= model.MAX_NOTE_CONFLICTS, true);
});
test('stale edits cannot resurrect deleted records', () => {
  assert.equal(typeof model.mergeOperation, 'function');
  const remote = record({ note: '旧' }, { deleted: true });
  assert.equal(model.mergeOperation(remote, operation({ note: '离线编辑' }, { note: '旧' })).deleted, true);
});
test('explicit restore can restore a known tombstone', () => {
  assert.equal(typeof model.mergeOperation, 'function');
  const result = model.mergeOperation(record({ note: '旧' }, { deleted: true }), { ...operation({ note: '新' }), restore: true });
  assert.equal(result.deleted, false);
});
test('acknowledge keeps edits queued after an in-flight operation', () => {
  assert.equal(typeof model.emptyWorkspace, 'function');
  let workspace = model.emptyWorkspace();
  workspace = model.enqueueOperation(workspace, 'tweets', '123', { tweetId: '123', note: '第一版' }, { id: 'one' });
  workspace = model.enqueueOperation(workspace, 'tweets', '123', { note: '第二版' }, { id: 'two' });
  workspace = model.acknowledge(workspace, 'one', record({ tweetId: '123', note: '第一版' }));
  assert.equal(workspace.pending.length, 1);
  assert.equal(model.project(workspace).tweets[0].note, '第二版');
});
test('projection moves tweets from deleted categories to uncategorized', () => {
  assert.equal(typeof model.migrateLegacy, 'function');
  const workspace = model.migrateLegacy([{ tweetId: '123', category: '学习' }], ['未分类', '学习']);
  const id = Object.keys(workspace.remote.categories).find(id => id !== 'uncategorized');
  workspace.remote.categories[id].deleted = true;
  assert.equal(model.project(workspace).tweets[0].category, '未分类');
});
test('migration preview counts duplicate tweets and note conflicts', () => {
  assert.equal(typeof model.migrationPreview, 'function');
  const guest = model.migrateLegacy([{ tweetId: '123', note: '本地' }, { tweetId: '456' }], ['未分类']);
  const account = model.migrateLegacy([{ tweetId: '123', note: '云端' }], ['未分类']);
  assert.deepEqual(model.migrationPreview(guest, account), { local: 2, cloud: 1, duplicates: 1, additions: 1, conflicts: 1 });
});
test('migration retains conflicting local note as a queued change', () => {
  assert.equal(typeof model.mergeGuest, 'function');
  const guest = model.migrateLegacy([{ tweetId: '123', note: '本地' }], ['未分类']);
  const account = model.migrateLegacy([{ tweetId: '123', note: '云端' }], ['未分类']);
  const result = model.mergeGuest(guest, account);
  const op = result.pending.find(op => op.collection === 'tweets');
  const merged = model.mergeOperation(account.remote.tweets['123'], op);
  assert.equal(merged.conflicts[0].local, '本地');
});
test('invalid tweet identifiers are rejected before entering the queue', () => {
  assert.equal(typeof model.validateTweet, 'function');
  assert.throws(() => model.validateTweet({ tweetId: '../other' }), /推文/);
});
