<!--
  收藏管理页全屏化实施计划：按已确认设计重组顶部并保留当前帖子区域。
-->

# 收藏管理页全屏化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让收藏管理页占满浏览器窗口并使用两行紧凑顶部导航，同时完整保留现有分类栏、帖子导航刻度和帖子卡片布局。

**Architecture:** 只重组 `manager.html` 的顶部容器，并通过现有元素 ID 继续连接 `manager.js` 与 `cloud-panel.js`；全屏化主要由 `manager.css` 和 `cloud-panel.css` 完成。帖子列表 DOM、卡片生成顺序、快速导航模块和数据逻辑保持不变，新增结构测试锁定这些边界。

**Tech Stack:** 原生 HTML/CSS/JavaScript、Chrome Extension Manifest V3、Node.js `node:test`、esbuild

## Global Constraints

- 页面占满浏览器可用宽度和高度，不再使用 1180 px 最大宽度。
- 顶部第一行约 60 px、深墨色；第二行约 42 px、白色。
- 第二行操作顺序为：导入、导出备份、清空全部数据、迁移本机数据、清除本机缓存、配置帮助。
- 左侧分类栏固定 210 px。
- 帖子导航继续使用 22 px 宽轨道和帖子列表 30 px 左内边距。
- 帖子卡片内部顺序、样式、操作和数据行为不得改变。
- 不新增第三方依赖。

---

## 文件结构

- `manager/manager.html`：将标题、账号同步状态和工具按钮重组为两行顶部导航；保留主工作区、弹窗和脚本入口。
- `manager/manager.css`：取消页面最大宽度与外层留白，设置全屏主工作区和顶部导航基础样式；保留分类、快速导航和帖子卡片现有规则。
- `manager/cloud-panel.css`：让现有云账号与操作元素适配深色第一行和白色第二行。
- `manager/manager.js`：只增加顶部总收藏数的 DOM 引用与刷新，不改变过滤、排序或卡片生成逻辑。
- `tests/manager-ui.test.js`：验证顶部结构、按钮顺序、全屏 CSS 和帖子区域保持条件。
- `README.md`：更新页面结构、顶部工具和全屏布局说明。

### Task 1: 重组顶部导航并锁定帖子结构

**Files:**
- Modify: `tests/manager-ui.test.js`
- Modify: `manager/manager.html`
- Modify: `manager/manager.js`

**Interfaces:**
- Consumes: `cloud-panel.js` 依赖的 `cloud-login`、`cloud-sync`、`cloud-migrate`、`cloud-conflicts`、`cloud-cache`、`cloud-logout` ID。
- Produces: `#header-total-count` 文本节点；`.app-header-primary` 与 `.app-header-tools` 两行导航容器。

- [ ] **Step 1: 写入顶部结构与帖子顺序回归测试**

在 `tests/manager-ui.test.js` 增加：

```js
test('manager uses the confirmed two-row navigation', () => {
  assert.match(html, /class="app-header-primary"/);
  assert.match(html, /class="app-header-tools"/);
  assert.match(html, /id="header-total-count"/);
  assert.match(html, /class="btn-header[^\"]*cloud-help"[^>]*>配置帮助<\/a>/);

  const primaryStart = html.indexOf('app-header-primary');
  const toolsStart = html.indexOf('app-header-tools');
  assert.ok(primaryStart < toolsStart);
  assert.ok(html.indexOf('cloud-sync') < html.indexOf('cloud-logout'));
  assert.ok(html.indexOf('btn-import') < html.indexOf('btn-export'));
  assert.ok(html.indexOf('btn-export') < html.indexOf('btn-clear'));
  assert.ok(html.indexOf('btn-clear') < html.indexOf('cloud-migrate'));
  assert.ok(html.indexOf('cloud-cache') < html.indexOf('cloud-help'));
});

test('fullscreen work keeps the existing tweet card composition', () => {
  const headerIndex = managerJs.indexOf("header.className = 'tweet-card-header'");
  const footerIndex = managerJs.indexOf("footer.className = 'tweet-card-footer'");
  const noteIndex = managerJs.indexOf('const noteMeta = createNoteMeta(tweet)');
  const textIndex = managerJs.indexOf("textEl.className = 'tweet-card-text'");
  const mediaIndex = managerJs.indexOf("mediaEl.className = 'tweet-card-media'");
  assert.ok(headerIndex < footerIndex);
  assert.ok(footerIndex < noteIndex);
  assert.ok(noteIndex < textIndex);
  assert.ok(textIndex < mediaIndex);
});
```

同时把原有配置帮助断言从链接文字改为 `cloud-help` ID，避免样式由普通文本链接退化：

```js
assert.match(html, /id="cloud-help"/);
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```bash
node --test tests/manager-ui.test.js
```

Expected: FAIL，提示缺少 `.app-header-primary`、`.app-header-tools` 或 `#header-total-count`。

- [ ] **Step 3: 重组 `manager.html` 顶部，但保留所有既有 ID**

用以下结构替换当前 `.header` 与 `.cloud-panel`；`cloud-dialog` 和 `.main` 保持在顶部导航之后：

```html
<header class="app-header">
  <div class="app-header-primary">
    <div class="header-brand">
      <span class="header-mark" aria-hidden="true">X</span>
      <h1 class="header-title">我的帖子札记</h1>
      <span class="header-count" id="header-total-count">0 条收藏</span>
    </div>

    <section class="cloud-panel" aria-label="账号与云同步">
      <div class="cloud-identity">
        <span class="cloud-status-dot" aria-hidden="true"></span>
        <span class="cloud-avatar" aria-hidden="true">云</span>
        <span class="cloud-copy">
          <strong id="cloud-account">本地收藏</strong>
          <span id="cloud-status" role="status" aria-live="polite">正在读取同步状态…</span>
        </span>
      </div>
      <div class="cloud-actions cloud-actions-primary">
        <button id="cloud-login" type="button">使用 Google 登录</button>
        <button id="cloud-sync" type="button" hidden>立即同步</button>
        <button id="cloud-logout" type="button" hidden>退出登录</button>
      </div>
    </section>
  </div>

  <div class="app-header-tools" aria-label="数据工具">
    <button class="btn-header" id="btn-import" type="button">导入</button>
    <button class="btn-header" id="btn-export" type="button">导出备份</button>
    <button class="btn-header btn-header-danger" id="btn-clear" type="button">清空全部数据</button>
    <button class="btn-header" id="cloud-migrate" type="button" hidden>迁移本机数据</button>
    <button class="btn-header" id="cloud-conflicts" type="button" hidden>处理笔记冲突</button>
    <button class="btn-header" id="cloud-cache" type="button" hidden>清除本机缓存</button>
    <a class="btn-header cloud-help" id="cloud-help" href="setup.html" target="_blank" rel="noopener">配置帮助</a>
  </div>
</header>
```

移除旧 `.header-left`、`.header-actions` 和原来单独占行的 `.cloud-panel` 容器，不复制任何 ID。保留 `cloud-login`，以便未登录或未配置时仍能在第一行完成登录。

- [ ] **Step 4: 让顶部总收藏数随数据刷新**

在 `manager/manager.js` 的 DOM 引用区增加：

```js
const headerTotalCount = document.getElementById('header-total-count');
```

在 `updateCategoryTitle()` 入口处增加：

```js
headerTotalCount.textContent = `${tweets.length} 条收藏`;
```

不要修改 `renderTweets()`、`createTweetCard()`、`createNoteMeta()` 或快速导航模块。

- [ ] **Step 5: 运行顶部结构测试**

Run:

```bash
node --test tests/manager-ui.test.js
```

Expected: PASS；既有分类、缓存和快速导航断言也全部通过。

- [ ] **Step 6: 提交顶部结构变更**

```bash
git add manager/manager.html manager/manager.js tests/manager-ui.test.js
git commit -m "优化: 重组管理页顶部导航"
```

### Task 2: 实现全屏布局并保持现有帖子区域

**Files:**
- Modify: `tests/manager-ui.test.js`
- Modify: `manager/manager.css`
- Modify: `manager/cloud-panel.css`

**Interfaces:**
- Consumes: Task 1 产生的 `.app-header-primary`、`.app-header-tools`、`.header-brand`、`.cloud-actions-primary`。
- Produces: 无新增 JavaScript 接口；只提供全屏和响应式 CSS。

- [ ] **Step 1: 写入全屏布局和保持条件测试**

在 `tests/manager-ui.test.js` 增加：

```js
test('manager fills the viewport without changing navigator spacing', () => {
  assert.match(managerCss, /\.app\s*\{[\s\S]*?width:\s*100%/);
  assert.match(managerCss, /\.app\s*\{[\s\S]*?max-width:\s*none/);
  assert.match(managerCss, /\.app\s*\{[\s\S]*?height:\s*100vh/);
  assert.match(managerCss, /\.app\s*\{[\s\S]*?padding:\s*0/);
  assert.match(managerCss, /\.sidebar\s*\{[\s\S]*?width:\s*210px/);
  assert.match(managerCss, /\.post-navigator\s*\{[\s\S]*?width:\s*22px/);
  assert.match(managerCss, /\.post-navigator\s*\{[\s\S]*?left:\s*2px/);
  assert.match(managerCss, /\.tweet-list-stage\.has-post-navigator \.tweet-list\s*\{[\s\S]*?padding-left:\s*30px/);
  assert.match(managerCss, /\.tweet-card\s*\{[\s\S]*?padding:\s*16px 18px/);
});

test('narrow windows scroll the secondary tools without reshaping tweet cards', () => {
  assert.match(managerCss, /@media\s*\(max-width:\s*768px\)[\s\S]*?\.app-header-tools\s*\{[\s\S]*?overflow-x:\s*auto/);
  assert.doesNotMatch(managerCss, /\.tweet-list\s*\{[^}]*grid-template-columns/);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```bash
node --test tests/manager-ui.test.js
```

Expected: FAIL，当前 `.app` 仍包含 `max-width: 1180px` 和 `padding: 28px 28px 0`。

- [ ] **Step 3: 将页面外框改成全屏**

在 `manager/manager.css` 中用以下规则替换 `.app`、旧顶部标题区和 `.main` 的布局规则：

```css
.app {
  width: 100%;
  max-width: none;
  height: 100vh;
  padding: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.app-header {
  min-width: 0;
  flex-shrink: 0;
}

.app-header-primary {
  min-height: 60px;
  padding: 0 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  background: #09111F;
  color: #FFFFFF;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.header-mark {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: #FFFFFF;
  color: #09111F;
  font-weight: 800;
}

.header-title {
  color: #FFFFFF;
  font-family: "Songti SC", "STSong", "Noto Serif CJK SC", serif;
  font-size: 21px;
  white-space: nowrap;
}

.header-count {
  padding: 3px 9px;
  border: 1px solid #344054;
  border-radius: var(--radius-full);
  color: #98A2B3;
  font-size: 11px;
  white-space: nowrap;
}

.app-header-tools {
  min-height: 42px;
  padding: 5px 22px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  border-bottom: 1px solid var(--border-card);
  background: #FFFFFF;
}

.main {
  min-height: 0;
  padding: 16px;
  display: flex;
  align-items: stretch;
  gap: 16px;
}

.sidebar {
  width: 210px;
  margin-bottom: 0;
}

.content {
  margin-bottom: 0;
}
```

删除旧 `.header`、`.header-left`、`.header-eyebrow`、`.header-subtitle` 和旧 `.header-actions` 的失效样式。不要修改 `.tweet-list-stage`、`.tweet-list-stage.has-post-navigator .tweet-list`、`.post-navigator`、`.tweet-card` 及其子元素规则。

- [ ] **Step 4: 适配云账号区域和两组按钮**

在 `manager/cloud-panel.css` 中将顶部账号区域改为透明容器：

```css
.cloud-panel {
  min-width: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  border: 0;
  background: transparent;
  color: #FFFFFF;
  font-size: 12px;
}

.cloud-identity {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.cloud-avatar {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #172A46;
  color: #53B9FF;
}

.cloud-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

#cloud-account {
  color: #FFFFFF;
  font-size: 12px;
}

#cloud-status {
  color: #98A2B3;
  font-size: 10px;
}

.cloud-actions-primary {
  flex-wrap: nowrap;
}

.cloud-actions-primary button {
  min-height: 31px;
  border-color: #344054;
  background: transparent;
  color: #D0D5DD;
}

#cloud-sync {
  border-color: var(--accent-status);
  background: var(--accent-status);
  color: #FFFFFF;
}

.cloud-help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
}
```

第二行的 `btn-header` 继续由 `manager.css` 控制；隐藏状态继续依赖原有 `[hidden]`，不能用 CSS 强制显示云操作。

- [ ] **Step 5: 增加窄窗口规则**

在现有 `@media (max-width: 768px)` 中加入：

```css
.app-header-primary {
  padding-inline: 14px;
}

.header-count,
.cloud-copy {
  display: none;
}

.app-header-tools {
  justify-content: flex-start;
  overflow-x: auto;
  scrollbar-width: thin;
}

.app-header-tools > * {
  flex: 0 0 auto;
}
```

保留现有窄屏分类栏、内容区和 `.post-navigator` 规则，不添加双列帖子布局。

- [ ] **Step 6: 运行针对性测试**

Run:

```bash
node --test tests/manager-ui.test.js tests/scroll-navigator.test.js
```

Expected: 两个测试文件全部 PASS。

- [ ] **Step 7: 构建扩展并检查产物**

Run:

```bash
npm run build
```

Expected: 命令退出码为 0，`dist/extension/manager/manager.html`、`manager.css`、`cloud-panel.css` 均生成。

- [ ] **Step 8: 提交全屏样式变更**

```bash
git add manager/manager.css manager/cloud-panel.css tests/manager-ui.test.js
git commit -m "优化: 管理页使用全屏布局"
```

### Task 3: 更新文档并完成全量验证

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1 和 Task 2 完成的最终页面结构与行为。
- Produces: 面向使用者的最新页面说明。

- [ ] **Step 1: 更新 README 页面说明**

在 `README.md` 的“页面使用（重点）”中，将管理页区域说明调整为：

```markdown
管理页使用全屏双栏布局：顶部第一行集中展示收藏数量、Google 账号和同步状态，第二行提供导入、导出、清空、迁移、缓存和配置帮助。左侧分类栏、帖子快速导航和帖子卡片保持连续阅读布局，窗口变大时会获得更多显示空间。
```

保留现有分类管理、帖子快速导航、本地缓存和同步说明，不删除用户操作步骤。

- [ ] **Step 2: 运行全量单元测试**

Run:

```bash
npm test
```

Expected: `tests/*.test.js` 全部 PASS。

- [ ] **Step 3: 再次构建发布目录**

Run:

```bash
npm run build
```

Expected: 命令退出码为 0，构建日志无错误。

- [ ] **Step 4: 在 Chrome 中完成视觉与交互检查**

加载 `dist/extension` 后检查：

1. 1440 px 及更宽窗口中，页面铺满窗口且没有 1180 px 居中限制。
2. 第一行显示标题、总收藏数、账号、同步状态、立即同步和退出登录。
3. 第二行按钮顺序正确，配置帮助是按钮并能打开 `setup.html`。
4. 左侧分类的新建、重命名、删除和拖动排序均正常。
5. 搜索、排序、编辑笔记、分类下拉、查看原帖、复制、稍后阅读和删除均正常。
6. 导航刻度仍贴近帖子列表，点击和键盘定位正常。
7. 帖子卡片内部顺序、字号、留白和媒体布局与改版前一致。
8. 将窗口缩窄到 768 px 以下，第二行工具可横向滚动，页面没有横向溢出。

- [ ] **Step 5: 提交 README 更新**

```bash
git add README.md
git commit -m "文档: 更新管理页全屏布局说明"
```

- [ ] **Step 6: 最终检查工作区**

Run:

```bash
git status --short
git log -4 --oneline
```

Expected: `git status --short` 无输出；最近提交包含顶部导航、全屏布局、README 和本实施计划。
