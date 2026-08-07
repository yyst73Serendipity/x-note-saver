# Twitter 笔记收藏 (x-note-saver)

Chrome 浏览器扩展，在 Twitter/x.com 页面注入收藏按钮，支持将推文分类收藏到本地存储，并提供管理页面浏览、搜索、导出导入收藏数据。

## 技术栈
- Chrome Extension Manifest V3
- 纯 DOM 提取，无 API 调用
- chrome.storage.local 本地存储

## 项目结构
```
x-note-saver/
├── manifest.json              # 扩展配置
├── background/background.js   # Service Worker
├── content/content.js         # 内容脚本（注入逻辑）
├── content/content.css        # 注入 UI 样式
├── manager/manager.html       # 管理页面
├── manager/manager.js         # 管理页面逻辑
├── manager/manager.css        # 管理页面样式
├── assets/                    # 扩展图标
└── uidraft/                   # 设计文档
```
