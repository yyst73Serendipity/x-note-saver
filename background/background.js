/**
 * 扩展后台：统一存储入口、账号隔离、旧数据迁移与可恢复云同步。
 */
import { LocalStore } from '../storage/local-store.js';
import { activateAccount, currentWorkspace, mutate } from '../storage/account-state.js';
import { project, emptyWorkspace, migrationPreview, mergeGuest, migrateLegacy } from '../storage/model.js';
import { firebaseClient } from '../auth/firebase-client.js';
import { login, logout } from '../auth/auth-service.js';
import { friendlyError, isConfigured } from '../auth/auth-guard.js';
import { config } from '../config/firebase-config.js';
import { CloudStore } from '../sync/cloud-store.js';
import { SyncEngine } from '../sync/sync-engine.js';

const store = new LocalStore();
const client = firebaseClient();
const engine = client ? new SyncEngine(store, new CloudStore(client.db), client.auth) : null;
const ready = (async () => {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await store.update(() => {});
  if (client) {
    await client.auth.authStateReady();
    await store.update(state => {
      // 登录过期时保留账号空间供离线使用，不把它降为访客或转给其他账号。
      if (client.auth.currentUser) {
        const user = client.auth.currentUser;
        if (!config.ownerUid || user.uid === config.ownerUid) activateAccount(state, user);
      } else if (state.activeUid) state.status = { phase: 'error', message: '请重新登录以恢复同步，本地修改已保留' };
    });
  }
  if (!await chrome.alarms.get('cloud-sync')) await chrome.alarms.create('cloud-sync', { periodInMinutes: 1 });
})();
const schedule = () => { ready.then(() => engine?.sync()).catch(error => console.warn('[同步初始化] 失败', error.name)); };
chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name.startsWith('cloud-sync')) schedule(); });
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL('manager/manager.html') }));

/** 只向扩展自身管理页开放账号、迁移、清空与冲突操作。 */
function managerSender(sender) {
  return sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL('manager/manager.html');
}
const contentActions = new Set(['getTweets', 'getCategories', 'saveTweet', 'addCategory']);

async function handle(message, sender) {
  await ready;
  if (sender.id !== chrome.runtime.id) throw new Error('消息来源无效');
  const manager = managerSender(sender);
  if (!manager && !contentActions.has(message.action)) throw new Error('此操作只允许在收藏管理页执行');
  const state = await store.read();
  const workspace = currentWorkspace(state);
  switch (message.action) {
    case 'getTweets': return project(workspace).tweets;
    case 'getCategories': return project(workspace).categories;
    case 'cloudStatus': return { ...state.status, configured: isConfigured(config), ownerConfigured: !!config.ownerUid, user: state.user,
      pending: workspace.pending.length, lastSync: workspace.lastSync, migrationAvailable: !!state.activeUid && !state.migrated[state.activeUid] && (project(state.guest).tweets.length > 0 || project(state.guest).categories.length > 1) };
    case 'cloudLogin': {
      const user = await login();
      await store.update(latest => activateAccount(latest, user));
      schedule();
      return { uid: user.uid, email: user.email };
    }
    case 'cloudLogout':
      await logout();
      await store.update(latest => activateAccount(latest, null));
      return true;
    case 'syncNow':
      if (!engine || !state.activeUid) throw new Error('请先配置 Firebase 并登录');
      await engine.sync({ force: true });
      return true;
    case 'importPreview': {
      if (!message.data || !Array.isArray(message.data.tweets) || (message.data.categories && (!Array.isArray(message.data.categories) || message.data.categories.some(name => typeof name !== 'string')))) throw new Error('导入文件格式无效');
      return migrationPreview(migrateLegacy(message.data.tweets, message.data.categories || ['未分类']), workspace);
    }
    case 'migrationPreview': {
      if (!state.activeUid) throw new Error('请先登录');
      await engine.sync({ force: true });
      const fresh = await store.read();
      if (fresh.activeUid !== state.activeUid) throw new Error('账号已切换，请重新预览');
      if (fresh.status.phase === 'error') throw new Error(fresh.status.message);
      return { ...migrationPreview(fresh.guest, currentWorkspace(fresh)), uid: fresh.activeUid, backup: project(fresh.guest) };
    }
    case 'confirmMigration': {
      await store.update(latest => {
        if (!latest.activeUid || latest.activeUid !== message.uid) throw new Error('账号已切换，请重新预览');
        if (latest.migrated[latest.activeUid]) throw new Error('本地数据已迁移');
        latest.accounts[latest.activeUid] = mergeGuest(latest.guest, currentWorkspace(latest));
        latest.migrated[latest.activeUid] = true;
        latest.guest = emptyWorkspace();
        latest.status = { phase: 'pending' };
      });
      schedule();
      return true;
    }
    case 'clearCache':
      await store.update(latest => {
        if (!latest.activeUid) throw new Error('纯本地模式没有可恢复的云端缓存，请先导出或登录');
        if (currentWorkspace(latest).pending.length) throw new Error('仍有待同步修改，请同步完成后再清理缓存');
        if (latest.status.phase === 'syncing') throw new Error('正在同步，请完成后再清理缓存');
        latest.accounts[latest.activeUid] = emptyWorkspace();
        latest.status = { phase: 'pending' };
      });
      schedule();
      return true;
    default: {
      const result = await store.update(latest => {
        const value = mutate(latest, message);
        if (latest.activeUid) latest.status = { phase: 'pending' };
        return value;
      });
      console.info('[收藏数据] 已保存操作', message.action);
      schedule();
      return result;
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.target === 'auth-offscreen') return false;
  if (message.target === 'auth-heartbeat') { respond({ ok: true }); return false; }
  handle(message, sender).then(data => respond({ success: true, data })).catch(error => {
    console.warn('[后台操作] 失败', message.action, error.code || error.name);
    respond({ success: false, error: friendlyError(error) });
  });
  return true;
});
schedule();
