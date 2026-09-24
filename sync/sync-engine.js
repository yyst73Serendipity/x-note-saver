/**
 * 可恢复的同步调度：先拉取再发送，每次回执独立落盘，网络不占用本地写锁。
 */
import { COLLECTIONS, acknowledge } from '../storage/model.js';
import { applyPage } from './snapshot.js';
import { friendlyError } from '../auth/auth-guard.js';

export class SyncEngine {
  constructor(store, cloud, auth) { this.store = store; this.cloud = cloud; this.auth = auth; this.running = null; }
  async status(uid, value) {
    await this.store.update(state => { if (state.activeUid === uid) state.status = value; });
  }
  sync({ force = false } = {}) {
    if (this.running) return this.running;
    this.running = this.run(force).finally(() => { this.running = null; });
    return this.running;
  }
  /** 每轮工作量受限，剩余队列由持久化 alarm 继续处理。 */
  async run(force) {
    const first = await this.store.read();
    const uid = first.activeUid;
    if (!uid || this.auth.currentUser?.uid !== uid) return;
    if (!force && first.status.retryAt > Date.now()) return;
    try {
      await this.status(uid, { phase: 'syncing' });
      console.info('[云同步] 开始同步');
      for (const collection of COLLECTIONS) {
        const state = await this.store.read();
        if (state.activeUid !== uid || this.auth.currentUser?.uid !== uid) return;
        for await (const page of this.cloud.pull(uid, collection, state.accounts[uid].cursors[collection])) {
          await this.store.update(latest => { applyPage(latest.accounts[uid], collection, page); });
          if ((await this.store.read()).activeUid !== uid) return;
        }
      }
      for (let count = 0; count < 100; count++) {
        const state = await this.store.read();
        if (state.activeUid !== uid || this.auth.currentUser?.uid !== uid) return;
        const op = state.accounts[uid].pending[0];
        if (!op) break;
        const remote = await this.cloud.commit(uid, op);
        await this.store.update(latest => { latest.accounts[uid] = acknowledge(latest.accounts[uid], op.id, remote); });
      }
      await this.store.update(state => {
        const workspace = state.accounts[uid];
        workspace.lastSync = Date.now();
        if (state.activeUid === uid) state.status = { phase: workspace.pending.length ? 'pending' : 'synced' };
      });
      const latest = await this.store.read();
      if (latest.activeUid === uid && latest.accounts[uid].pending.length) await chrome.alarms.create('cloud-sync-next', { delayInMinutes: 0.5 });
      console.info('[云同步] 本轮完成');
    } catch (error) {
      const attempts = (first.status.attempts || 0) + 1;
      await this.status(uid, { phase: 'error', message: friendlyError(error), attempts, retryAt: Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(attempts, 7)) });
      console.warn('[云同步] 暂停并保留队列', error.code || error.name);
    }
  }
}
