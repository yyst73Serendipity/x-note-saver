/**
 * 账号空间与统一修改入口，保证所有界面操作经过同一套离线队列。
 */
import { emptyWorkspace, migrateLegacy, project, visibleRecords, enqueueOperation, mergeOperation, validateTweet, mergeGuest, migrationPreview } from './model.js';

export const currentWorkspace = state => state.activeUid ? state.accounts[state.activeUid] : state.guest;
export function createState(tweets, categories) {
  return { version: 2, activeUid: null, user: null, guest: migrateLegacy(tweets, categories), accounts: {}, migrated: {}, status: { phase: 'local' } };
}
/** 登录只切换命名空间，不自动把其他账号或访客数据上传。 */
export function activateAccount(state, user) {
  state.activeUid = user?.uid || null;
  state.user = user ? { uid: user.uid, email: user.email || '', displayName: user.displayName || '' } : null;
  if (user) state.accounts[user.uid] ??= emptyWorkspace();
  state.status = { phase: user ? 'pending' : 'local' };
}

/** 添加操作；访客模式直接合并，登录模式持久保留队列等待云端确认。 */
function change(state, collection, id, patch, options) {
  let space = enqueueOperation(currentWorkspace(state), collection, id, patch, options);
  if (!state.activeUid) {
    const op = space.pending.pop();
    space.remote[collection][id] = mergeOperation(space.remote[collection][id], op);
    state.guest = space;
  } else state.accounts[state.activeUid] = space;
}
function categoryEntry(records, name) {
  return Object.entries(records.categories).find(([, record]) => !record.deleted && record.data.name === name);
}
function categoryName(name) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 40) throw new Error('分类名称需为 1 至 40 个字符');
  return name.trim();
}

/** 处理外部消息中的数据变更，保留旧管理页使用的返回结构。 */
export function mutate(state, message) {
  const records = visibleRecords(currentWorkspace(state));
  const action = message.action;
  const id = String(message.id || '');
  const tweet = records.tweets[id];
  switch (action) {
    case 'importData': {
      if (!message.data || !Array.isArray(message.data.tweets) || (message.data.categories && (!Array.isArray(message.data.categories) || message.data.categories.some(name => typeof name !== 'string')))) throw new Error('导入文件格式无效');
      const imported = migrateLegacy(message.data.tweets, message.data.categories || ['未分类']);
      const preview = migrationPreview(imported, currentWorkspace(state));
      const merged = mergeGuest(imported, currentWorkspace(state));
      if (state.activeUid) state.accounts[state.activeUid] = merged;
      else {
        for (const op of merged.pending) merged.remote[op.collection][op.recordId] = mergeOperation(merged.remote[op.collection][op.recordId], op);
        merged.pending = [];
        state.guest = merged;
      }
      return preview;
    }
    case 'saveTweet': {
      validateTweet(message.data);
      const source = message.data;
      const key = String(source.tweetId);
      if (!records.tweets[key] || records.tweets[key].deleted) {
        const { id: oldId, category, noteConflicts, categoryId: oldCategory, ...data } = source;
        change(state, 'tweets', key, { ...data, tweetId: key, savedAt: source.savedAt || Date.now(), note: source.note || '', tags: source.tags || [], readLater: !!source.readLater,
          categoryId: categoryEntry(records, category)?.[0] || 'uncategorized' }, { restore: !!records.tweets[key]?.deleted });
      }
      return project(currentWorkspace(state)).tweets.find(t => t.id === key);
    }
    case 'deleteTweet':
      if (!tweet || tweet.deleted) throw new Error('推文不存在');
      change(state, 'tweets', id, {}, { deleted: true });
      return project(currentWorkspace(state)).tweets;
    case 'updateNoteTags':
    case 'updateReadLater':
    case 'updateCategory':
    case 'resolveConflict': {
      if (!tweet || tweet.deleted) throw new Error('推文不存在');
      let patch;
      if (action === 'updateReadLater') patch = { readLater: !!message.readLater };
      else if (action === 'updateCategory') {
        const entry = categoryEntry(records, message.category);
        if (!entry) throw new Error('分类不存在');
        patch = { categoryId: entry[0] };
      } else if (action === 'resolveConflict') {
        if (typeof message.note !== 'string' || !Array.isArray(message.resolveIds) || message.resolveIds.some(id => typeof id !== 'string')) throw new Error('冲突处理内容无效');
        patch = { note: message.note };
      } else {
        if (typeof message.note !== 'string' || !Array.isArray(message.tags)) throw new Error('笔记或标签格式无效');
        patch = { note: message.note, tags: message.tags };
      }
      validateTweet({ ...tweet.data, ...patch });
      change(state, 'tweets', id, patch, action === 'resolveConflict' ? { resolveIds: message.resolveIds } : undefined);
      return project(currentWorkspace(state)).tweets.find(t => t.id === id);
    }
    case 'addCategory': {
      const name = categoryName(message.name);
      if (categoryEntry(records, name)) throw new Error('分类已存在');
      const key = crypto.randomUUID();
      change(state, 'categories', key, { name });
      change(state, 'settings', 'main', { order: [...(records.settings.main?.data.order || ['uncategorized']), key] });
      break;
    }
    case 'renameCategory': {
      const name = categoryName(message.newName);
      const entry = categoryEntry(records, message.oldName);
      if (!entry) throw new Error('分类不存在');
      if (entry[0] === 'uncategorized') throw new Error('「未分类」不可重命名');
      if (categoryEntry(records, name)) throw new Error('目标分类名已存在');
      change(state, 'categories', entry[0], { name });
      break;
    }
    case 'deleteCategory': {
      const entry = categoryEntry(records, message.name);
      if (!entry) throw new Error('分类不存在');
      if (entry[0] === 'uncategorized') throw new Error('「未分类」不可删除');
      change(state, 'categories', entry[0], {}, { deleted: true });
      break;
    }
    case 'reorderCategories': {
      const active = Object.entries(records.categories).filter(([id, r]) => id !== 'uncategorized' && !r.deleted);
      if (!Array.isArray(message.newOrder) || message.newOrder.length !== active.length || new Set(message.newOrder).size !== active.length || message.newOrder.some(name => !categoryEntry(records, name))) throw new Error('分类数据不一致，请刷新后重试');
      change(state, 'settings', 'main', { order: ['uncategorized', ...message.newOrder.map(name => categoryEntry(records, name)[0])] });
      break;
    }
    case 'clearAll':
      for (const [key, record] of Object.entries(records.tweets)) if (!record.deleted) change(state, 'tweets', key, {}, { deleted: true });
      for (const [key, record] of Object.entries(records.categories)) if (key !== 'uncategorized' && !record.deleted) change(state, 'categories', key, {}, { deleted: true });
      change(state, 'settings', 'main', { order: ['uncategorized'] });
      return project(currentWorkspace(state));
    default: throw new Error('未知的数据修改操作');
  }
  return project(currentWorkspace(state)).categories;
}
