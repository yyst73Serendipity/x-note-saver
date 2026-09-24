# Google 账号云同步实施计划

目标：保留未打包扩展的安装方式，在同一 Firebase 项目中实现 Google 登录、账号隔离、离线队列、增量同步与旧数据迁移。

用户已于对话中确认方案 A；不再重复请求方案批准。真实项目配置及登录需要用户参与，不启用付费计划。

## 约束
- 原生 JavaScript；Firebase SDK 本地打包，esbuild 构建；Node 内置测试。
- Spark 套餐；只存文字和媒体 URL；固定扩展公钥，不上传私钥。
- Google 登录使用受控 Hosting iframe 与 offscreen 文档；校验来源、请求 ID，认证凭据不写入 chrome.storage。
- 所有数据变更串行通过后台写入；同一个 storage.set 持久化状态和供界面读取的投影。
- 每个账号有独立云快照、待发送队列、同步游标；guest 数据需预览并确认迁移。
- 一条帖子一个文档；分类使用稳定 ID；删除保留墓碑；事务检查字段原值并保留笔记冲突。
- 每次操作有 UUID，云端事务同时写入回执，重试不得重复执行。
- Service Worker 可以随时终止；队列、游标和账号状态必须可恢复。
- 网络操作不能阻塞本地写入；确认回执时仅移除该操作，重放其后的操作。

## 文件与执行顺序
1. tests/sync-model.test.js 先覆盖去重、字段合并、笔记冲突、墓碑、迁移、重试后重放；运行失败后实现 storage/model.js。
2. storage/local-store.js 实现浏览器原子持久化、串行更新、账号隔离和旧数据转换。background/background.js 改为统一消息路由，管理页删除所有直接写 storage 的 fallback。
3. config/firebase-config.js、auth/firebase-client.js、auth/auth-service.js、offscreen/*、auth-page/* 实现配置检查和 MV3 Google 登录；未配置时仍可本地使用。
4. sync/cloud-store.js 与 sync/sync-engine.js 实现 Firestore 事务、回执、分页增量拉取、重试、状态与 alarms。测试连接官方 Emulator，不 mock 外部服务。
5. manager/cloud-panel.js 与 cloud-panel.css 增加账号、同步状态、迁移预览和冲突处理；content/content.js 刷新远端收藏状态。
6. firestore.rules 使用用户 UID 与配置的所有者 UID 双重限制；字段边界检查；测试跨账号拒绝、未登录拒绝、本人读写和事务重放。
7. scripts/build.js 构建到 dist/extension 和 dist/hosting；提供固定公钥与扩展 ID。配置文件不含服务器私钥；本机 Firebase 配置忽略提交。
8. README 和 docs/firebase-setup.md 更新使用、免费额度、配置、迁移与恢复步骤。运行单元、模拟器、构建和浏览器验收；请求独立代码审查，修复重要问题后中文 git commit。

## 核心接口
- migrateLegacy(tweets, categories): Workspace
- visibleRecords(workspace): {tweets, categories, settings}
- enqueueOperation(workspace, collection, recordId, patch, options): Workspace
- mergeOperation(remoteRecord, operation): Record
- acknowledge(workspace, operationId, remoteRecord): Workspace
- LocalStore.update(fn): Promise；串行读、改、原子写并广播。
- CloudStore.commit(uid, operation): Promise<Record>；事务内读取回执和当前记录并保存结果。
- CloudStore.pull(uid, collection, cursor): AsyncGenerator<Page>；updatedAt + 文档 ID 排序，边界时间包含重读。
- SyncEngine.sync(): Promise；同一账号单次运行，账号切换不把结果应用到新账号。

## 验收
- 新设备空库只下载，不覆盖云端。
- 同一帖子两设备收藏去重；不同字段合并；笔记冲突保留两个版本。
- 删除墓碑阻止离线旧编辑复活；显式重新收藏允许恢复。
- 同一操作重复投递不重复应用；回执后仍保留后续本地操作。
- 登录 A、退出、登录 B，队列和显示数据不串号。
- 迁移中断可恢复，保留原始备份；导入、分类排序、清空都进入统一队列。
- 未配置、网络中断、授权失效、配额错误都显示中文状态，本地数据仍可使用。
- OAuth 与跨设备真机测试必须使用真实 Firebase 项目；未验证不得宣称完成。
