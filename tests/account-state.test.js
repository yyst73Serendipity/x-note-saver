/**
 * 验证账号切换、旧数据保护和统一数据修改入口。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
const state = await import('../storage/account-state.js').catch(() => ({}));
const { project } = await import('../storage/model.js');

test('switching accounts never moves pending changes into another account', () => {
  assert.equal(typeof state.createState, 'function');
  const data = state.createState([], ['未分类']);
  state.activateAccount(data, { uid: 'A', email: 'a@example.com' });
  state.mutate(data, { action: 'saveTweet', data: { tweetId: '123', text: 'A' } });
  state.activateAccount(data, { uid: 'B', email: 'b@example.com' });
  assert.equal(state.currentWorkspace(data).pending.length, 0);
  assert.equal(project(state.currentWorkspace(data)).tweets.length, 0);
  assert.equal(data.accounts.A.pending.length, 1);
});
test('guest mode writes locally without creating a cloud queue', () => {
  assert.equal(typeof state.createState, 'function');
  const data = state.createState([], ['未分类']);
  state.mutate(data, { action: 'saveTweet', data: { tweetId: '123', note: '离线' } });
  assert.equal(data.guest.pending.length, 0);
  assert.equal(project(data.guest).tweets[0].note, '离线');
});
test('deleting then saving a known tweet creates explicit restoration', () => {
  assert.equal(typeof state.createState, 'function');
  const data = state.createState([], ['未分类']);
  state.activateAccount(data, { uid: 'A' });
  state.mutate(data, { action: 'saveTweet', data: { tweetId: '123' } });
  state.mutate(data, { action: 'deleteTweet', id: '123' });
  state.mutate(data, { action: 'saveTweet', data: { tweetId: '123' } });
  assert.equal(data.accounts.A.pending.at(-1).restore, true);
});
test('renaming a category preserves tweet membership', () => {
  assert.equal(typeof state.createState, 'function');
  const data = state.createState([{ tweetId: '123', category: '旧名' }], ['未分类', '旧名']);
  state.mutate(data, { action: 'renameCategory', oldName: '旧名', newName: '新名' });
  assert.equal(project(data.guest).tweets[0].category, '新名');
});
test('clear all queues tombstones instead of replacing cloud with an empty array', () => {
  assert.equal(typeof state.createState, 'function');
  const data = state.createState([], ['未分类']);
  state.activateAccount(data, { uid: 'A' });
  state.mutate(data, { action: 'saveTweet', data: { tweetId: '123' } });
  state.mutate(data, { action: 'clearAll' });
  assert.equal(data.accounts.A.pending.some(op => op.recordId === '123' && op.deleted), true);
});
test('backup import preserves conflicting notes instead of silently skipping duplicates', () => {
  const data = state.createState([{ tweetId: '123', note: '当前笔记' }], ['未分类']);
  state.mutate(data, { action: 'importData', data: { tweets: [{ tweetId: '123', note: '备份笔记' }], categories: ['未分类'] } });
  const tweet = project(data.guest).tweets[0];
  assert.equal(tweet.note, '当前笔记');
  assert.equal(tweet.noteConflicts[0].local, '备份笔记');
});
test('invalid import fails before adding any new records', () => {
  const data = state.createState([], ['未分类']);
  assert.throws(() => state.mutate(data, { action: 'importData', data: { tweets: [{ tweetId: '123' }, { tweetId: '../invalid' }], categories: [] } }), /推文/);
  assert.equal(project(data.guest).tweets.length, 0);
});
