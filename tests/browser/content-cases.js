/**
 * 在真实浏览器 DOM 中验证采集行为；仅使用本地 HTML 夹具，不连接或伪造外部服务。
 */
const results = [];
const fixture = document.getElementById('fixture');
const photo = 'https://pbs.twimg.com/media/example?format=jpg&name=small';
const cover = 'https://pbs.twimg.com/amplify_video_thumb/2105471315306233856/img/H5MjEjSmfUeyWGaA.jpg';

/** 构造一条最小帖子结构，覆盖 X 页面已观察到的正文与媒体节点。 */
function article(body, id = '123') {
  fixture.innerHTML = `<article data-testid="tweet"><a href="https://x.com/example/status/${id}"><time datetime="2026-10-01T01:36:00Z"></time></a>${body}<div role="group"><button class="tns-btn">收藏</button></div></article>`;
  return fixture.firstElementChild;
}
function equal(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`预期 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}
async function check(name, run) {
  try { await run(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: error.message }); }
}

await check('首页展开后的正文完整保留换行、链接和 emoji', () => {
  const el = article('<div data-testid="tweetText">折叠预览…</div>');
  el.querySelector('[data-testid="tweetText"]').innerHTML = '展开后的全文<br>第二段 <a href="https://example.com">example.com</a><img alt="🎉">';
  equal(extractTweetText(el), '展开后的全文\n第二段 example.com🎉');
});
await check('未展开时只保存页面已有正文', () => {
  equal(extractTweetText(article('<div data-testid="tweetText">折叠预览…</div>')), '折叠预览…');
});
await check('翻译标记包裹的原文不能被整段删除', () => {
  const el = article('<div data-testid="tweetText"><span>开头</span><font>展开后正文</font><span data-original="原始内容">结尾</span></div>');
  equal(extractTweetText(el), '开头展开后正文结尾');
});
await check('只移除沉浸式翻译副本并保留原文容器', () => {
  const el = article('<div data-testid="tweetText"><span class="immersive-translate-original">完整原文</span><font class="immersive-translate-target-wrapper">重复译文</font></div>');
  equal(extractTweetText(el), '完整原文');
});
await check('图片保留大图地址并去重', () => {
  const el = article(`<div data-testid="tweetPhoto"><img src="${photo}"><img src="${photo}"></div>`);
  equal(extractMedia(el).images, [photo.replace('name=small', 'name=large')]);
});
await check('保留已加载视频的 poster', () => {
  equal(extractMedia(article(`<div data-testid="videoPlayer"><video poster="${cover}"></video></div>`)).videoThumbnail, cover);
});
await check('视频尚未挂载时从封面图片采集视频入口', () => {
  equal(extractMedia(article(`<div data-testid="videoPlayer"><div data-testid="tweetPhoto"><img src="${cover}"></div></div>`)), { images: [], videoThumbnail: cover });
});
await check('没有 videoPlayer 包装时仍可读取 video 封面', () => {
  equal(extractMedia(article(`<div data-testid="videoComponent"><video poster="${cover}"></video></div>`)).videoThumbnail, cover);
});
await check('替换 article 后根据按钮当前位置采集已展开正文', async () => {
  const old = article('<div data-testid="tweetText">旧预览</div>');
  const button = old.querySelector('.tns-btn');
  const current = article(`<div data-testid="tweetText">展开后的完整正文</div><video poster="${cover}"></video>`);
  current.querySelector('.tns-btn').replaceWith(button);
  const captured = await captureCurrentTweet(button, '123');
  equal([captured.text, captured.videoThumbnail], ['展开后的完整正文', cover]);
});
await check('分类选择期间正文更新后重新采集', async () => {
  const el = article('<div data-testid="tweetText">初始正文</div>');
  const button = el.querySelector('.tns-btn');
  await captureCurrentTweet(button, '123');
  el.querySelector('[data-testid="tweetText"]').textContent = '更新后的完整正文';
  equal((await captureCurrentTweet(button, '123')).text, '更新后的完整正文');
});
await check('页面复用成另一条帖子时拒绝把内容保存到原编号', async () => {
  const el = article('<div data-testid="tweetText">其他帖子</div>', '456');
  try { await captureCurrentTweet(el.querySelector('.tns-btn'), '123'); }
  catch (error) { if (error.message.includes('页面已变化')) return; throw error; }
  throw new Error('应拒绝错误帖子编号');
});
await check('帖子已离开页面时拒绝保存过期快照', async () => {
  const el = article('<div data-testid="tweetText">正文</div>');
  const button = el.querySelector('.tns-btn');
  el.remove();
  try { await captureCurrentTweet(button, '123'); }
  catch (error) { if (error.message.includes('页面已变化')) return; throw error; }
  throw new Error('应拒绝脱离页面的旧节点');
});
await check('没有帖子编号时拒绝采集', async () => {
  const el = article('<div data-testid="tweetText">正文</div>');
  el.querySelector('a').remove();
  try { await captureCurrentTweet(el.querySelector('.tns-btn'), ''); }
  catch (error) { if (error.message.includes('页面已变化')) return; throw error; }
  throw new Error('应拒绝缺少编号的帖子');
});
await check('提取过程不会删除用户正在看的译文', () => {
  const el = article('<div data-testid="tweetText">原文<font class="immersive-translate-target-wrapper">译文</font></div>');
  extractTweetText(el);
  equal(el.querySelector('font').textContent, '译文');
});
await check('头像与非媒体域名不会被当作附件', () => {
  const el = article('<img src="https://pbs.twimg.com/profile_images/avatar.jpg"><img src="https://example.com/twimg.com/media/fake.jpg">');
  equal(extractMedia(el), { images: [], videoThumbnail: '' });
});
await check('帖子容器替换后仍能刷新已收藏按钮状态', () => {
  const el = article('<div data-testid="tweetText">正文</div>');
  savedTweetIds.add('123');
  refreshButtons();
  equal(el.querySelector('.tns-btn').getAttribute('aria-label'), '已收藏，点击补全正文和媒体');
  savedTweetIds.clear();
});
fixture.replaceChildren();
document.getElementById('results').textContent = JSON.stringify(results, null, 2);
document.getElementById('summary').textContent = `${results.filter(r => r.pass).length}/${results.length} 通过`;
document.title = document.getElementById('summary').textContent;
