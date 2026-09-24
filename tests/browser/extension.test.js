/**
 * 使用真实 Chromium 与隔离用户目录验证未打包扩展、本地存储和管理页。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

test('unpacked extension supports save, edit, category rename, delete and restart without cloud configuration', { timeout: 90000 }, async () => {
  const profile = await mkdtemp(join(tmpdir(), 'x-note-browser-'));
  const extension = resolve('dist/extension');
  const id = (await readFile('dist/extension-id.txt', 'utf8')).trim();
  const options = { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] };
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, options);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`chrome-extension://${id}/manager/manager.html`);
    await page.waitForFunction(() => document.getElementById('cloud-status').textContent.includes('未配置'));
    const send = (action, args = {}) => page.evaluate(async ({ action, args }) => {
      const response = await chrome.runtime.sendMessage({ action, ...args });
      if (!response.success) throw new Error(response.error);
      return response.data;
    }, { action, args });
    await send('saveTweet', { data: { tweetId: '123', text: '浏览器测试正文', note: '', tags: [], url: 'https://x.com/test/status/123' } });
    await page.getByText('浏览器测试正文', { exact: true }).waitFor();
    await send('updateNoteTags', { id: '123', note: '持久笔记', tags: ['测试'] });
    await send('addCategory', { name: '旧分类' });
    await send('updateCategory', { id: '123', category: '旧分类' });
    await send('renameCategory', { oldName: '旧分类', newName: '新分类' });
    assert.equal((await send('getTweets'))[0].category, '新分类');
    await page.getByRole('button', { name: '使用 Google 登录', exact: true }).click();
    await page.getByText('先配置免费云服务', { exact: true }).waitFor();
    await page.getByRole('button', { name: '取消', exact: true }).last().click();
    assert.deepEqual(errors, []);
    await context.close();
    context = await chromium.launchPersistentContext(profile, options);
    const restored = await context.newPage();
    await restored.goto(`chrome-extension://${id}/manager/manager.html`);
    await restored.getByText('持久笔记', { exact: true }).waitFor();
    const response = await restored.evaluate(() => chrome.runtime.sendMessage({ action: 'deleteTweet', id: '123' }));
    assert.equal(response.success, true);
    await restored.waitForFunction(() => !document.querySelector('.tweet-card'));
  } finally {
    if (context) await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
