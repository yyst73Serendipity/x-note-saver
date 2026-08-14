/**
 * content.js - 内容脚本
 * 在 Twitter/x.com 每条推文的操作栏中注入收藏按钮，支持分类收藏
 */

/* 类名前缀，避免与页面样式冲突 */
const PREFIX = 'tns';

/* 全局状态 */
let categories = [];
let savedTweetIds = new Set();

/* 按钮图标 SVG — 星标，模仿 Twitter 原生按钮风格 */
const SAVE_ICON = `
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
</svg>`;

const SAVED_ICON = `
<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
</svg>`;

let activePicker = null;

/**
 * 查找页面中所有未处理的推文 article 元素
 * @returns {Array} 推文元素列表
 */
function findTweetElements() {
  const allArticles = document.querySelectorAll('article[data-testid="tweet"]');
  return Array.from(allArticles).filter(el => !el.hasAttribute(`data-${PREFIX}-processed`));
}

/**
 * 清理翻译插件注入的元素（Google 翻译、沉浸式翻译等）
 * 翻译插件通常在原文旁插入 <font> 标签或带特定属性的元素
 * @param {Element} el - 已克隆的 DOM 节点
 * @returns {Element} 清理后的节点
 */
function cleanTranslationTags(el) {
  // Google 翻译注入的 <font> 标签
  el.querySelectorAll('font').forEach(f => f.remove());
  // 沉浸式翻译 / 双语翻译插件标记
  el.querySelectorAll('[class*="immersive"], [class*="translated"], [class*="trans-"]').forEach(e => e.remove());
  // 带翻译相关属性的元素
  el.querySelectorAll('[data-translation], [data-original]').forEach(e => e.remove());
  return el;
}

/**
 * 递归遍历 DOM 树，将节点转为文本
 * 仅 <br> 产生换行，其余元素行内拼接，不额外分段
 * @param {Node} node
 * @returns {string}
 */
function extractNodeText(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const tag = node.tagName.toLowerCase();

  if (tag === 'br') {
    return '\n';
  }

  // emoji 图片取其 alt 文本
  if (tag === 'img') {
    return node.getAttribute('alt') || '';
  }

  let result = '';
  for (const child of node.childNodes) {
    result += extractNodeText(child);
  }
  return result;
}

/**
 * 从 tweetText DOM 提取文本，保留段落结构
 * 递归遍历整棵树，仅 <br> 产生换行，段落间距由连续 <br> 自然产生
 * @param {Element} el - tweetText 容器元素
 * @returns {string}
 */
function extractTextWithParagraphs(el) {
  let result = extractNodeText(el);
  // 压缩多余空行：3+ 连续换行 → 两个换行（一个段落间距）
  result = result.replace(/\n{3,}/g, '\n\n');
  // 压缩行内多余空白，但不影响换行
  result = result.replace(/[^\S\n]+/g, ' ');
  // 清理换行两侧多余空格
  result = result.replace(/ *\n */g, '\n');
  // 去除首尾空白
  return result.trim();
}

/**
 * 提取推文正文
 * 统一从当前页面 DOM 提取。详情页为完整正文；时间线页长推文可能被折叠截断，
 * 需要完整正文时请先点开详情页再收藏
 * @param {Element} tweetEl
 * @returns {string}
 */
function extractTweetText(tweetEl) {
  const textEl = tweetEl.querySelector('[data-testid="tweetText"]');
  if (!textEl) return '';
  const clone = cleanTranslationTags(textEl.cloneNode(true));
  return extractTextWithParagraphs(clone);
}

/**
 * 提取作者显示名和 @handle
 * @param {Element} tweetEl
 * @returns {{author: string, handle: string}}
 */
function extractAuthorInfo(tweetEl) {
  const userNameEl = tweetEl.querySelector('[data-testid="User-Name"]');
  if (!userNameEl) return { author: '', handle: '' };

  const links = userNameEl.querySelectorAll('a');
  const texts = [];
  links.forEach(a => {
    const text = a.textContent.trim();
    if (text) texts.push(text);
  });

  // 第一个链接通常是显示名，后面的包含 @handle
  const author = texts.length > 0 ? texts[0] : '';
  // 找以 @ 开头的文本作为 handle
  const handleText = texts.find(t => t.startsWith('@')) || '';
  const handle = handleText.replace(/^@/, '');

  return { author, handle };
}

/**
 * 提取推文链接
 * @param {Element} tweetEl
 * @returns {string}
 */
function extractTweetUrl(tweetEl) {
  const links = tweetEl.querySelectorAll('a[href*="/status/"]');
  for (const a of links) {
    const href = a.getAttribute('href');
    if (href && /\/status\/\d+(\/|$|\?)/.test(href)) {
      // 排除图片/视频子页面链接，如 /status/123/photo/1
      if (href.includes('/photo/') || href.includes('/video/')) continue;
      // 取时间戳链接（通常是最具体的推文链接）
      const url = new URL(href, window.location.origin);
      return url.origin + url.pathname;
    }
  }
  return '';
}

/**
 * 从推文 URL 中提取 tweetId（数字 ID）
 * @param {string} url
 * @returns {string}
 */
function extractTweetId(url) {
  const m = url.match(/\/status\/(\d+)/);
  return m ? m[1] : '';
}

/**
 * 提取头像 URL
 * @param {Element} tweetEl
 * @returns {string}
 */
function extractAvatar(tweetEl) {
  const avatarImg = tweetEl.querySelector('img[src*="twimg.com"]');
  if (avatarImg) {
    return avatarImg.src || '';
  }
  // 备用：找第一个 img
  const firstImg = tweetEl.querySelector('img');
  return firstImg ? firstImg.src : '';
}

/**
 * 提取推文发布时间
 * @param {Element} tweetEl
 * @returns {string} ISO 时间字符串
 */
function extractPostTime(tweetEl) {
  const timeEl = tweetEl.querySelector('time');
  if (timeEl) {
    return timeEl.getAttribute('datetime') || '';
  }
  return '';
}

/**
 * 判断推文是否已收藏（按 tweetId）
 * @param {string} tweetId
 * @returns {boolean}
 */
function isTweetSaved(tweetId) {
  return savedTweetIds.has(tweetId);
}

/**
 * 提取推文中的媒体内容（图片和视频封面）
 * @param {Element} tweetEl
 * @returns {{images: string[], videoThumbnail: string}}
 */
function extractMedia(tweetEl) {
  const images = [];
  // 图片：tweetPhoto 容器内的 img
  tweetEl.querySelectorAll('[data-testid="tweetPhoto"] img').forEach(img => {
    const src = img.src || img.getAttribute('src');
    if (src && isTweetPhotoUrl(src)) {
      images.push(getOriginalSizeUrl(src));
    }
  });
  // 视频：videoPlayer 内 video 的 poster
  let videoThumbnail = '';
  const videoEl = tweetEl.querySelector('[data-testid="videoPlayer"] video');
  if (videoEl) {
    videoThumbnail = videoEl.getAttribute('poster') || '';
  }
  return { images, videoThumbnail };
}

/**
 * 检查 URL 是否为推文照片（排除头像等）
 * @param {string} url
 * @returns {boolean}
 */
function isTweetPhotoUrl(url) {
  return url.includes('twimg.com/media') || url.includes('pbs.twimg.com/media');
}

/**
 * 将 twimg 缩略图 URL 转换为较大的尺寸
 * 保留原始 format（png/jpg），name 降级为 large（几乎每张图都有）
 * @param {string} url
 * @returns {string}
 */
function getOriginalSizeUrl(url) {
  return url.replace(/name=[^&]*/, 'name=large');
}

/**
 * 从推文元素中提取完整数据
 * @param {Element} tweetEl
 * @returns {Promise<Object>}
 */
async function extractTweetData(tweetEl) {
  const url = extractTweetUrl(tweetEl);
  const tweetId = extractTweetId(url);
  const text = extractTweetText(tweetEl);
  const { author, handle } = extractAuthorInfo(tweetEl);
  const media = extractMedia(tweetEl);

  return {
    tweetId,
    url,
    text,
    author,
    handle,
    avatar: extractAvatar(tweetEl),
    postTime: extractPostTime(tweetEl),
    images: media.images,
    videoThumbnail: media.videoThumbnail,
    category: '未分类',
    note: ''
  };
}

/**
 * 在推文操作栏中找到「书签」按钮的位置，用于插入收藏按钮
 * 在「点赞」和「书签」之间插入
 * @param {Element} tweetEl
 * @returns {Element|null} 书签按钮元素
 */
function findBookmarkButton(tweetEl) {
  const group = tweetEl.querySelector('[role="group"]');
  if (!group) return null;

  // 操作栏中的按钮：回复、转推、点赞、浏览、书签
  // 找到书签按钮（最后一个带 data-testid 的按钮），在其前面插入
  const buttons = group.querySelectorAll('[data-testid]');
  // 找 bookmark 或 最后一个按钮
  for (const btn of buttons) {
    const testId = btn.getAttribute('data-testid');
    if (testId === 'bookmark' || testId === 'unbookmark') {
      return btn;
    }
  }
  // 备用：取最后一个子元素（通常是书签+浏览量组合区）
  const children = Array.from(group.children);
  return children[children.length - 1] || null;
}

/**
 * 创建收藏按钮 DOM
 * @param {boolean} saved
 * @returns {HTMLElement}
 */
function createSaveButton(saved) {
  const btn = document.createElement('button');
  btn.className = `${PREFIX}-btn`;
  btn.innerHTML = saved ? SAVED_ICON : SAVE_ICON;
  btn.title = saved ? '已收藏' : '收藏推文';
  btn.setAttribute('aria-label', saved ? '已收藏' : '收藏推文');
  if (saved) btn.classList.add(`${PREFIX}-saved`);
  return btn;
}

/**
 * 显示 Toast 提示
 * @param {string} msg
 */
function showToast(msg) {
  const existing = document.querySelector(`.${PREFIX}-toast`);
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `${PREFIX}-toast`;
  toast.textContent = msg;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add(`${PREFIX}-toast-show`);
  });

  setTimeout(() => {
    toast.classList.remove(`${PREFIX}-toast-show`);
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

/**
 * 创建分类选择浮窗
 * @param {Object} tweetData - 推文数据
 * @param {HTMLElement} anchorEl - 定位参考元素
 */
function createCategoryPicker(tweetData, anchorEl) {
  // 移除旧 picker
  if (activePicker) {
    const oldHandler = activePicker._closeHandler;
    if (oldHandler) document.removeEventListener('click', oldHandler);
    activePicker.remove();
    activePicker = null;
  }

  let saving = false;
  const picker = document.createElement('div');
  picker.className = `${PREFIX}-picker`;

  const header = document.createElement('div');
  header.className = `${PREFIX}-picker-header`;
  header.textContent = '选择分类，或点击外部取消';
  picker.appendChild(header);

  const list = document.createElement('div');
  list.className = `${PREFIX}-picker-list`;

  categories.forEach(cat => {
    const item = document.createElement('div');
    item.className = `${PREFIX}-picker-item`;
    item.textContent = cat;
    item.addEventListener('click', async () => {
      if (saving) return;
      saving = true;
      try {
        const data = { ...tweetData, category: cat };
        const response = await chrome.runtime.sendMessage({ action: 'saveTweet', data });
        if (response.success) {
          savedTweetIds.add(tweetData.tweetId);
          if (picker._closeHandler) document.removeEventListener('click', picker._closeHandler);
          picker.remove();
          activePicker = null;
          refreshButtons();
          showToast(`已收入宝藏仓库 → ${cat}`);
        } else {
          if (response.error && response.error.includes('重复')) {
            showToast('这条推文已收藏过了');
          } else {
            showToast('收藏失败: ' + (response.error || '请重试'));
          }
        }
      } catch (err) {
        showToast('收藏失败，请重试');
      }
      saving = false;
    });
    list.appendChild(item);
  });
  picker.appendChild(list);

  // 底部新建分类
  const footer = document.createElement('div');
  footer.className = `${PREFIX}-picker-footer`;

  const input = document.createElement('input');
  input.className = `${PREFIX}-picker-input`;
  input.placeholder = '新建分类...';

  const addBtn = document.createElement('button');
  addBtn.className = `${PREFIX}-picker-add`;
  addBtn.textContent = '新建';

  const doAddCategory = async () => {
    const name = input.value.trim();
    if (!name) return;
    try {
      const response = await chrome.runtime.sendMessage({ action: 'addCategory', name });
      if (response.success) {
        categories = response.data;
        input.value = '';
        picker.remove();
        activePicker = null;
        // 重建选择器，显示更新后的分类列表
        createCategoryPicker(tweetData, anchorEl);
        document.body.appendChild(activePicker);
        positionPicker(anchorEl);
      } else {
        showToast(response.error);
      }
    } catch (err) {
      showToast('新建分类失败');
    }
  };

  addBtn.addEventListener('click', doAddCategory);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doAddCategory();
  });

  footer.appendChild(input);
  footer.appendChild(addBtn);
  picker.appendChild(footer);

  // 点击外部 → 关闭选择器，不收藏
  picker.addEventListener('click', (e) => e.stopPropagation());

  const closeHandler = (e) => {
    if (!picker.contains(e.target)) {
      if (saving) return;
      picker.remove();
      activePicker = null;
      document.removeEventListener('click', closeHandler);
    }
  };
  picker._closeHandler = closeHandler;
  setTimeout(() => document.addEventListener('click', closeHandler), 0);

  activePicker = picker;
  return picker;
}

/**
 * 定位选择器浮窗
 * @param {HTMLElement} anchorEl
 */
function positionPicker(anchorEl) {
  if (!activePicker) return;
  const rect = anchorEl.getBoundingClientRect();
  // 显示在按钮上方
  activePicker.style.top = (rect.top + window.scrollY - 8) + 'px';
  activePicker.style.left = (rect.left + window.scrollX) + 'px';
  // 调整确保不超出视口
  const pickerRect = activePicker.getBoundingClientRect();
  if (pickerRect.bottom > window.innerHeight) {
    activePicker.style.top = (rect.top + window.scrollY - pickerRect.height - 4) + 'px';
  }
  if (pickerRect.right > window.innerWidth) {
    activePicker.style.left = (window.innerWidth - pickerRect.width - 12) + 'px';
  }
}

/**
 * 刷新所有收藏按钮的状态
 */
function refreshButtons() {
  document.querySelectorAll(`.${PREFIX}-btn`).forEach(btn => {
    const tweetEl = btn.closest(`[data-${PREFIX}-processed]`);
    if (!tweetEl) return;
    const url = extractTweetUrl(tweetEl);
    const tweetId = extractTweetId(url);
    const saved = isTweetSaved(tweetId);
    btn.innerHTML = saved ? SAVED_ICON : SAVE_ICON;
    btn.title = saved ? '已收藏' : '收藏推文';
    if (saved) {
      btn.classList.add(`${PREFIX}-saved`);
    } else {
      btn.classList.remove(`${PREFIX}-saved`);
    }
  });
}

/**
 * 在推文中注入收藏按钮
 * @param {Element} tweetEl
 */
async function injectSaveButton(tweetEl) {
  if (tweetEl.querySelector(`.${PREFIX}-btn`)) return;

  const text = extractTweetText(tweetEl);
  if (!text || text.length < 2) return;

  const url = extractTweetUrl(tweetEl);
  const tweetId = extractTweetId(url);
  if (!tweetId) return;

  const bookmarkBtn = findBookmarkButton(tweetEl);
  if (!bookmarkBtn) return;

  const saved = isTweetSaved(tweetId);
  const btn = createSaveButton(saved);

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (isTweetSaved(tweetId)) {
      showToast('这条推文已收藏过了');
      return;
    }

    const tweetData = await extractTweetData(tweetEl);
    const picker = createCategoryPicker(tweetData, btn);
    document.body.appendChild(picker);
    positionPicker(btn);
  });

  // 插入到书签按钮之前
  bookmarkBtn.parentNode.insertBefore(btn, bookmarkBtn);

  tweetEl.setAttribute(`data-${PREFIX}-processed`, 'true');
}

/**
 * 判断当前页面是否应该注入
 * 排除设置页、帮助页等非推文页面
 */
function isTweetPage() {
  const path = window.location.pathname;
  // 排除明显不是推文页面的路径
  const excludePaths = ['/settings/', '/i/flow/', '/i/twitter_blue_sign_up', '/i/lists/'];
  for (const p of excludePaths) {
    if (path.startsWith(p)) return false;
  }
  return true;
}

/**
 * 扫描并注入按钮
 */
let scanTimer = null;

function scanAndInject() {
  if (!isTweetPage()) return;
  if (scanTimer) clearTimeout(scanTimer);
  // 浏览器空闲时注入按钮，不抢占页面渲染；降级回 setTimeout
  scanTimer = (window.requestIdleCallback || ((cb) => setTimeout(cb, 300)))(() => {
    const tweetEls = findTweetElements();
    tweetEls.forEach(el => injectSaveButton(el));
  });
}

/**
 * 加载已收藏推文的 tweetId 集合
 */
async function loadSavedTweetIds() {
  try {
    const resp = await chrome.runtime.sendMessage({ action: 'getTweets' });
    if (resp.success) {
      savedTweetIds.clear();
      resp.data.forEach(t => {
        if (t.tweetId) savedTweetIds.add(t.tweetId);
      });
    }
  } catch (err) {
    console.warn('[推文收藏] 加载数据失败:', err.message);
  }
}

/**
 * 加载分类列表
 */
async function loadCategories() {
  try {
    const resp = await chrome.runtime.sendMessage({ action: 'getCategories' });
    if (resp.success) categories = resp.data;
  } catch (err) {
    categories = ['未分类'];
  }
}

/* SPA 导航状态 */
let lastUrl = window.location.href;

/**
 * URL 变化检测
 */
async function checkUrlChange() {
  const currentUrl = window.location.href;
  if (currentUrl === lastUrl) return;
  lastUrl = currentUrl;

  // URL 变了，重新加载数据（可能有新的导入）
  await loadSavedTweetIds();
  await loadCategories();
  scanAndInject();
}

/**
 * 初始化
 */
async function init() {
  await loadCategories();
  await loadSavedTweetIds();

  console.log('[推文收藏] 已加载，分类:', categories.length, '个，已收藏:', savedTweetIds.size, '条');

  scanAndInject();

  // DOM 变化监测：仅扫描注入按钮，URL 变化交给路由事件和轮询检测
  const observer = new MutationObserver(() => {
    scanAndInject();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // SPA 路由变化监测
  window.addEventListener('popstate', () => setTimeout(checkUrlChange, 300));
  window.addEventListener('hashchange', () => setTimeout(checkUrlChange, 300));
  setInterval(checkUrlChange, 1000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
