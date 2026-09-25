/**
 * 验证帖子快速导航对当前视口的判定与无障碍文案。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getVisibleIndexes, navigatorLabel, navigatorScrollTarget, primaryVisibleIndex, requiresScrollableNavigator, shouldShowNavigator } from '../manager/scroll-navigator.js';

test('getVisibleIndexes returns cards intersecting the scroll viewport', () => {
  const viewport = { top: 100, bottom: 500 };
  const cards = [
    { top: 20, bottom: 90 },
    { top: 80, bottom: 180 },
    { top: 450, bottom: 560 },
    { top: 510, bottom: 620 }
  ];
  assert.deepEqual(getVisibleIndexes(viewport, cards), [1, 2]);
});

test('navigatorLabel includes index author and saved time', () => {
  assert.equal(navigatorLabel(2, 8, '易淑婷', '2026-09-26'), '跳转到第 3 条，共 8 条：易淑婷 · 2026-09-26');
});

test('navigator only appears for lists that benefit from jumping', () => {
  assert.equal(shouldShowNavigator(1), false);
  assert.equal(shouldShowNavigator(2), true);
});

test('only the first visible post is exposed as the primary location', () => {
  assert.equal(primaryVisibleIndex([7, 8, 9]), 7);
  assert.equal(primaryVisibleIndex([]), -1);
});

test('dense lists use a scrollable rail before hit targets collapse', () => {
  assert.equal(requiresScrollableNavigator(50, 480), false);
  assert.equal(requiresScrollableNavigator(100, 480), true);
});

test('dense rail follows the active marker without moving when already visible', () => {
  assert.equal(navigatorScrollTarget(80, 88, 100, 400), 80);
  assert.equal(navigatorScrollTarget(520, 528, 100, 400), 128);
  assert.equal(navigatorScrollTarget(240, 248, 100, 400), 100);
});
