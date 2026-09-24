/**
 * 纯数据模型：迁移旧收藏、生成离线操作、合并并发修改并生成界面投影。
 */
export const COLLECTIONS = ['tweets', 'categories', 'settings'];
export const MAX_NOTE_BYTES = 96 * 1024;
export const MAX_NOTE_CONFLICTS = 6;
export const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const newRecord = data => ({ data, revision: 0, deleted: false, conflicts: [] });
const categoryId = name => `cat-${Array.from(new TextEncoder().encode(name), n => n.toString(16).padStart(2, '0')).join('')}`;

/** 创建与其他账号完全独立的数据空间。 */
export function emptyWorkspace() {
  return { remote: { tweets: {}, categories: { uncategorized: newRecord({ name: '未分类' }) }, settings: {} }, pending: [], cursors: {}, lastSync: null };
}

/** 拒绝非法云端路径与过大内容，仅在外部输入边界调用。 */
export function validateTweet(tweet) {
  if (!tweet || !/^\d{1,30}$/.test(tweet.tweetId || '')) throw new Error('推文编号无效');
  if (new TextEncoder().encode(tweet.note || '').length > MAX_NOTE_BYTES) throw new Error('笔记过长，请控制在 96 KB 以内');
  if (new TextEncoder().encode(JSON.stringify(tweet)).length > 200000) throw new Error('推文与笔记过长，请拆分后保存');
  for (const field of ['url', 'avatar', 'videoThumbnail']) {
    if (tweet[field] && !/^https?:\/\//i.test(tweet[field])) throw new Error('推文链接必须使用 HTTP 或 HTTPS');
  }
  if (tweet.images && (!Array.isArray(tweet.images) || tweet.images.some(url => typeof url !== 'string' || !/^https?:\/\//i.test(url)))) throw new Error('推文图片链接无效');
  if (tweet.tags && (!Array.isArray(tweet.tags) || tweet.tags.some(tag => typeof tag !== 'string'))) throw new Error('标签格式无效');
}

/** 将旧格式转换为稳定帖子 ID 与分类 ID，原始数据由存储层保留备份。 */
export function migrateLegacy(tweets = [], categories = ['未分类']) {
  const workspace = emptyWorkspace();
  const names = [...new Set(['未分类', ...categories, ...tweets.map(t => t.category || '未分类')])];
  const ids = Object.fromEntries(names.map(name => [name, name === '未分类' ? 'uncategorized' : categoryId(name)]));
  names.forEach(name => { workspace.remote.categories[ids[name]] = newRecord({ name }); });
  workspace.remote.settings.main = newRecord({ order: names.map(name => ids[name]) });
  for (const source of tweets) {
    validateTweet(source);
    const { id, category, ...data } = source;
    const record = newRecord({ ...data, tweetId: String(source.tweetId), note: source.note || '', tags: source.tags || [], savedAt: source.savedAt || Date.now(), categoryId: ids[category || '未分类'] });
    workspace.remote.tweets[String(source.tweetId)] ??= record;
  }
  return workspace;
}

/** 获取当前本地视图，尚未上传的编辑始终覆盖旧快照。 */
export function visibleRecords(workspace) {
  const records = structuredClone(workspace.remote);
  for (const op of workspace.pending) {
    const previous = records[op.collection][op.recordId] || newRecord({});
    if (previous.deleted && !op.restore && !op.deleted) continue;
    records[op.collection][op.recordId] = { ...previous, data: { ...previous.data, ...op.patch }, deleted: op.deleted,
      conflicts: op.resolveIds ? previous.conflicts.filter(item => !op.resolveIds.includes(item.id)) : previous.conflicts };
  }
  return records;
}

/** 向旧管理页面提供兼容结构，删除分类下的帖子自动归入未分类。 */
export function project(workspace) {
  const records = visibleRecords(workspace);
  const active = Object.entries(records.categories).filter(([, r]) => !r.deleted);
  const order = records.settings.main?.data.order || [];
  active.sort(([a], [b]) => (a === 'uncategorized' ? -1 : b === 'uncategorized' ? 1 : (order.indexOf(a) < 0 ? 99999 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99999 : order.indexOf(b)) || a.localeCompare(b)));
  const categoryNames = Object.fromEntries(active.map(([id, record]) => [id, record.data.name]));
  const tweets = Object.entries(records.tweets).filter(([, r]) => !r.deleted).map(([id, r]) => ({ ...r.data, id, category: categoryNames[r.data.categoryId] || '未分类', noteConflicts: r.conflicts || [] }));
  tweets.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  return { tweets, categories: [...new Set(['未分类', ...active.map(([, r]) => r.data.name)])] };
}

/** 为修改保存原始字段值，支持联网后的三方合并。 */
export function enqueueOperation(workspace, collection, recordId, patch, options = {}) {
  const next = structuredClone(workspace);
  const current = visibleRecords(workspace)[collection][recordId];
  next.pending.push({ id: options.id || crypto.randomUUID(), collection, recordId, patch,
    base: options.base ?? current?.data ?? {}, deleted: options.deleted || false, restore: options.restore || false,
    ...(options.resolveIds ? { resolveIds: options.resolveIds } : {}) });
  return next;
}

/** 合并一项操作：删除优先；不同字段互不覆盖；笔记冲突保留双方。 */
export function mergeOperation(remote, op) {
  const previous = remote || newRecord({});
  if (previous.deleted && !op.restore && !op.deleted) return previous;
  const result = structuredClone(previous);
  result.revision += 1;
  result.deleted = op.deleted;
  // 只有基于同一笔记版本解决冲突时才移除旧冲突，避免覆盖第三台设备的新编辑。
  if (op.resolveIds && same(previous.data.note, op.base.note)) result.conflicts = result.conflicts.filter(c => !op.resolveIds.includes(c.id));
  for (const [key, value] of Object.entries(op.patch)) {
    if (key === 'note' && !same(previous.data.note, op.base.note) && !same(previous.data.note, value) && !op.restore) {
      if (!result.conflicts.some(c => c.id === op.id)) {
        // 当前正文已经保存 remote 版本，冲突项只保存另一份笔记，避免重复正文撑大文档。
        result.conflicts.push({ id: op.id, local: value });
        result.conflicts = result.conflicts.slice(-MAX_NOTE_CONFLICTS);
      }
    } else result.data[key] = value;
  }
  return result;
}

/** 确认一项云端操作后仍重放后续本地操作，避免上传期间编辑丢失。 */
export function acknowledge(workspace, operationId, remote) {
  const next = structuredClone(workspace);
  const op = next.pending.find(item => item.id === operationId);
  if (!op) return next;
  const current = next.remote[op.collection][op.recordId];
  if (!current || remote.revision >= current.revision) next.remote[op.collection][op.recordId] = remote;
  next.pending = next.pending.filter(item => item.id !== operationId);
  return next;
}

/** 只读迁移预览，确认前不向云端写入旧收藏。 */
export function migrationPreview(guest, account) {
  const local = project(guest).tweets;
  const cloud = project(account).tweets;
  const byId = new Map(cloud.map(t => [t.tweetId, t]));
  const duplicates = local.filter(t => byId.has(t.tweetId));
  return { local: local.length, cloud: cloud.length, duplicates: duplicates.length, additions: local.length - duplicates.length,
    conflicts: duplicates.filter(t => t.note && byId.get(t.tweetId).note && t.note !== byId.get(t.tweetId).note).length };
}

/** 合并旧收藏，重复帖子不覆盖云端正文，冲突笔记交由事务保留。 */
export function mergeGuest(guest, account) {
  let result = structuredClone(account);
  const local = visibleRecords(guest);
  let current = visibleRecords(result);
  const mapping = { uncategorized: 'uncategorized' };
  for (const [id, record] of Object.entries(local.categories)) {
    if (record.deleted || id === 'uncategorized') continue;
    const existing = Object.entries(current.categories).find(([, r]) => !r.deleted && r.data.name === record.data.name);
    const target = existing?.[0] || id;
    mapping[id] = target;
    if (!existing) result = enqueueOperation(result, 'categories', target, record.data, { restore: true });
  }
  current = visibleRecords(result);
  for (const [id, record] of Object.entries(local.tweets)) {
    if (record.deleted || current.tweets[id]?.deleted) continue;
    const existing = current.tweets[id];
    if (!existing) result = enqueueOperation(result, 'tweets', id, { ...record.data, categoryId: mapping[record.data.categoryId] || 'uncategorized' });
    else {
      const patch = {};
      if (record.data.note && record.data.note !== existing.data.note) patch.note = record.data.note;
      const tags = [...new Set([...(existing.data.tags || []), ...(record.data.tags || [])])];
      if (!same(tags, existing.data.tags || [])) patch.tags = tags;
      if (Object.keys(patch).length) result = enqueueOperation(result, 'tweets', id, patch, { base: { ...existing.data, note: '' } });
    }
  }
  const order = [...new Set([...(current.settings.main?.data.order || ['uncategorized']), ...(local.settings.main?.data.order || []).map(id => mapping[id]).filter(Boolean)])];
  result = enqueueOperation(result, 'settings', 'main', { order });
  return result;
}
