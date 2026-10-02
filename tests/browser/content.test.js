/**
 * 运行真实 DOM 采集回归测试，也可生成独立 HTML 供浏览器直接检查。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// 只去掉扩展启动入口；提取、按钮和分类函数均直接使用生产源文件。
const source = await readFile(new URL('../../content/content.js', import.meta.url), 'utf8');
const functions = source.slice(0, source.lastIndexOf("if (document.readyState === 'loading')"));
const cases = await readFile(new URL('./content-cases.js', import.meta.url), 'utf8');
// 禁止夹具图片和视频发出网络请求，只测试已有 DOM 属性的提取。
const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'"><title>采集回归测试</title><h1 id="summary">运行中</h1><pre id="results"></pre><div id="fixture"></div><script type="module">${functions}\n${cases}</script>`;
const output = process.argv.indexOf('--html');
if (output !== -1) {
  await writeFile(process.argv[output + 1], html);
  console.log(`测试页已生成：${process.argv[output + 1]}`);
} else {
  test('content extraction passes real DOM regression cases', async () => {
    const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
    const directory = await mkdtemp(join(tmpdir(), 'x-note-content-'));
    let browser;
    try {
      const path = join(directory, 'content.html');
      await writeFile(path, html);
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(pathToFileURL(path).href);
      await page.waitForFunction(() => document.getElementById('summary').textContent.includes('通过'));
      const results = JSON.parse(await page.locator('#results').textContent());
      assert.deepEqual(results.filter(result => !result.pass), []);
    } finally {
      await browser?.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
}
