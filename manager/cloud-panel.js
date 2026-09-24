/**
 * 管理页的 Google 登录、同步状态、迁移备份与笔记冲突处理交互。
 */
(() => {
  const get = id => document.getElementById(id);
  const dialog = get('cloud-dialog');
  let latestStatus, busy = false, confirmAction;
  const buttons = ['login', 'sync', 'migrate', 'conflicts', 'cache', 'logout'];
  const send = async (action, args = {}) => {
    const response = await chrome.runtime.sendMessage({ action, ...args });
    if (!response?.success) throw new Error(response?.error || '后台暂时不可用，请重新加载扩展');
    return response.data;
  };
  /** 弹窗内容使用 textContent，收藏文本不能被当作 HTML 执行。 */
  function openDialog(title, paragraphs, action, label = '确认') {
    get('cloud-dialog-title').textContent = title;
    const body = get('cloud-dialog-body');
    body.replaceChildren();
    for (const text of paragraphs) { const p = document.createElement('p'); p.textContent = text; body.append(p); }
    confirmAction = action;
    get('cloud-dialog-confirm').textContent = label;
    get('cloud-dialog-confirm').hidden = !action;
    if (!dialog.open) dialog.showModal();
    return body;
  }
  async function perform(action) {
    if (busy) return;
    busy = true;
    buttons.forEach(name => { get(`cloud-${name}`).disabled = true; });
    try { await action(); }
    catch (error) { openDialog('操作未完成', [error.message]); }
    finally { busy = false; await refresh(); }
  }
  /** 状态只从后台读取，不能将已写入本地误报为云端同步完成。 */
  async function refresh() {
    try {
      latestStatus = await send('cloudStatus');
      const status = latestStatus;
      get('cloud-account').textContent = status.user ? status.user.email || status.user.uid : '本地收藏';
      const names = { local: '仅保存在本机', pending: '等待同步', syncing: '正在同步…', synced: '已同步', error: status.message || '同步失败' };
      let text = status.configured ? names[status.phase] || '等待同步' : '未配置云服务 · 当前保存在本机';
      if (status.pending) text += ` · ${status.pending} 项待上传`;
      if (status.lastSync && status.phase === 'synced') text += ` · ${new Date(status.lastSync).toLocaleTimeString()}`;
      get('cloud-status').textContent = text;
      get('cloud-status').dataset.phase = status.phase;
      get('cloud-login').hidden = !!status.user && status.phase !== 'error';
      get('cloud-login').textContent = status.user ? '重新登录 Google' : '使用 Google 登录';
      for (const name of ['sync', 'cache', 'logout']) get(`cloud-${name}`).hidden = !status.user;
      get('cloud-migrate').hidden = !status.migrationAvailable;
      const tweets = await send('getTweets');
      const count = tweets.filter(t => t.noteConflicts?.length).length;
      get('cloud-conflicts').hidden = !count;
      get('cloud-conflicts').textContent = `处理笔记冲突 (${count})`;
      buttons.forEach(name => { get(`cloud-${name}`).disabled = busy; });
    } catch (error) { get('cloud-status').textContent = error.message; }
  }
  get('cloud-login').addEventListener('click', () => perform(async () => {
    if (!latestStatus?.configured) { openDialog('先配置免费云服务', ['请打开“配置帮助”，创建 Spark 免费项目并填写客户端配置。现在可以继续使用本地收藏。']); return; }
    const user = await send('cloudLogin');
    if (!latestStatus.ownerConfigured) openDialog('登录成功，还需设置数据权限', [`你的用户 UID：${user.uid}`, '把此 UID 填入本机配置的 ownerUid，重新构建并部署数据库规则。完成之前，规则会拒绝所有云端数据访问。']);
  }));
  get('cloud-sync').addEventListener('click', () => perform(() => send('syncNow')));
  get('cloud-logout').addEventListener('click', () => {
    openDialog('退出 Google 账号', ['云端收藏不会删除。本机该账号缓存与待同步修改会隔离保留，下次登录同一账号后继续同步。'], () => send('cloudLogout'), '退出登录');
  });
  get('cloud-cache').addEventListener('click', () => {
    openDialog('清除本机缓存', ['仅在没有待上传修改时清除当前账号缓存，云端收藏不受影响；随后会重新下载云端记录。'], () => send('clearCache'), '清除并重新下载');
  });
  get('cloud-migrate').addEventListener('click', () => perform(async () => {
    const preview = await send('migrationPreview');
    openDialog('迁移本地收藏到当前账号', [`本地 ${preview.local} 条，云端 ${preview.cloud} 条。\n新增 ${preview.additions} 条，重复 ${preview.duplicates} 条，笔记冲突 ${preview.conflicts} 条。`, '先下载 JSON 备份，再确认合并。不同的笔记会保留供你选择，迁移中断后可继续同步。'], async () => {
      await send('confirmMigration', { uid: preview.uid });
    }, '确认合并并同步');
    const link = document.createElement('a');
    const blobUrl = URL.createObjectURL(new Blob([JSON.stringify({ ...preview.backup, exportedAt: Date.now() }, null, 2)], { type: 'application/json' }));
    link.href = blobUrl; link.download = `x-note-before-migration-${Date.now()}.json`; link.textContent = '下载迁移前备份';
    get('cloud-dialog-body').append(link);
    get('cloud-dialog-confirm').disabled = true;
    link.addEventListener('click', () => { get('cloud-dialog-confirm').disabled = false; });
    dialog.addEventListener('close', () => URL.revokeObjectURL(blobUrl), { once: true });
  }));
  get('cloud-conflicts').addEventListener('click', () => perform(async () => {
    const tweets = await send('getTweets');
    const tweet = tweets.find(t => t.noteConflicts?.length);
    if (!tweet) return;
    const conflict = tweet.noteConflicts[0];
    const body = openDialog('合并笔记冲突', [`帖子：${tweet.text?.slice(0, 80) || tweet.tweetId}`, `当前笔记：\n${tweet.note || '（空）'}`, `另一份修改：\n${conflict.local}`], async () => {
      await send('resolveConflict', { id: tweet.id, note: input.value, resolveIds: [conflict.id] });
    }, '保存合并后的笔记');
    const input = document.createElement('textarea');
    input.setAttribute('aria-label', '合并后的笔记');
    input.value = [tweet.note, conflict.local].filter(Boolean).join('\n\n');
    body.append(input);
  }));
  get('cloud-dialog-cancel').addEventListener('click', () => dialog.close());
  get('cloud-dialog-confirm').addEventListener('click', () => {
    if (!confirmAction) return;
    const action = confirmAction;
    dialog.close();
    perform(action);
  });
  dialog.addEventListener('close', () => { get('cloud-dialog-confirm').disabled = false; });
  let refreshTimer;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.x_note_state_v2) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 100);
  });
  refresh();
})();
