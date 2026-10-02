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

test('saving an existing tweet supplements its body and media', () => {
  const data = state.createState([{ tweetId: '123', text: '开头', images: ['https://pbs.twimg.com/media/one.jpg'] }], []);
  const result = state.mutate(data, { action: 'saveTweet', data: { tweetId: '123', text: '开头\n展开后的完整正文', images: ['https://pbs.twimg.com/media/two.jpg'], videoThumbnail: 'https://pbs.twimg.com/amplify_video_thumb/cover.jpg' } });
  assert.equal(result.text, '开头\n展开后的完整正文');
  assert.deepEqual(result.images, ['https://pbs.twimg.com/media/one.jpg', 'https://pbs.twimg.com/media/two.jpg']);
  assert.equal(result.videoThumbnail, 'https://pbs.twimg.com/amplify_video_thumb/cover.jpg');
});

test('recapture preserves personal annotations and the original saved time', () => {
  const data = state.createState([{ tweetId: '123', text: '短文', category: '研究', note: '我的笔记', tags: ['保留'], readLater: true, savedAt: 1234 }], ['研究']);
  const result = state.mutate(data, { action: 'saveTweet', data: { tweetId: '123', text: '展开后的完整正文', category: '未分类', note: '', tags: [], readLater: false, savedAt: 9999 } });
  assert.deepEqual([result.category, result.note, result.tags, result.readLater, result.savedAt], ['研究', '我的笔记', ['保留'], true, 1234]);
});

test('a collapsed recapture never replaces a longer body or removes media', () => {
  const original = { tweetId: '123', text: '已经收藏的完整正文', images: ['https://pbs.twimg.com/media/one.jpg'], videoThumbnail: 'https://pbs.twimg.com/amplify_video_thumb/cover.jpg' };
  const data = state.createState([original], []);
  const result = state.mutate(data, { action: 'saveTweet', data: { tweetId: '123', text: '已经…', images: [], videoThumbnail: '' } });
  for (const field of ['text', 'images', 'videoThumbnail']) assert.deepEqual(result[field], original[field]);
});

test('recaptured content queues a cloud update without personal annotation fields', () => {
  const data = state.createState([], []);
  state.activateAccount(data, { uid: 'A' });
  state.mutate(data, { action: 'saveTweet', data: { tweetId: '123', text: '开头', note: '笔记' } });
  state.mutate(data, { action: 'saveTweet', data: { tweetId: '123', text: '开头和结尾', note: '' } });
  assert.equal(data.accounts.A.pending.length, 2);
  assert.deepEqual(data.accounts.A.pending.at(-1).patch, { text: '开头和结尾' });
});

test('identical recaptures do not create redundant cloud operations', () => {
  const data = state.createState([], []);
  state.activateAccount(data, { uid: 'A' });
  const message = { action: 'saveTweet', data: { tweetId: '123', text: '全文', images: [] } };
  state.mutate(data, message);
  state.mutate(data, message);
  assert.equal(data.accounts.A.pending.length, 1);
});

test('oversized combined recapture fails before changing stored data', () => {
  const original = { tweetId: '123', text: '短文', note: 'n'.repeat(90000) };
  const data = state.createState([original], []);
  assert.throws(() => state.mutate(data, { action: 'saveTweet', data: { tweetId: '123', text: 'x'.repeat(150000) } }), /过长/);
  assert.equal(project(data.guest).tweets[0].text, '短文');
});
