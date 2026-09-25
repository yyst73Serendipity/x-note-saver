/**
 * 验证收藏管理页的结构、视觉令牌与关键操作不会在界面改版中丢失。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile('manager/manager.html', 'utf8');
const managerCss = await readFile('manager/manager.css', 'utf8');
const cloudCss = await readFile('manager/cloud-panel.css', 'utf8');
const managerJs = await readFile('manager/manager.js', 'utf8');
const scrollNavigatorJs = await readFile('manager/scroll-navigator.js', 'utf8').catch(() => '');

test('manager uses the approved archive structure and copy', () => {
  assert.match(html, /<h1 class="header-title">我的帖子札记<\/h1>/);
  assert.match(html, /class="cloud-identity"/);
  assert.match(html, /<span class="sidebar-title">分类目录<\/span>/);
  assert.match(html, /这里还没有收藏/);
});

test('sync navigation keeps all current actions', () => {
  const ids = ['cloud-sync', 'cloud-cache', 'cloud-logout'];
  for (const id of ids) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, />配置帮助<\/a>/);
  assert.ok(html.indexOf('cloud-sync') < html.indexOf('cloud-cache'));
  assert.ok(html.indexOf('cloud-cache') < html.indexOf('cloud-logout'));
});

test('category management remains visible to mouse and keyboard users', () => {
  assert.match(html, /id="btn-add-cat"/);
  assert.match(managerCss, /\.category-item:hover \.category-item-actions/);
  assert.match(managerCss, /\.category-item:focus-within \.category-item-actions/);
});

test('manager uses the approved blue theme and responsive layout', () => {
  assert.match(managerCss, /--accent:\s*#2563EB/i);
  assert.match(managerCss, /--accent-status:\s*#3B82F6/i);
  assert.match(managerCss, /--accent-soft:\s*#EAF2FF/i);
  assert.match(managerCss, /--bg-page:\s*#F4F7FA/i);
  assert.match(managerCss, /@media\s*\(max-width:\s*768px\)/);
  assert.match(cloudCss, /\.cloud-actions/);
});

test('unlimited storage is presented as text without a percentage track', () => {
  assert.doesNotMatch(html, /storage-quota-track|storage-quota-fill/);
  assert.doesNotMatch(managerJs, /storageQuotaFill/);
  assert.match(html, /id="storage-quota-text"/);
});

test('post list includes the approved quick navigation rail', () => {
  assert.match(html, /id="post-navigator"/);
  assert.match(html, /aria-label="帖子快速导航"/);
  assert.match(html, /type="module" src="scroll-navigator\.js"/);
  assert.match(managerCss, /\.post-navigator-mark\.is-visible/);
  assert.match(managerCss, /\.post-navigator-mark::before/);
  assert.match(managerCss, /flex:\s*1 1 0/);
  assert.match(managerCss, /\.post-navigator\.is-scrollable/);
  assert.match(managerCss, /\.post-navigator\s*\{[\s\S]*?left:\s*2px/);
  assert.match(managerCss, /\.tweet-list-stage\.has-post-navigator \.tweet-list\s*\{[\s\S]*?padding-left:\s*30px/);
  assert.match(scrollNavigatorJs, /ArrowDown/);
  assert.match(scrollNavigatorJs, /card\.focus\(\{ preventScroll: true \}\)/);
  assert.match(managerCss, /@media\s*\(max-width:\s*768px\)[\s\S]*\.post-navigator/);
});
