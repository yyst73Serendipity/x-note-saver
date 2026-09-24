/**
 * 验证同步快照合并，不使用假的远程服务返回值。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyWorkspace, enqueueOperation, project } from '../storage/model.js';
const snapshots = await import('../sync/snapshot.js').catch(() => ({}));
test('older cloud snapshot cannot overwrite a newer acknowledged revision', () => {
  assert.equal(typeof snapshots.applyPage, 'function');
  const space = emptyWorkspace();
  space.remote.tweets['123'] = { data: { tweetId: '123', note: '新版' }, revision: 3, deleted: false, conflicts: [] };
  snapshots.applyPage(space, 'tweets', { records: [{ id: '123', record: { data: { tweetId: '123', note: '旧版' }, revision: 2, deleted: false, conflicts: [] } }], cursor: { seconds: 1, nanoseconds: 0 } });
  assert.equal(project(space).tweets[0].note, '新版');
});
test('cloud pull preserves pending local edits', () => {
  assert.equal(typeof snapshots.applyPage, 'function');
  const space = enqueueOperation(emptyWorkspace(), 'tweets', '123', { tweetId: '123', note: '本地未发送' });
  snapshots.applyPage(space, 'tweets', { records: [{ id: '123', record: { data: { tweetId: '123', note: '云端' }, revision: 1, deleted: false, conflicts: [] } }], cursor: { seconds: 1, nanoseconds: 0 } });
  assert.equal(project(space).tweets[0].note, '本地未发送');
});
