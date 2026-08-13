/**
 * manager.js - 管理页面逻辑
 * 管理收藏推文：按分类查看、搜索、添加笔记、导入导出
 */

/* 状态 */
let tweets = [];
let categories = [];
let currentCategory = '全部';
let searchKeyword = '';
let editingCategory = null;
let pendingDeleteTweetId = null;

/* 稍后阅读视图状态：true 表示当前显示「稍后阅读」入口 */
let showReadLater = false;

/* DOM 元素引用 */
const categoryList = document.getElementById('category-list');
const tweetList = document.getElementById('tweet-list');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const currentCatTitle = document.getElementById('current-category-title');
const currentCatCount = document.getElementById('current-category-count');
const newCatInput = document.getElementById('new-cat-input');
const inputCatName = document.getElementById('input-cat-name');
const btnAddCat = document.getElementById('btn-add-cat');
const btnConfirmCat = document.getElementById('btn-confirm-cat');
const btnCancelCat = document.getElementById('btn-cancel-cat');
const btnExport = document.getElementById('btn-export');
const btnImport = document.getElementById('btn-import');
const btnClear = document.getElementById('btn-clear');
const importFile = document.getElementById('import-file');

/* 弹窗 DOM 引用 */
const deleteCatModal = document.getElementById('delete-cat-modal');
const deleteCatModalBody = document.getElementById('delete-cat-modal-body');
const btnCatModalCancel = document.getElementById('btn-cat-modal-cancel');
const btnCatModalConfirm = document.getElementById('btn-cat-modal-confirm');
const deleteTweetModal = document.getElementById('delete-tweet-modal');
const btnTweetModalCancel = document.getElementById('btn-tweet-modal-cancel');
const btnTweetModalConfirm = document.getElementById('btn-tweet-modal-confirm');
const clearModal = document.getElementById('clear-modal');
const btnClearModalCancel = document.getElementById('btn-clear-modal-cancel');
const btnClearModalConfirm = document.getElementById('btn-clear-modal-confirm');
const resultModal = document.getElementById('result-modal');
const resultModalTitle = document.getElementById('result-modal-title');
const resultModalBody = document.getElementById('result-modal-body');
const btnResultModalOk = document.getElementById('btn-result-modal-ok');

/* 导入预览弹窗 DOM 引用 */
const importPreviewModal = document.getElementById('import-preview-modal');
const importPreviewBody = document.getElementById('import-preview-body');
const btnPreviewCancel = document.getElementById('btn-preview-cancel');
const btnPreviewConfirm = document.getElementById('btn-preview-confirm');

/* 存储配额条 DOM 引用 */
const storageQuotaBar = document.getElementById('storage-quota-bar');
const storageQuotaFill = document.getElementById('storage-quota-fill');
const storageQuotaText = document.getElementById('storage-quota-text');

/* storage.local 配额（字节），Chrome 默认 10MB */
const STORAGE_QUOTA_BYTES = 10 * 1024 * 1024;

/**
 * HTML 转义
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

/**
 * 格式化时间戳为可读字符串
 * @param {number} timestamp
 * @returns {string}
 */
function formatTime(timestamp) {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}/${m}/${day} ${h}:${min}`;
}

/**
 * 格式化 ISO 时间字符串为可读形式
 * @param {string} isoStr
 * @returns {string}
 */
function formatPostTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}/${m}/${day} ${h}:${min}`;
}

/**
 * 搜索高亮
 * @param {string} text
 * @param {string} keyword
 * @returns {string} 含 <span class="highlight"> 的 HTML
 */
function highlightText(text, keyword) {
  let html = escapeHtml(text);
  // URL → 可点击链接
  html = html.replace(/(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener">$1</a>');
  // @mention → 可点击链接，跳转 Twitter 主页
  html = html.replace(/@([A-Za-z0-9_]+)/g,
    '<a href="https://x.com/$1" target="_blank" rel="noopener">@$1</a>');
  if (!keyword) return html;
  const escapedKw = escapeHtml(keyword);
  const regex = new RegExp(escapedKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return html.replace(regex, match => `<span class="highlight">${match}</span>`);
}

/**
 * 初始化：从 storage 加载数据
 */
async function init() {
  try {
    const [catResp, tweetResp] = await Promise.all([
      chrome.runtime.sendMessage({ action: 'getCategories' }),
      chrome.runtime.sendMessage({ action: 'getTweets' })
    ]);
    if (catResp.success) categories = catResp.data;
    if (tweetResp.success) tweets = tweetResp.data;
  } catch (err) {
    const result = await chrome.storage.local.get(['twitter_categories', 'twitter_notes']);
    categories = result.twitter_categories || ['未分类'];
    tweets = result.twitter_notes || [];
  }

  renderAll();
}

/**
 * 更新存储配额条
 * 显示 storage.local 已用空间占比，≥80% 警告，≥95% 严重
 */
async function updateStorageQuota() {
  try {
    const bytesInUse = await chrome.storage.local.getBytesInUse(null);
    const quotaMb = STORAGE_QUOTA_BYTES / (1024 * 1024);
    const percent = (bytesInUse / STORAGE_QUOTA_BYTES) * 100;

    // 用量小于 1MB 时用 KB 显示，避免小数据量被四舍五入成 0.0 MB
    let usedText;
    if (bytesInUse < 1024 * 1024) {
      usedText = (bytesInUse / 1024).toFixed(1) + ' KB';
    } else {
      usedText = (bytesInUse / (1024 * 1024)).toFixed(1) + ' MB';
    }

    // 进度条至少占 1% 宽度，让非空存储有视觉反馈
    const fillPercent = bytesInUse > 0 ? Math.max(percent, 1) : 0;
    storageQuotaFill.style.width = Math.min(fillPercent, 100) + '%';
    storageQuotaText.textContent =
      `本地存储 ${usedText} / ${quotaMb} MB (${percent.toFixed(0)}%)`;

    storageQuotaBar.classList.remove('warning', 'critical');
    if (percent >= 95) {
      storageQuotaBar.classList.add('critical');
      storageQuotaText.textContent += ' — 空间即将耗尽，请尽快导出清理';
    } else if (percent >= 80) {
      storageQuotaBar.classList.add('warning');
      storageQuotaText.textContent += ' — 空间即将用尽，建议导出后清理';
    }
  } catch (err) {
    // getBytesInUse 失败时静默处理，不影响主流程
  }
}

/* ========== 渲染 ========== */

/**
 * 渲染整个页面
 */
function renderAll() {
  renderCategories();
  renderTweets();
  updateCategoryTitle();
  updateEmptyState();
  updateStorageQuota();
}

/**
 * 渲染分类列表
 */
function renderCategories() {
  categoryList.innerHTML = '';

  // 「全部」项
  const allItem = createCategoryItem('全部', tweets.length, false);
  if (currentCategory === '全部' && !showReadLater) allItem.classList.add('active');
  allItem.addEventListener('click', () => selectCategory('全部'));
  categoryList.appendChild(allItem);

  // 「稍后阅读」虚拟项（独立于分类体系）
  const readLaterCount = tweets.filter(t => t.readLater).length;
  const readLaterItem = createReadLaterItem(readLaterCount);
  if (showReadLater) readLaterItem.classList.add('active');
  readLaterItem.addEventListener('click', () => {
    if (editingCategory) return;
    selectReadLater();
  });
  categoryList.appendChild(readLaterItem);

  // 各分类项
  categories.forEach(cat => {
    const count = tweets.filter(t => t.category === cat).length;
    const editable = cat !== '未分类';
    const item = createCategoryItem(cat, count, editable);
    if (currentCategory === cat && !showReadLater) item.classList.add('active');
    item.addEventListener('click', () => {
      if (editingCategory) return;
      selectCategory(cat);
    });
    categoryList.appendChild(item);
  });
}

/**
 * 创建「稍后阅读」入口项 DOM
 * @param {number} count - 标记数
 * @returns {HTMLElement}
 */
function createReadLaterItem(count) {
  const li = document.createElement('li');
  li.className = 'category-item read-later';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'category-item-name';
  const icon = document.createElement('span');
  icon.className = 'read-later-icon';
  icon.textContent = '🔖';
  const text = document.createElement('span');
  text.textContent = '稍后阅读';
  nameSpan.appendChild(icon);
  nameSpan.appendChild(text);

  const countSpan = document.createElement('span');
  countSpan.className = 'category-item-count';
  countSpan.textContent = count;

  li.appendChild(nameSpan);
  li.appendChild(countSpan);
  return li;
}

/**
 * 创建分类项 DOM
 * @param {string} name
 * @param {number} count
 * @param {boolean} showActions
 * @returns {HTMLElement}
 */
function createCategoryItem(name, count, showActions) {
  const li = document.createElement('li');
  li.className = 'category-item';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'category-item-name';
  nameSpan.textContent = name;

  const countSpan = document.createElement('span');
  countSpan.className = 'category-item-count';
  countSpan.textContent = count;

  li.appendChild(nameSpan);
  li.appendChild(countSpan);

  if (showActions) {
    const actions = document.createElement('span');
    actions.className = 'category-item-actions';

    const renameBtn = document.createElement('button');
    renameBtn.className = 'cat-action-btn';
    renameBtn.textContent = '✎';
    renameBtn.title = '重命名';
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startRenameCategory(name, li);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'cat-action-btn';
    deleteBtn.textContent = '✕';
    deleteBtn.title = '删除';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showDeleteCategoryModal(name);
    });

    actions.appendChild(renameBtn);
    actions.appendChild(deleteBtn);
    li.appendChild(actions);
  }

  // 内联编辑区域
  const editWrap = document.createElement('div');
  editWrap.className = 'category-item-edit';
  const editInput = document.createElement('input');
  editInput.type = 'text';
  editInput.maxLength = 20;
  const editActions = document.createElement('div');
  editActions.className = 'edit-actions';
  const btnConfirm = document.createElement('button');
  btnConfirm.className = 'btn-confirm';
  btnConfirm.textContent = '确定';
  const btnCancel = document.createElement('button');
  btnCancel.className = 'btn-cancel';
  btnCancel.textContent = '取消';
  editActions.appendChild(btnConfirm);
  editActions.appendChild(btnCancel);
  editWrap.appendChild(editInput);
  editWrap.appendChild(editActions);

  btnConfirm.addEventListener('click', (e) => {
    e.stopPropagation();
    confirmRenameCategory(name, editInput.value.trim(), li);
  });
  btnCancel.addEventListener('click', (e) => {
    e.stopPropagation();
    cancelEditCategory(li);
  });
  editInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      confirmRenameCategory(name, editInput.value.trim(), li);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      cancelEditCategory(li);
    }
  });
  editInput.addEventListener('blur', () => {
    setTimeout(() => {
      if (li.classList.contains('editing') &&
          document.activeElement !== btnConfirm &&
          document.activeElement !== btnCancel) {
        cancelEditCategory(li);
      }
    }, 150);
  });

  li.appendChild(editWrap);
  return li;
}

/**
 * 切换选中分类
 * @param {string} name
 */
function selectCategory(name) {
  currentCategory = name;
  showReadLater = false;
  searchInput.value = '';
  searchKeyword = '';
  renderAll();
}

/**
 * 切换到「稍后阅读」视图
 */
function selectReadLater() {
  currentCategory = '全部';
  showReadLater = true;
  searchInput.value = '';
  searchKeyword = '';
  renderAll();
}

/**
 * 渲染推文卡片列表
 */
function renderTweets() {
  tweetList.innerHTML = '';

  // 按分类过滤
  let filtered = tweets;
  if (currentCategory !== '全部') {
    filtered = filtered.filter(t => t.category === currentCategory);
  }

  // 按稍后阅读标记过滤
  if (showReadLater) {
    filtered = filtered.filter(t => t.readLater);
  }

  // 按搜索关键词过滤
  if (searchKeyword) {
    const kw = searchKeyword.toLowerCase();
    filtered = filtered.filter(t =>
      t.text.toLowerCase().includes(kw) ||
      t.author.toLowerCase().includes(kw) ||
      (t.handle && t.handle.toLowerCase().includes(kw)) ||
      (t.note && t.note.toLowerCase().includes(kw))
    );
  }

  // 排序
  const sortOrder = sortSelect.value;
  filtered.sort((a, b) => {
    if (sortOrder === 'oldest') return a.savedAt - b.savedAt;
    return b.savedAt - a.savedAt; // newest first
  });

  filtered.forEach(tweet => {
    tweetList.appendChild(createTweetCard(tweet));
  });
}

/**
 * 更新分类标题和计数
 */
function updateCategoryTitle() {
  let filtered = tweets;
  if (currentCategory !== '全部') {
    filtered = filtered.filter(t => t.category === currentCategory);
  }
  if (showReadLater) {
    filtered = filtered.filter(t => t.readLater);
  }
  if (searchKeyword) {
    const kw = searchKeyword.toLowerCase();
    filtered = filtered.filter(t =>
      t.text.toLowerCase().includes(kw) ||
      t.author.toLowerCase().includes(kw)
    );
  }
  currentCatTitle.textContent = showReadLater ? '稍后阅读' : currentCategory;
  currentCatCount.textContent = filtered.length + ' 条';
}

/**
 * 更新空状态显示
 */
function updateEmptyState() {
  const hasTweets = tweetList.children.length > 0;
  emptyState.classList.toggle('hidden', hasTweets);
}

/** 关闭所有打开的分类下拉面板 */
function closeAllDropdowns() {
  document.querySelectorAll('.cat-dropdown-panel.open').forEach(p => p.classList.remove('open'));
  document.querySelectorAll('.cat-dropdown-trigger.open').forEach(t => t.classList.remove('open'));
}

/**
 * 修改推文分类，同步更新 storage 和本地状态
 * @param {string} id - 推文 ID
 * @param {string} newCategory - 新分类名
 */
async function changeTweetCategory(id, newCategory) {
  try {
    const resp = await chrome.runtime.sendMessage({ action: 'updateCategory', id, category: newCategory });
    if (resp.success) {
      const tweet = tweets.find(t => t.id === id);
      if (tweet) tweet.category = newCategory;
      renderCategories();
    }
  } catch (err) {
    const tweet = tweets.find(t => t.id === id);
    if (tweet) tweet.category = newCategory;
    await chrome.storage.local.set({ twitter_notes: tweets });
    renderCategories();
  }
}

/**
 * 切换推文的「稍后阅读」标记
 * @param {string} id - 推文 ID
 * @param {HTMLElement} btn - 标记按钮（用于更新视觉态）
 */
async function toggleReadLater(id, btn) {
  const tweet = tweets.find(t => t.id === id);
  if (!tweet) return;
  const newState = !tweet.readLater;

  try {
    const resp = await chrome.runtime.sendMessage({ action: 'updateReadLater', id, readLater: newState });
    if (resp.success) {
      tweet.readLater = newState;
    }
  } catch (err) {
    tweet.readLater = newState;
    await chrome.storage.local.set({ twitter_notes: tweets });
  }

  // 更新按钮视觉态
  if (newState) {
    btn.classList.add('active');
  } else {
    btn.classList.remove('active');
  }

  // 若在「稍后阅读」视图中取消标记，移除后刷新列表；否则仅刷新侧栏计数
  if (showReadLater && !newState) {
    renderAll();
  } else {
    renderCategories();
  }
}

/**
 * 创建分类下拉组件
 * @param {Object} tweet - 推文数据
 * @returns {HTMLElement}
 */
function createCatDropdown(tweet) {
  const wrap = document.createElement('span');
  wrap.className = 'cat-dropdown-wrap';

  const trigger = document.createElement('button');
  trigger.className = 'cat-dropdown-trigger';
  trigger.type = 'button';
  trigger.innerHTML = `${escapeHtml(tweet.category)} <span class="cat-dropdown-arrow"></span>`;

  const panel = document.createElement('div');
  panel.className = 'cat-dropdown-panel';

  categories.forEach(cat => {
    const opt = document.createElement('button');
    opt.className = 'cat-dropdown-option';
    opt.type = 'button';
    if (cat === tweet.category) opt.classList.add('selected');
    opt.textContent = cat;
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      changeTweetCategory(tweet.id, cat);
      trigger.innerHTML = `${escapeHtml(cat)} <span class="cat-dropdown-arrow"></span>`;
      panel.querySelectorAll('.cat-dropdown-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      panel.classList.remove('open');
      trigger.classList.remove('open');
    });
    panel.appendChild(opt);
  });

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = panel.classList.contains('open');
    closeAllDropdowns();
    if (!wasOpen) {
      // 判断空间：若底部不足则向上弹出
      const rect = trigger.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const panelHeight = 250;
      if (spaceBelow < panelHeight && rect.top > panelHeight) {
        panel.classList.add('upward');
      } else {
        panel.classList.remove('upward');
      }
      panel.classList.add('open');
      trigger.classList.add('open');
    }
  });

  wrap.appendChild(trigger);
  wrap.appendChild(panel);
  return wrap;
}

/**
 * 创建推文卡片
 * @param {Object} tweet
 * @returns {HTMLElement}
 */
function createTweetCard(tweet) {
  const card = document.createElement('div');
  card.className = 'tweet-card';

  // 头部：头像 + 作者 + handle
  const header = document.createElement('div');
  header.className = 'tweet-card-header';

  if (tweet.avatar) {
    const avatar = document.createElement('img');
    avatar.className = 'tweet-card-avatar';
    avatar.src = tweet.avatar;
    avatar.loading = 'lazy';
    avatar.onerror = () => { avatar.style.display = 'none'; };
    header.appendChild(avatar);
  }

  const authorSpan = document.createElement('span');
  authorSpan.className = 'tweet-card-author';
  authorSpan.innerHTML = highlightText(tweet.author, searchKeyword);
  header.appendChild(authorSpan);

  if (tweet.handle) {
    const separator = document.createElement('span');
    separator.className = 'tweet-card-separator';
    separator.textContent = ' · ';
    header.appendChild(separator);

    const handleSpan = document.createElement('span');
    handleSpan.className = 'tweet-card-handle';
    handleSpan.textContent = '@' + tweet.handle;
    header.appendChild(handleSpan);
  }

  // 推文发布时间
  const postTime = formatPostTime(tweet.postTime);
  if (postTime) {
    const sep = document.createElement('span');
    sep.className = 'tweet-card-separator';
    sep.textContent = ' · ';
    header.appendChild(sep);

    const timeSpan = document.createElement('span');
    timeSpan.className = 'tweet-card-post-time';
    timeSpan.textContent = postTime;
    header.appendChild(timeSpan);
  }

  card.appendChild(header);

  // 信息栏：时间 + 分类下拉 | 操作按钮
  const footer = document.createElement('div');
  footer.className = 'tweet-card-footer';

  const footerLeft = document.createElement('div');
  footerLeft.className = 'tweet-card-footer-left';

  const time = document.createElement('span');
  time.className = 'tweet-card-time';
  time.textContent = formatTime(tweet.savedAt);
  footerLeft.appendChild(time);

  footerLeft.appendChild(createCatDropdown(tweet));
  footer.appendChild(footerLeft);

  const actions = document.createElement('div');
  actions.className = 'tweet-card-actions';

  // 查看原帖
  if (tweet.url) {
    const viewBtn = document.createElement('button');
    viewBtn.className = 'tweet-card-action btn-view';
    viewBtn.textContent = '查看原帖';
    viewBtn.addEventListener('click', () => {
      window.open(tweet.url, '_blank');
    });
    actions.appendChild(viewBtn);
  }

  // 复制正文
  const copyBtn = document.createElement('button');
  copyBtn.className = 'tweet-card-action';
  copyBtn.textContent = '复制';
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(tweet.text).then(() => {
      copyBtn.textContent = '已复制';
      setTimeout(() => { copyBtn.textContent = '复制'; }, 1500);
    });
  });
  actions.appendChild(copyBtn);

  // 稍后阅读标记
  const readLaterBtn = document.createElement('button');
  readLaterBtn.className = 'tweet-card-action btn-read-later';
  readLaterBtn.textContent = '稍后阅读';
  if (tweet.readLater) readLaterBtn.classList.add('active');
  readLaterBtn.addEventListener('click', () => toggleReadLater(tweet.id, readLaterBtn));
  actions.appendChild(readLaterBtn);

  // 删除
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'tweet-card-action btn-delete';
  deleteBtn.textContent = '删除';
  deleteBtn.addEventListener('click', () => showDeleteTweetModal(tweet.id));
  actions.appendChild(deleteBtn);

  footer.appendChild(actions);
  card.appendChild(footer);

  // 推文正文
  const textEl = document.createElement('div');
  textEl.className = 'tweet-card-text';
  textEl.innerHTML = highlightText(tweet.text, searchKeyword);
  card.appendChild(textEl);

  // 媒体区域（图片缩略图 / 视频封面）
  const hasImages = tweet.images && tweet.images.length > 0;
  const hasVideo = !!(tweet.videoThumbnail);
  if (hasImages || hasVideo) {
    const mediaEl = document.createElement('div');
    mediaEl.className = 'tweet-card-media';
    // 总媒体数 ≥ 2 时使用 2 列网格
    const totalCount = (hasImages ? tweet.images.length : 0) + (hasVideo ? 1 : 0);
    if (totalCount >= 2) {
      mediaEl.classList.add('grid');
    } else {
      mediaEl.classList.add('single');
    }

    // 图片缩略图
    if (hasImages) {
      tweet.images.forEach(imgUrl => {
        const link = document.createElement('a');
        link.className = 'tweet-card-img-wrap';
        link.href = tweet.url;
        link.target = '_blank';
        const img = document.createElement('img');
        img.src = imgUrl;
        img.loading = 'lazy';
        // 历史坏数据（name=orig / format=jpg）加载失败时降级为 large
        img.addEventListener('error', () => {
          if (img.dataset.fallbackTried) return;
          const fallback = imgUrl.replace(/name=[^&]*/, 'name=large');
          if (fallback === imgUrl) return;
          img.dataset.fallbackTried = 'true';
          img.src = fallback;
        });
        link.appendChild(img);
        mediaEl.appendChild(link);
      });
    }

    // 视频封面
    if (hasVideo) {
      const link = document.createElement('a');
      link.className = 'tweet-card-video-wrap';
      link.href = tweet.url;
      link.target = '_blank';
      link.title = '点击去原帖观看视频';
      const img = document.createElement('img');
      img.src = tweet.videoThumbnail;
      img.loading = 'lazy';
      link.appendChild(img);
      mediaEl.appendChild(link);
    }

    card.appendChild(mediaEl);
  }

  // 笔记区域（hover 时显示，有笔记时始终可见）
  const noteContainer = document.createElement('div');
  noteContainer.className = 'tweet-card-note-container';

  // 查看态
  const noteView = document.createElement('div');
  noteView.className = 'tweet-card-note-view';
  noteView.textContent = tweet.note || '';
  noteView.addEventListener('click', () => {
    noteView.style.display = 'none';
    noteEdit.style.display = 'block';
    requestAnimationFrame(() => {
      noteEdit.style.height = 'auto';
      noteEdit.style.height = noteEdit.scrollHeight + 'px';
    });
    noteEdit.focus();
  });

  // 编辑态
  const noteEdit = document.createElement('textarea');
  noteEdit.className = 'tweet-card-note-edit';
  noteEdit.placeholder = '添加笔记...';
  noteEdit.value = tweet.note || '';
  noteEdit.rows = 1;
  noteEdit.addEventListener('input', () => {
    noteEdit.style.height = 'auto';
    noteEdit.style.height = noteEdit.scrollHeight + 'px';
  });
  noteEdit.addEventListener('blur', async () => {
    noteEdit.style.height = 'auto';
    noteEdit.style.height = noteEdit.scrollHeight + 'px';
    const newNote = noteEdit.value.trim();
    if (newNote === (tweet.note || '')) {
      // 切回查看态
      noteEdit.style.display = 'none';
      if (newNote) {
        noteView.style.display = 'block';
      }
      return;
    }
    tweet.note = newNote;
    noteView.textContent = newNote;
    try {
      await chrome.runtime.sendMessage({ action: 'updateNote', id: tweet.id, note: newNote });
    } catch (err) {
      const result = await chrome.storage.local.get('twitter_notes');
      const list = result.twitter_notes || [];
      const target = list.find(t => t.id === tweet.id);
      if (target) target.note = newNote;
      await chrome.storage.local.set({ twitter_notes: list });
    }
    noteEdit.style.display = 'none';
    noteView.style.display = newNote ? 'block' : 'none';
    if (newNote) {
      noteContainer.classList.add('has-note');
    } else {
      noteContainer.classList.remove('has-note');
    }
  });

  // 初始状态：有笔记显示查看态并常驻，无笔记 hover 才显示
  if (tweet.note) {
    noteContainer.classList.add('has-note');
    noteView.style.display = 'block';
    noteEdit.style.display = 'none';
  } else {
    noteContainer.classList.remove('has-note');
    noteView.style.display = 'none';
    noteEdit.style.display = 'block';
  }

  noteContainer.appendChild(noteView);
  noteContainer.appendChild(noteEdit);
  card.appendChild(noteContainer);

  return card;
}

/* ========== 分类管理 ========== */

/**
 * 开始内联编辑分类名
 * @param {string} name
 * @param {HTMLElement} li
 */
function startRenameCategory(name, li) {
  if (editingCategory) return;
  editingCategory = name;
  li.classList.add('editing');
  const input = li.querySelector('.category-item-edit input');
  input.value = name;
  setTimeout(() => input.focus(), 50);
}

/**
 * 确认重命名
 * @param {string} oldName
 * @param {string} newName
 * @param {HTMLElement} li
 */
async function confirmRenameCategory(oldName, newName, li) {
  if (!newName || newName === oldName) {
    cancelEditCategory(li);
    return;
  }
  try {
    const resp = await chrome.runtime.sendMessage({ action: 'renameCategory', oldName, newName });
    if (resp.success) {
      categories = resp.data;
      // 更新本地 tweets 数据中的分类名
      tweets.forEach(t => {
        if (t.category === oldName) t.category = newName;
      });
      if (currentCategory === oldName) currentCategory = newName;
      editingCategory = null;
      renderAll();
    } else {
      alert(resp.error);
    }
  } catch (err) {
    alert('重命名失败');
  }
}

/**
 * 取消编辑
 * @param {HTMLElement} li
 */
function cancelEditCategory(li) {
  li.classList.remove('editing');
  editingCategory = null;
}

/**
 * 显示删除分类确认弹窗
 * @param {string} name
 */
function showDeleteCategoryModal(name) {
  const categories_ = categories.filter(c => c !== name);
  const fallback = categories_[0] || '未分类';
  deleteCatModalBody.querySelector('.highlight-name').textContent = name;
  deleteCatModalBody.querySelector('.highlight-fallback').textContent = fallback;
  deleteCatModal._deleteName = name;
  deleteCatModal.classList.remove('hidden');
}

/**
 * 确认删除分类
 */
async function confirmDeleteCategory() {
  const name = deleteCatModal._deleteName;
  try {
    const resp = await chrome.runtime.sendMessage({ action: 'deleteCategory', name });
    if (resp.success) {
      categories = resp.data;
      tweets = tweets.map(t => {
        if (t.category === name) return { ...t, category: categories[0] || '未分类' };
        return t;
      });
      if (currentCategory === name) currentCategory = '全部';
      deleteCatModal.classList.add('hidden');
      renderAll();
    } else {
      alert(resp.error);
    }
  } catch (err) {
    alert('删除失败');
  }
}

/* ========== 推文操作 ========== */

/**
 * 显示删除推文确认弹窗
 * @param {string} id
 */
function showDeleteTweetModal(id) {
  pendingDeleteTweetId = id;
  deleteTweetModal.classList.remove('hidden');
}

/**
 * 确认删除推文
 */
async function confirmDeleteTweet() {
  const id = pendingDeleteTweetId;
  if (!id) return;
  try {
    const resp = await chrome.runtime.sendMessage({ action: 'deleteTweet', id });
    if (resp.success) {
      tweets = tweets.filter(t => t.id !== id);
      pendingDeleteTweetId = null;
      deleteTweetModal.classList.add('hidden');
      renderAll();
    }
  } catch (err) {
    alert('删除失败');
  }
}

/* ========== 导入导出 ========== */

/**
 * 导出数据为 JSON 文件
 */
async function exportData() {
  try {
    const data = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      categories: categories,
      tweets: tweets
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'twitter-notes-backup-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.json';
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('导出失败');
  }
}

/**
 * 触发导入文件选择
 */
function importData() {
  importFile.click();
}

/**
 * 处理导入文件
 * 第一阶段：解析文件，计算新增/跳过，弹预览让用户确认
 * @param {File} file
 */
async function handleImportFile(file) {
  let data;
  try {
    const text = await file.text();
    data = JSON.parse(text);
  } catch (err) {
    showResult('导入失败', '文件解析错误，请确认选择的是 JSON 格式的备份文件。');
    return;
  }

  if (!data.tweets || !Array.isArray(data.tweets)) {
    showResult('导入失败', '文件格式不正确，缺少推文数据。');
    return;
  }

  // 统计：新增分类数、新增推文数、跳过重复数
  const newCats = (data.categories || []).filter(cat => !categories.includes(cat));
  const existingIds = new Set(tweets.map(t => t.tweetId));
  const newTweets = data.tweets.filter(t => !existingIds.has(t.tweetId));

  const html =
    `文件共 <span class="num">${data.tweets.length}</span> 条推文，确认后将合并到当前收藏。<br>` +
    `🗂️ 将新增分类 <span class="num num-add">${newCats.length}</span> 个，<br>` +
    `📝 将新增推文 <span class="num num-add">${newTweets.length}</span> 条，<br>` +
    `⏭️ 将跳过重复 <span class="num num-skip">${data.tweets.length - newTweets.length}</span> 条。`;

  importPreviewBody.innerHTML = html;

  // 暂存待导入数据，供确认阶段使用
  importPreviewModal._pendingData = data;
  importPreviewModal._pendingNewTweets = newTweets;

  importPreviewModal.classList.remove('hidden');
}

/**
 * 确认导入：执行合并写入
 */
async function confirmImport() {
  const data = importPreviewModal._pendingData;
  if (!data) return;
  importPreviewModal.classList.add('hidden');

  // 合并分类
  if (data.categories && Array.isArray(data.categories)) {
    for (const cat of data.categories) {
      if (!categories.includes(cat)) {
        const resp = await chrome.runtime.sendMessage({ action: 'addCategory', name: cat });
        if (resp.success) categories = resp.data;
      }
    }
  }

  // 合并推文（按 tweetId 去重）
  const existingIds = new Set(tweets.map(t => t.tweetId));
  const newTweets = [];
  for (const tweet of data.tweets) {
    if (!existingIds.has(tweet.tweetId)) {
      if (!categories.includes(tweet.category)) {
        tweet.category = '未分类';
      }
      const resp = await chrome.runtime.sendMessage({ action: 'saveTweet', data: tweet });
      if (resp.success && resp.data) {
        newTweets.push(resp.data);
        existingIds.add(tweet.tweetId);
      }
    }
  }

  // 重新加载
  const tweetResp = await chrome.runtime.sendMessage({ action: 'getTweets' });
  if (tweetResp.success) tweets = tweetResp.data;

  renderAll();
  showResult('导入完成', `成功导入 ${newTweets.length} 条推文，跳过 ${data.tweets.length - newTweets.length} 条重复。`);

  importPreviewModal._pendingData = null;
  importPreviewModal._pendingNewTweets = null;
}

/**
 * 显示结果弹窗
 * @param {string} title
 * @param {string} body
 */
function showResult(title, body) {
  resultModalTitle.textContent = title;
  resultModalBody.textContent = body;
  resultModal.classList.remove('hidden');
}

/* ========== 清空数据 ========== */

/**
 * 显示清空确认弹窗
 */
function showClearModal() {
  clearModal.classList.remove('hidden');
}

/**
 * 确认清空所有数据
 */
async function confirmClear() {
  try {
    await chrome.storage.local.set({
      twitter_notes: [],
      twitter_categories: ['未分类']
    });
    tweets = [];
    categories = ['未分类'];
    currentCategory = '全部';
    searchKeyword = '';
    searchInput.value = '';
    clearModal.classList.add('hidden');
    renderAll();
  } catch (err) {
    alert('清空失败');
  }
}

/* ========== 事件绑定 ========== */

btnAddCat.addEventListener('click', () => {
  newCatInput.classList.toggle('hidden');
  if (!newCatInput.classList.contains('hidden')) {
    inputCatName.focus();
  }
});

btnConfirmCat.addEventListener('click', async () => {
  const name = inputCatName.value.trim();
  if (!name) return;
  try {
    const resp = await chrome.runtime.sendMessage({ action: 'addCategory', name });
    if (resp.success) {
      categories = resp.data;
      inputCatName.value = '';
      newCatInput.classList.add('hidden');
      renderAll();
    } else {
      alert(resp.error);
    }
  } catch (err) {
    alert('新建分类失败');
  }
});

btnCancelCat.addEventListener('click', () => {
  inputCatName.value = '';
  newCatInput.classList.add('hidden');
});

inputCatName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnConfirmCat.click();
  if (e.key === 'Escape') btnCancelCat.click();
});

searchInput.addEventListener('input', () => {
  searchKeyword = searchInput.value.trim();
  renderTweets();
  updateCategoryTitle();
  updateEmptyState();
});

sortSelect.addEventListener('change', () => {
  renderTweets();
});

btnExport.addEventListener('click', exportData);
btnImport.addEventListener('click', importData);

importFile.addEventListener('change', () => {
  const file = importFile.files[0];
  if (file) {
    handleImportFile(file);
    importFile.value = '';
  }
});

btnClear.addEventListener('click', showClearModal);

/* 弹窗事件 */
btnCatModalCancel.addEventListener('click', () => deleteCatModal.classList.add('hidden'));
btnCatModalConfirm.addEventListener('click', confirmDeleteCategory);

btnTweetModalCancel.addEventListener('click', () => {
  deleteTweetModal.classList.add('hidden');
  pendingDeleteTweetId = null;
});
btnTweetModalConfirm.addEventListener('click', confirmDeleteTweet);

btnClearModalCancel.addEventListener('click', () => clearModal.classList.add('hidden'));
btnClearModalConfirm.addEventListener('click', confirmClear);

btnResultModalOk.addEventListener('click', () => resultModal.classList.add('hidden'));

/* 导入预览弹窗事件 */
btnPreviewCancel.addEventListener('click', () => {
  importPreviewModal.classList.add('hidden');
  importPreviewModal._pendingData = null;
  importPreviewModal._pendingNewTweets = null;
});
btnPreviewConfirm.addEventListener('click', confirmImport);

/* 点击弹窗遮罩关闭 */
[deleteCatModal, deleteTweetModal, clearModal, resultModal, importPreviewModal].forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      if (modal === importPreviewModal) {
        importPreviewModal._pendingData = null;
        importPreviewModal._pendingNewTweets = null;
      }
      modal.classList.add('hidden');
    }
  });
});

/* 点击其他地方关闭分类下拉 */
document.addEventListener('click', closeAllDropdowns);

// 启动
init();
