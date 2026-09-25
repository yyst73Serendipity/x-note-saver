/**
 * 构建可加载的扩展、认证页面和个人专用规则，保留固定扩展 ID。
 */
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { isConfigured } from '../auth/auth-guard.js';
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const config = JSON.parse(await readFile('config/firebase.local.json', 'utf8').catch(error => {
  if (error.code !== 'ENOENT') throw error;
  return '{}';
}));
const id = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32).replace(/[0-9a-f]/g, c => String.fromCharCode(97 + parseInt(c, 16)));
if (Object.keys(config).length && !isConfigured(config)) throw new Error('Firebase 配置不完整，请检查 config/firebase.local.json');
if (config.ownerUid && !/^[A-Za-z0-9_-]{1,128}$/.test(config.ownerUid)) throw new Error('所有者 UID 格式无效');
if (config.authPageUrl) {
  const origin = new URL(config.authPageUrl).origin;
  if (!/^https:\/\/[a-z0-9.-]+$/.test(origin)) throw new Error('登录页面必须使用 HTTPS 域名');
  manifest.host_permissions.push(`${origin}/*`);
  manifest.content_security_policy.extension_pages = `script-src 'self'; object-src 'self'; frame-src ${origin}; connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com ${origin};`;
}
await rm('dist', { recursive: true, force: true });
await rm('build', { recursive: true, force: true });
await mkdir('build', { recursive: true });
await mkdir('dist/extension', { recursive: true });
await mkdir('dist/hosting', { recursive: true });
for (const directory of ['assets', 'content', 'manager']) await cp(directory, `dist/extension/${directory}`, { recursive: true });
await mkdir('dist/extension/offscreen', { recursive: true });
await writeFile('dist/extension/offscreen/offscreen.html', (await readFile('offscreen/offscreen.html', 'utf8')).replace('../build/offscreen.js', 'offscreen.js'));
await cp('auth-page/index.html', 'dist/hosting/index.html');
const distManifest = structuredClone(manifest);
distManifest.background.service_worker = 'background/background.js';
await writeFile('dist/extension/manifest.json', JSON.stringify(distManifest, null, 2) + '\n');
const options = { bundle: true, platform: 'browser', target: 'chrome116', define: { __FIREBASE_CONFIG__: JSON.stringify(config), __EXTENSION_ID__: JSON.stringify(id) }, legalComments: 'eof', minify: true };
await build({ ...options, entryPoints: ['background/background.js'], outfile: 'build/background.js', format: 'esm' });
await build({ ...options, entryPoints: ['offscreen/offscreen.js'], outfile: 'build/offscreen.js', format: 'iife' });
await mkdir('dist/extension/background', { recursive: true });
await cp('build/background.js', 'dist/extension/background/background.js');
await cp('build/offscreen.js', 'dist/extension/offscreen/offscreen.js');
await build({ ...options, entryPoints: ['auth-page/sign-in.js'], outfile: 'dist/hosting/sign-in.js', format: 'iife' });
await writeFile('dist/firestore.rules', (await readFile('firestore.rules', 'utf8')).replaceAll('__OWNER_UID__', config.ownerUid || '__OWNER_UID__'));
await writeFile('dist/extension-id.txt', id + '\n');
console.log(`构建完成：dist/extension\n扩展 ID：${id}\n云配置：${isConfigured(config) ? '已配置' : '未配置，使用本地模式'}\n所有者：${config.ownerUid ? '已限制' : '尚未配置，云端规则默认拒绝所有访问'}`);
