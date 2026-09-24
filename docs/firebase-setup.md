# Firebase 个人云同步配置

本项目使用 Firebase 项目 `x-note-saver`，保持 Spark 免费套餐。客户端配置、扩展公钥和项目 ID都不是密码；服务账号私钥、Firebase CLI 登录令牌和 Google 密码绝不能写入仓库。

## 控制台配置

1. 打开 Firebase 控制台，进入 `x-note-saver`。
2. 在“项目设置 → 常规 → 您的应用”添加 Web 应用 `x-note-saver-extension`，勾选 Firebase Hosting，保存生成的 `apiKey`、`authDomain`、`projectId`、`appId`。
3. 在 Authentication 的“登录方法”启用 Google，选择项目支持邮箱。
4. 在 Firestore Database 创建 Standard 数据库，先选择生产模式。
5. 复制 `config/firebase.example.json` 为 `config/firebase.local.json` 并填写上述公开配置；`authPageUrl` 保持 `https://x-note-saver.web.app/`。
6. 运行 `npm run build`，读取 `dist/extension-id.txt`，把 `chrome-extension://<扩展ID>` 加入 Authentication 的授权域名。
7. Firebase CLI 登录后运行 `npm run deploy`，部署登录辅助页面和默认拒绝全部访问的规则。
8. 加载 `dist/extension`，在管理页登录 Google。复制界面显示的 UID 到 `ownerUid`，再次运行 `npm run deploy`。

## 数据安全

- Firestore 路径按 Firebase UID 隔离，并额外限制为 `ownerUid`。
- 扩展离线写入先进入本地队列；云端确认后才显示“已同步”。
- 同一帖子以 `tweetId` 去重；删除使用墓碑，旧设备不能自动复活记录。
- 同一笔记的并发修改最多保留 6 份待处理版本；单篇笔记限制为 96 KB，防止超过 Firestore 单文档 1 MiB 上限。
- 旧版数据迁移前必须下载 JSON 备份。升级成功后，旧版键会在 v2 状态成功落盘后移除，避免重复占用本地空间。

## 验证命令

```bash
npm test
npm run build
npm run test:integration
```

集成测试需要 Java 21 以及 Firebase Emulator。真实 Google 登录只能在已配置并部署的 Firebase 项目和未打包扩展中验证。
