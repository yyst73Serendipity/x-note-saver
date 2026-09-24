/**
 * 验证升级迁移不会因为重复保存整库数据而触碰浏览器本地配额。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('manifest grants unlimited local storage for large existing collections', async () => {
  const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
  assert.equal(manifest.permissions.includes('unlimitedStorage'), true);
});

test('v2 state does not keep full legacy and projection copies', async () => {
  const source = await readFile('storage/local-store.js', 'utf8');
  const background = await readFile('background/background.js', 'utf8');
  assert.equal(source.includes('x_note_legacy_backup'), false);
  assert.equal(source.includes('twitter_notes: projected.tweets'), false);
  assert.equal(background.includes('migrationBackup'), false);
});
