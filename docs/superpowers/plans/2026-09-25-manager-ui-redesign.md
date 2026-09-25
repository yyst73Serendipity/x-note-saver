<!--
  收藏管理页 UI 改版实施计划：按测试、结构、样式、验证和文档拆分可执行步骤。
-->

# 收藏管理页 UI 改版实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将收藏管理页改造成已确认的蓝色资料库界面，同时保留账号同步、收藏管理和分类管理的全部现有行为。

**Architecture:** 继续使用现有 `manager.html`、`manager.js` 和 `cloud-panel.js` 的 DOM ID 作为行为接口，只调整语义分组、文案和样式类。视觉令牌和主体布局集中在 `manager.css`，账号同步区集中在 `cloud-panel.css`；删除无实际比例意义的缓存进度条，但保留真实缓存大小计算。

**Tech Stack:** Chrome Extension Manifest V3、原生 HTML/CSS/JavaScript、Node.js `node:test`、现有 esbuild 构建脚本。

## Global Constraints

- 主色为 `#2563EB`，状态蓝为 `#3B82F6`，选中背景为 `#EAF2FF`，页面背景为 `#F4F7FA`。
- 同步栏右侧必须继续显示“立即同步、清除本机缓存、退出登录、配置帮助”，不增加更多菜单。
- 必须保留分类的新建、拖拽排序、重命名、删除和数量统计。
- 不改变 Firebase 登录、Firestore 数据模型、安全规则、迁移、冲突处理或离线同步逻辑。
- 不新增第三方依赖。
- 面向用户的新增文案使用中文；新增源码文件顶部使用中文多行注释。
- 常见桌面宽度和窄窗口下不得出现页面级横向溢出，所有交互保留可见键盘焦点。

---

## File Map

- Create: `tests/manager-ui.test.js` — 固化已确认的结构、主题变量、同步操作、分类可访问性和缓存展示契约。
- Modify: `manager/manager.html` — 调整标题、同步栏分组、分类标题、空状态和缓存信息结构。
- Modify: `manager/manager.js` — 删除缓存进度条 DOM 依赖，只更新真实缓存大小文字。
- Modify: `manager/manager.css` — 实现蓝色资料库主题、双栏布局、卡片、空状态、分类操作、窄屏和焦点样式。
- Modify: `manager/cloud-panel.css` — 实现账号同步栏、按钮、状态和弹窗的统一视觉。
- Modify: `README.md` — 更新页面使用说明中的界面名称、同步状态和缓存展示说明。

### Task 1: 固化管理页结构和行为契约

**Files:**
- Create: `tests/manager-ui.test.js`

**Interfaces:**
- Consumes: `manager/manager.html`、`manager/manager.css`、`manager/cloud-panel.css`、`manager/manager.js` 的静态源码。
- Produces: 后续任务必须满足的 UI 合同测试，不导出运行时接口。

- [ ] **Step 1: 写入失败的结构合同测试**

创建 `tests/manager-ui.test.js`：

```js
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
```

- [ ] **Step 2: 运行测试并确认当前页面不满足新设计**

Run: `node --test tests/manager-ui.test.js`

Expected: FAIL，至少包含“我的帖子札记”“cloud-identity”“分类目录”或蓝色变量断言失败。

- [ ] **Step 3: 提交测试基线**

```bash
git add tests/manager-ui.test.js
git commit -m "测试: 固化管理页改版契约"
```

### Task 2: 调整页面语义结构和缓存展示

**Files:**
- Modify: `manager/manager.html`
- Modify: `manager/manager.js`

**Interfaces:**
- Consumes: Task 1 的静态合同测试；现有 DOM ID、`chrome.runtime.sendMessage` 和 `chrome.storage.local.getBytesInUse`。
- Produces: 保持原 ID 的新页面结构，以及只写入 `#storage-quota-text` 的 `updateStorageQuota()`。

- [ ] **Step 1: 更新标题、同步身份分组和分类文案**

在 `manager/manager.html` 中保留所有行为 ID，并将对应片段改为：

```html
<header class="header">
  <div class="header-left">
    <span class="header-eyebrow">PERSONAL ARCHIVE</span>
    <h1 class="header-title">我的帖子札记</h1>
    <span class="header-subtitle">把值得回看的内容，整理成自己的资料库</span>
  </div>
  <div class="header-actions">
    <button class="btn-header" id="btn-export">导出备份</button>
    <button class="btn-header" id="btn-import">导入</button>
    <button class="btn-header btn-header-danger" id="btn-clear">清空</button>
  </div>
</header>

<section class="cloud-panel" aria-label="账号与云同步">
  <div class="cloud-identity">
    <span class="cloud-status-dot" aria-hidden="true"></span>
    <strong id="cloud-account">本地收藏</strong>
    <span id="cloud-status" role="status" aria-live="polite">正在读取同步状态…</span>
  </div>
  <div class="cloud-actions">
    <button id="cloud-login" type="button">使用 Google 登录</button>
    <button id="cloud-sync" type="button" hidden>立即同步</button>
    <button id="cloud-migrate" type="button" hidden>迁移本地收藏</button>
    <button id="cloud-conflicts" type="button" hidden>处理笔记冲突</button>
    <button id="cloud-cache" type="button" hidden>清除本机缓存</button>
    <button id="cloud-logout" type="button" hidden>退出登录</button>
    <a href="setup.html" target="_blank" rel="noopener">配置帮助</a>
  </div>
</section>
```

将侧边栏标题改为“分类目录”，空状态改为：

```html
<div class="empty-state" id="empty-state">
  <div class="empty-icon" aria-hidden="true">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
    </svg>
  </div>
  <p>这里还没有收藏</p>
  <p class="empty-hint">前往 X，在帖子操作栏点击星形按钮</p>
</div>
<div class="storage-quota-bar" id="storage-quota-bar">
  <span class="storage-quota-text" id="storage-quota-text"></span>
</div>
```

- [ ] **Step 2: 删除缓存进度条的脚本依赖**

从 `manager/manager.js` 删除 `storageQuotaFill` 引用，把 `updateStorageQuota()` 改成只设置文字和状态类：

```js
/**
 * 更新本机缓存说明；拥有 unlimitedStorage 时不展示没有固定分母的百分比。
 */
async function updateStorageQuota() {
  try {
    const bytesInUse = await chrome.storage.local.getBytesInUse(null);
    const unlimited = await chrome.permissions.contains({ permissions: ['unlimitedStorage'] });
    const unit = bytesInUse < 1024 * 1024 ? 'KB' : 'MB';
    const divisor = unit === 'KB' ? 1024 : 1024 * 1024;
    const usedText = `${(bytesInUse / divisor).toFixed(1)} ${unit}`;

    storageQuotaBar.classList.remove('warning', 'critical');
    if (unlimited) {
      storageQuotaText.textContent = `本地缓存 ${usedText} · 已启用扩展存储权限`;
      return;
    }

    const quotaBytes = chrome.storage.local.QUOTA_BYTES || 10 * 1024 * 1024;
    const percent = bytesInUse / quotaBytes * 100;
    storageQuotaText.textContent = `本地存储 ${usedText} · 已使用 ${percent.toFixed(0)}%`;
    if (percent >= 95) storageQuotaBar.classList.add('critical');
    else if (percent >= 80) storageQuotaBar.classList.add('warning');
  } catch (error) {
    storageQuotaText.textContent = '无法读取本机缓存用量';
  }
}
```

- [ ] **Step 3: 运行结构测试，确认仍只剩样式断言失败**

Run: `node --test tests/manager-ui.test.js`

Expected: 标题、同步按钮顺序和缓存结构测试 PASS；蓝色变量或键盘焦点测试仍 FAIL。

- [ ] **Step 4: 提交语义结构**

```bash
git add manager/manager.html manager/manager.js
git commit -m "优化: 调整管理页信息结构"
```

### Task 3: 实现蓝色资料库主题和完整交互状态

**Files:**
- Modify: `manager/manager.css`
- Modify: `manager/cloud-panel.css`

**Interfaces:**
- Consumes: Task 2 的 `.header-eyebrow`、`.cloud-identity`、`.cloud-status-dot`、`.storage-quota-bar` 和现有分类、帖子、弹窗类名。
- Produces: 统一视觉令牌、桌面双栏、窄屏单栏、鼠标与键盘等价状态。

- [ ] **Step 1: 替换主题变量和页面骨架样式**

在 `manager/manager.css` 中使用以下变量，并据此替换散落的旧 Twitter 蓝灰颜色：

```css
:root {
  --bg-page: #F4F7FA;
  --bg-sidebar: #FFFFFF;
  --bg-sidebar-hover: #F8FAFC;
  --bg-sidebar-active: #EAF2FF;
  --text-primary: #111827;
  --text-secondary: #64748B;
  --text-muted: #94A3B8;
  --accent: #2563EB;
  --accent-hover: #1D4ED8;
  --accent-status: #3B82F6;
  --accent-soft: #EAF2FF;
  --bg-card: #FFFFFF;
  --bg-card-hover: #F8FAFC;
  --border-card: #DFE6ED;
  --border-subtle: #E8EDF3;
  --danger: #DC2626;
  --danger-hover: #B91C1C;
  --shadow-card: 0 8px 24px rgb(15 23 42 / 5%);
  --shadow-card-hover: 0 12px 30px rgb(15 23 42 / 8%);
  --radius-sm: 10px;
  --radius-md: 12px;
  --radius-lg: 14px;
  --radius-full: 9999px;
}

.app { max-width: 1180px; padding: 28px 28px 0; }
.header { align-items: center; margin-bottom: 14px; padding: 20px 22px; background: #fff; border: 1px solid var(--border-card); border-radius: var(--radius-lg); }
.header-eyebrow { color: var(--accent); font-size: 10px; font-weight: 800; letter-spacing: 1.5px; }
.header-title { font-family: "Songti SC", "STSong", "Noto Serif CJK SC", serif; font-size: 24px; }
.main { gap: 16px; padding-top: 16px; }
.sidebar { width: 210px; border-radius: var(--radius-lg); }
.content { background: #fff; border: 1px solid var(--border-card); border-radius: var(--radius-lg); padding: 14px; margin-bottom: 24px; }
```

- [ ] **Step 2: 完成分类、搜索、空状态和缓存辅助信息样式**

追加或替换以下关键规则，并把同组件的旧冲突规则一并删除：

```css
.sidebar-title { letter-spacing: .7px; }
.category-item { border-radius: 9px; }
.category-item.active { background: var(--accent-soft); color: var(--accent-hover); }
.category-item:hover .category-item-actions,
.category-item:focus-within .category-item-actions { display: flex; }
.cat-action-btn:focus-visible,
.btn-add-cat:focus-visible,
.search-input:focus-visible,
.sort-dropdown-trigger:focus-visible,
.tweet-card-icon-btn:focus-visible,
.btn-header:focus-visible {
  outline: 3px solid rgb(37 99 235 / 24%);
  outline-offset: 2px;
}
.search-input,
.sort-dropdown-trigger { border-radius: 11px; box-shadow: none; }
.empty-state { margin-top: 2px; min-height: 210px; display: grid; place-content: center; border: 1px dashed var(--border-card); border-radius: var(--radius-md); }
.empty-state .empty-icon { width: 42px; height: 42px; display: grid; place-items: center; margin: 0 auto 10px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); opacity: 1; }
.storage-quota-bar { justify-content: flex-end; padding: 10px 2px 0; border-top: 0; }
.storage-quota-text { color: var(--text-muted); }
```

- [ ] **Step 3: 重做同步栏和弹窗样式**

将 `manager/cloud-panel.css` 的顶部规则替换为：

```css
.cloud-panel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border-card);
  border-radius: var(--radius-md);
  background: #fff;
  font-size: 13px;
}
.cloud-identity { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; min-width: 0; }
.cloud-status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent-status); box-shadow: 0 0 0 4px rgb(59 130 246 / 14%); }
#cloud-account { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#cloud-status { color: var(--text-secondary); }
#cloud-status[data-phase="error"] { color: var(--danger); }
.cloud-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.cloud-actions button { padding: 8px 12px; border: 1px solid var(--border-card); border-radius: 10px; background: #fff; color: #334155; cursor: pointer; font: inherit; }
.cloud-actions button:hover { border-color: #BFDBFE; background: var(--accent-soft); color: var(--accent-hover); }
.cloud-actions button:focus-visible,
.cloud-actions a:focus-visible { outline: 3px solid rgb(37 99 235 / 24%); outline-offset: 2px; }
.cloud-actions button:disabled { cursor: wait; opacity: .5; }
.cloud-actions [hidden] { display: none; }
.cloud-actions a { color: #475569; font-size: 12px; text-underline-offset: 3px; }
```

将弹窗样式统一为：

```css
.cloud-dialog {
  width: min(560px, 85vw);
  max-height: 80vh;
  padding: 24px;
  border: 1px solid var(--border-card);
  border-radius: var(--radius-lg);
  color: var(--text-primary);
  box-shadow: 0 24px 60px rgb(15 23 42 / 18%);
}
.cloud-dialog::backdrop { background: rgb(15 23 42 / 35%); }
.cloud-dialog h2 { margin: 0 0 16px; font-size: 19px; }
.cloud-dialog p { font-size: 14px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
.cloud-dialog textarea { width: 100%; min-height: 150px; padding: 10px; margin-bottom: 14px; border: 1px solid var(--border-card); border-radius: var(--radius-sm); font: inherit; }
.cloud-dialog .cloud-actions { margin-top: 18px; justify-content: flex-end; }
```

- [ ] **Step 4: 完成窄屏布局**

在现有 `@media (max-width: 768px)` 内确保：

```css
@media (max-width: 768px) {
  body { overflow: auto; }
  .app { height: auto; min-height: 100vh; padding: 14px; }
  .header { align-items: stretch; }
  .header-actions { flex-wrap: wrap; }
  .cloud-panel { align-items: stretch; }
  .cloud-identity, .cloud-actions { width: 100%; }
  .main { flex-direction: column; }
  .sidebar { width: 100%; max-height: 240px; margin-bottom: 0; }
  .content { min-height: 480px; }
  .toolbar { align-items: stretch; }
}
```

- [ ] **Step 5: 运行合同测试和完整单元测试**

Run: `node --test tests/manager-ui.test.js`

Expected: 5 tests PASS。

Run: `npm test`

Expected: 全部测试 PASS，无失败或跳过。

- [ ] **Step 6: 提交视觉实现**

```bash
git add manager/manager.css manager/cloud-panel.css
git commit -m "优化: 重做管理页蓝色资料库界面"
```

### Task 4: 浏览器回归、文档同步和最终提交

**Files:**
- Modify: `README.md`
- Verify: `manager/manager.html`
- Verify: `manager/manager.js`
- Verify: `manager/cloud-panel.js`

**Interfaces:**
- Consumes: Tasks 1–3 完成后的扩展构建和页面。
- Produces: 可从项目根目录重新加载的最终扩展、更新后的使用文档和验证记录。

- [ ] **Step 1: 构建扩展**

Run: `npm run build`

Expected: 输出“构建完成：dist/extension”，并显示固定扩展 ID、云配置和所有者状态。

- [ ] **Step 2: 运行真实 Chrome 扩展回归测试**

Run: `node --test tests/browser/extension.test.js`

Expected: 保存、编辑、分类重命名、删除和重启场景 PASS。

- [ ] **Step 3: 在 Chrome 重新加载并逐项检查**

打开 `chrome://extensions/?id=gjmbkboihebaoopileepbcklfgkpljap`，点击“重新加载”，然后打开管理页并确认：

1. 标题、同步栏、分类栏、搜索栏和内容卡片符合设计文档。
2. 同步栏右侧四个操作均存在且顺序正确。
3. 新建一个测试分类，完成重命名、拖拽排序和删除。
4. 通过 Tab 键访问分类操作、搜索、排序、同步和顶部按钮，焦点清晰可见。
5. 将窗口缩窄到 768 px 以下，页面无横向溢出且同步按钮可以换行。
6. 页面底部只显示缓存文字，不显示空白进度条。

- [ ] **Step 4: 更新 README 页面说明**

在 README 的“页面使用（重点）”章节中：

- 将页面标题描述更新为“我的帖子札记”。
- 说明蓝色高亮表示当前分类和关键状态。
- 说明缓存大小位于内容区底部，并明确它是本机工作副本，不是 Firebase 云端配额。

- [ ] **Step 5: 运行最终检查**

```bash
npm test
npm run build
git diff --check
git status --short
```

Expected: 测试与构建通过，`git diff --check` 无输出，状态仅包含 README 和验证后必要的预期修改。

- [ ] **Step 6: 提交文档并检查提交历史**

```bash
git add README.md
git commit -m "文档: 更新管理页使用说明"
git log -4 --oneline
git status --short
```

Expected: 最近提交依次覆盖测试、结构、视觉和文档；工作区无未提交文件。
