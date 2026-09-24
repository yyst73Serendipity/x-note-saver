# ✨ Twitter 笔记收藏 (x-note-saver)

Chrome Manifest V3 扩展，用于收藏 X 帖子、整理笔记与分类，并可通过 Google 登录在多台设备间同步。

## ✨ 功能介绍

- 在 X 帖子操作栏一键收藏，按 `tweetId` 去重
- 自定义分类、分类排序、稍后阅读、全文搜索
- 为收藏添加笔记和标签，保留并发笔记冲突供手动合并
- 保存帖子正文、作者、媒体链接和视频封面
- 未登录时仅保存在本机；登录后通过 Firestore 增量同步
- 离线修改进入持久队列，联网后自动重试
- 账号数据隔离、删除墓碑、跨设备冲突处理
- JSON 导入导出和登录后的本地数据迁移预览

## 📁 项目目录结构

```text
x-note-saver/
├── auth/                 # Firebase 客户端和 Google 登录控制
├── auth-page/            # 部署到 Hosting 的登录辅助页面
├── background/           # Service Worker 与统一消息入口
├── config/               # Firebase 客户端配置示例
├── content/              # X 页面按钮、数据提取和样式
├── docs/                 # 配置说明与实施计划
├── manager/              # 收藏管理页、同步状态和冲突界面
├── offscreen/            # MV3 登录桥
├── scripts/              # 构建脚本
├── storage/              # 本地账号空间、迁移和数据模型
├── sync/                 # Firestore 事务与同步引擎
├── tests/                # 单元、浏览器和模拟器集成测试
├── firebase.json         # Hosting、Firestore 与模拟器配置
├── firestore.rules       # 个人账号安全规则模板
├── manifest.json         # Chrome 扩展配置
└── package.json          # 构建、测试和部署命令
```

## 🛠 技术栈

- 原生 JavaScript、Chrome Extension Manifest V3
- Firebase Authentication、Cloud Firestore、Firebase Hosting
- Firebase Web SDK 12、esbuild、Node.js 内置测试工具

## 🚀 安装和使用

1. 安装依赖：`npm install`
2. 按 [Firebase 配置说明](docs/firebase-setup.md) 创建 `config/firebase.local.json`
3. 构建：`npm run build`
4. 打开 `chrome://extensions/`，开启开发者模式
5. 点击“加载已解压的扩展程序”，选择 `dist/extension`
6. 打开管理页，登录同一个 Google 账号并确认迁移本地收藏

只使用本地收藏时，可以在没有 Firebase 配置的情况下构建和加载，界面会明确显示“未配置云服务”。

## 🧪 测试

```bash
npm test
npm run build
npm run test:integration
```

Firestore 集成测试使用官方 Emulator 和真实安全规则，不连接生产数据库。

## 📦 数据备份

管理页支持导出 JSON。导入时会预览新增、重复和笔记冲突；登录后的首次迁移必须先下载一份迁移前备份。云同步不能替代独立备份。
