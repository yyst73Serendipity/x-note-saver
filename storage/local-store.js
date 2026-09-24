/**
 * 将账号状态、待同步队列和界面投影原子写入 Chrome 本地存储。
 */
import { createState, currentWorkspace } from './account-state.js';
export const STATE_KEY = 'x_note_state_v2';

export class LocalStore {
  constructor() { this.tail = Promise.resolve(); }
  /** 所有写入串行执行，避免两个页面读改写时丢失更新。 */
  update(callback) {
    const task = this.tail.then(async () => {
      const saved = await chrome.storage.local.get([STATE_KEY, 'twitter_notes', 'twitter_categories']);
      const state = saved[STATE_KEY] || createState(saved.twitter_notes || [], saved.twitter_categories || ['未分类']);
      const result = await callback(state);
      await chrome.storage.local.set({ [STATE_KEY]: state });
      if (!saved[STATE_KEY]) {
        // v2 状态成功落盘后才移除旧键，避免升级过程中同时保留两份完整收藏。
        await chrome.storage.local.remove(['twitter_notes', 'twitter_categories']);
      }
      // 内容脚本不直接读取私有存储，通过受限消息刷新收藏星标。
      const tabs = await chrome.tabs.query({ url: ['*://*.x.com/*'] });
      for (const tab of tabs) chrome.tabs.sendMessage(tab.id, { action: 'dataChanged' }).catch(() => {});
      return result;
    });
    this.tail = task.catch(() => {});
    return task;
  }
  async read() {
    await this.tail;
    const saved = await chrome.storage.local.get(STATE_KEY);
    return saved[STATE_KEY];
  }
}
