/**
 * background.js - Service Worker
 * 处理扩展的后台逻辑：初始化存储、管理推文和分类的增删查改、处理消息通信
 */

/* 默认分类列表 */
const DEFAULT_CATEGORIES = ['未分类'];

/* 存储键名 */
const STORAGE_KEY_TWEETS = 'twitter_notes';
const STORAGE_KEY_CATEGORIES = 'twitter_categories';

/**
 * 扩展安装或更新时，初始化默认分类
 */
chrome.runtime.onInstalled.addListener(async () => {
  const result = await chrome.storage.local.get(STORAGE_KEY_CATEGORIES);
  if (!result[STORAGE_KEY_CATEGORIES]) {
    await chrome.storage.local.set({ [STORAGE_KEY_CATEGORIES]: DEFAULT_CATEGORIES });
  }
  const tweets = await chrome.storage.local.get(STORAGE_KEY_TWEETS);
  if (!tweets[STORAGE_KEY_TWEETS]) {
    await chrome.storage.local.set({ [STORAGE_KEY_TWEETS]: [] });
  }
});

/**
 * 点击扩展图标时打开管理页面
 */
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('manager/manager.html') });
});

/**
 * 生成唯一 ID
 * @returns {string} 时间戳+随机数的字符串
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

/**
 * 获取所有推文
 * @returns {Promise<Array>} 推文列表
 */
async function getTweets() {
  const result = await chrome.storage.local.get(STORAGE_KEY_TWEETS);
  return result[STORAGE_KEY_TWEETS] || [];
}

/**
 * 保存推文（按 tweetId 去重）
 * @param {Object} tweet - 推文数据（不含 id 和 savedAt）
 * @returns {Promise<Object>} 保存后的完整推文，重复时返回已有记录
 */
async function saveTweet(tweet) {
  const tweets = await getTweets();
  const existing = tweets.find(t => t.tweetId === tweet.tweetId);
  if (existing) return existing;
  const newTweet = {
    ...tweet,
    id: generateId(),
    savedAt: tweet.savedAt || Date.now()
  };
  tweets.unshift(newTweet);
  await chrome.storage.local.set({ [STORAGE_KEY_TWEETS]: tweets });
  return newTweet;
}

/**
 * 删除推文
 * @param {string} id - 推文 ID
 * @returns {Promise<Array>} 删除后的推文列表
 */
async function deleteTweet(id) {
  const tweets = await getTweets();
  const filtered = tweets.filter(t => t.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEY_TWEETS]: filtered });
  return filtered;
}

/**
 * 获取所有分类
 * @returns {Promise<Array>} 分类列表
 */
async function getCategories() {
  const result = await chrome.storage.local.get(STORAGE_KEY_CATEGORIES);
  return result[STORAGE_KEY_CATEGORIES] || DEFAULT_CATEGORIES;
}

/**
 * 添加分类
 * @param {string} name - 分类名
 * @returns {Promise<Array>} 更新后的分类列表
 */
async function addCategory(name) {
  const categories = await getCategories();
  if (categories.includes(name)) {
    throw new Error('分类已存在');
  }
  categories.push(name);
  await chrome.storage.local.set({ [STORAGE_KEY_CATEGORIES]: categories });
  return categories;
}

/**
 * 删除分类，该分类下推文移至第一个剩余分类
 * @param {string} name - 分类名
 * @returns {Promise<Array>} 更新后的分类列表
 */
async function deleteCategory(name) {
  if (name === '未分类') throw new Error('「未分类」不可删除');
  const categories = await getCategories();
  const filtered = categories.filter(c => c !== name);
  await chrome.storage.local.set({ [STORAGE_KEY_CATEGORIES]: filtered });
  const tweets = await getTweets();
  const fallback = filtered[0] || '未分类';
  const updated = tweets.map(t => t.category === name ? { ...t, category: fallback } : t);
  await chrome.storage.local.set({ [STORAGE_KEY_TWEETS]: updated });
  return filtered;
}

/**
 * 重命名分类
 * @param {string} oldName - 旧分类名
 * @param {string} newName - 新分类名
 * @returns {Promise<Array>} 更新后的分类列表
 */
async function renameCategory(oldName, newName) {
  if (oldName === '未分类') throw new Error('「未分类」不可重命名');
  const categories = await getCategories();
  if (categories.includes(newName)) {
    throw new Error('目标分类名已存在');
  }
  const idx = categories.indexOf(oldName);
  if (idx === -1) {
    throw new Error('分类不存在');
  }
  categories[idx] = newName;
  await chrome.storage.local.set({ [STORAGE_KEY_CATEGORIES]: categories });
  const tweets = await getTweets();
  const updated = tweets.map(t => t.category === oldName ? { ...t, category: newName } : t);
  await chrome.storage.local.set({ [STORAGE_KEY_TWEETS]: updated });
  return categories;
}

/**
 * 更新推文的笔记和标签
 * @param {string} id - 推文 ID
 * @param {string} note - 笔记内容
 * @param {Array} tags - 标签数组
 * @returns {Promise<Object>} 更新后的推文
 */
async function updateNoteTags(id, note, tags) {
  const tweets = await getTweets();
  const tweet = tweets.find(t => t.id === id);
  if (!tweet) throw new Error('推文不存在');
  tweet.note = note || '';
  tweet.tags = tags || [];
  await chrome.storage.local.set({ [STORAGE_KEY_TWEETS]: tweets });
  return tweet;
}

/**
 * 更新推文的分类
 * @param {string} id - 推文 ID
 * @param {string} category - 新分类名
 * @returns {Promise<Object>} 更新后的推文
 */
async function updateCategory(id, category) {
  const tweets = await getTweets();
  const tweet = tweets.find(t => t.id === id);
  if (!tweet) throw new Error('推文不存在');
  tweet.category = category;
  await chrome.storage.local.set({ [STORAGE_KEY_TWEETS]: tweets });
  return tweet;
}

/**
 * 更新推文的「稍后阅读」标记
 * @param {string} id - 推文 ID
 * @param {boolean} readLater - 是否标记稍后阅读
 * @returns {Promise<Object>} 更新后的推文
 */
async function updateReadLater(id, readLater) {
  const tweets = await getTweets();
  const tweet = tweets.find(t => t.id === id);
  if (!tweet) throw new Error('推文不存在');
  tweet.readLater = readLater;
  await chrome.storage.local.set({ [STORAGE_KEY_TWEETS]: tweets });
  return tweet;
}

/**
 * 重排可排序分类的顺序（「未分类」固定首位）
 * @param {Array} newOrder - 不含「未分类」的分类新顺序
 * @returns {Promise<Array>} 更新后的完整分类列表
 */
async function reorderCategories(newOrder) {
  const FIXED = '未分类';
  const categories = await getCategories();
  const sortable = categories.filter(c => c !== FIXED);
  // 校验新顺序与当前可排序分类集合一致，防止数据错乱
  const currentSet = new Set(sortable);
  if (!Array.isArray(newOrder) || newOrder.length !== currentSet.size) {
    throw new Error('分类数据不一致');
  }
  if (new Set(newOrder).size !== newOrder.length || !newOrder.every(c => currentSet.has(c))) {
    throw new Error('分类数据不一致');
  }
  const next = [FIXED, ...newOrder];
  await chrome.storage.local.set({ [STORAGE_KEY_CATEGORIES]: next });
  return next;
}

/* 消息处理：根据 action 类型分发到对应的处理函数 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    saveTweet:       () => saveTweet(message.data),
    deleteTweet:     () => deleteTweet(message.id),
    getTweets:       () => getTweets(),
    getCategories:   () => getCategories(),
    addCategory:     () => addCategory(message.name),
    deleteCategory:  () => deleteCategory(message.name),
    renameCategory:  () => renameCategory(message.oldName, message.newName),
    reorderCategories: () => reorderCategories(message.newOrder),
    updateCategory:  () => updateCategory(message.id, message.category),
    updateNoteTags:  () => updateNoteTags(message.id, message.note, message.tags),
    updateReadLater: () => updateReadLater(message.id, message.readLater)
  };

  const handler = handlers[message.action];
  if (!handler) {
    sendResponse({ success: false, error: '未知操作' });
    return false;
  }

  handler()
    .then(data => sendResponse({ success: true, data }))
    .catch(err => sendResponse({ success: false, error: err.message }));

  return true;
});
