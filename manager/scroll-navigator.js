/**
 * 帖子列表快速导航：生成一帖一刻度，并标记当前视口中的帖子。
 */

/** 返回与滚动视口相交的帖子索引。 */
export function getVisibleIndexes(viewport, cards) {
  const indexes = [];
  cards.forEach((card, index) => {
    if (card.bottom > viewport.top && card.top < viewport.bottom) indexes.push(index);
  });
  return indexes;
}

/** 生成导航刻度的键盘与悬停提示。 */
export function navigatorLabel(index, total, author, savedTime) {
  const detail = [author, savedTime].filter(Boolean).join(' · ');
  return `跳转到第 ${index + 1} 条，共 ${total} 条${detail ? `：${detail}` : ''}`;
}

/** 至少两篇帖子时才需要快速导航。 */
export function shouldShowNavigator(count) {
  return count >= 2;
}

/** 读屏语义只指定一个主当前位置，视觉上仍可高亮所有可见帖子。 */
export function primaryVisibleIndex(indexes) {
  return indexes[0] ?? -1;
}

/** 当每帖无法保留基本点击高度时，轨道切换为自身可滚动模式。 */
export function requiresScrollableNavigator(count, availableHeight, minimumSlot = 8) {
  return availableHeight > 0 && count * minimumSlot > availableHeight;
}

/** 计算让当前刻度进入轨道可视区所需的滚动位置。 */
export function navigatorScrollTarget(markerTop, markerBottom, viewportTop, viewportHeight) {
  if (markerTop < viewportTop) return markerTop;
  if (markerBottom > viewportTop + viewportHeight) return markerBottom - viewportHeight;
  return viewportTop;
}

/** 初始化导航轨道，并在列表重绘后自动重建刻度。 */
export function createScrollNavigator(list, navigator) {
  const stage = list.closest('.tweet-list-stage');
  let cards = [];
  let markers = [];
  let frame;
  let rovingIndex = 0;

  const updateDensity = () => {
    navigator.classList.toggle('is-scrollable', requiresScrollableNavigator(cards.length, navigator.clientHeight));
  };

  const revealCurrentMarker = index => {
    if (index < 0 || !navigator.classList.contains('is-scrollable')) return;
    const marker = markers[index];
    navigator.scrollTop = navigatorScrollTarget(
      marker.offsetTop,
      marker.offsetTop + marker.offsetHeight,
      navigator.scrollTop,
      navigator.clientHeight
    );
  };

  const updateVisible = () => {
    frame = undefined;
    const viewport = list.getBoundingClientRect();
    const visibleIndexes = getVisibleIndexes(viewport, cards.map(card => card.getBoundingClientRect()));
    const visible = new Set(visibleIndexes);
    const current = primaryVisibleIndex(visibleIndexes);
    if (!navigator.contains(document.activeElement)) rovingIndex = current >= 0 ? current : 0;
    markers.forEach((marker, index) => {
      marker.classList.toggle('is-visible', visible.has(index));
      marker.tabIndex = index === rovingIndex ? 0 : -1;
      if (index === current) marker.setAttribute('aria-current', 'location');
      else marker.removeAttribute('aria-current');
    });
    revealCurrentMarker(current);
  };

  const scheduleVisibleUpdate = () => {
    if (frame) return;
    frame = requestAnimationFrame(updateVisible);
  };

  const rebuild = () => {
    cards = [...list.querySelectorAll('.tweet-card')];
    rovingIndex = Math.max(0, Math.min(rovingIndex, cards.length - 1));
    navigator.replaceChildren();
    const visible = shouldShowNavigator(cards.length);
    navigator.classList.toggle('hidden', !visible);
    stage?.classList.toggle('has-post-navigator', visible);

    markers = cards.map((card, index) => {
      const marker = document.createElement('button');
      const author = card.querySelector('.tweet-card-author')?.textContent?.trim();
      const savedTime = card.querySelector('.tweet-card-time')?.textContent?.trim();
      const label = navigatorLabel(index, cards.length, author, savedTime);
      marker.type = 'button';
      marker.className = 'post-navigator-mark';
      marker.tabIndex = index === rovingIndex ? 0 : -1;
      marker.setAttribute('aria-label', label);
      marker.title = label;
      card.tabIndex = -1;
      marker.addEventListener('focus', () => { rovingIndex = index; });
      marker.addEventListener('keydown', event => {
        const keys = { ArrowUp: index - 1, ArrowDown: index + 1, Home: 0, End: cards.length - 1 };
        if (!(event.key in keys)) return;
        event.preventDefault();
        const target = Math.max(0, Math.min(keys[event.key], markers.length - 1));
        marker.tabIndex = -1;
        markers[target].tabIndex = 0;
        markers[target].focus();
      });
      marker.addEventListener('click', () => {
        card.focus({ preventScroll: true });
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      navigator.appendChild(marker);
      return marker;
    });
    updateDensity();
    scheduleVisibleUpdate();
  };

  list.addEventListener('scroll', scheduleVisibleUpdate, { passive: true });
  new MutationObserver(rebuild).observe(list, { childList: true });
  new ResizeObserver(() => {
    updateDensity();
    scheduleVisibleUpdate();
  }).observe(list);
  rebuild();
}

if (typeof document !== 'undefined') {
  const list = document.getElementById('tweet-list');
  const navigator = document.getElementById('post-navigator');
  if (list && navigator) createScrollNavigator(list, navigator);
}
