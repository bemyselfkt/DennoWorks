const STORAGE_KEY = 'dennoworks-episode-0';
const ZOOM_LEVELS = [1, 1.25, 1.5, 2, 2.5, 3];
const pages = window.episodePages;
const comic = document.querySelector('#comic');
const reader = document.body;
const readingArea = document.querySelector('#reading-area');
const dock = document.querySelector('#reader-dock');
const singleButton = document.querySelector('#single-mode');
const verticalButton = document.querySelector('#vertical-mode');
const fullscreenButton = document.querySelector('#fullscreen-button');
const fullscreenLabel = document.querySelector('#fullscreen-label');
const pageSelect = document.querySelector('#page-select');
const previousButton = document.querySelector('#prev-page');
const nextButton = document.querySelector('#next-page');
const zoomControls = document.querySelector('#zoom-controls');
const zoomOutButton = document.querySelector('#zoom-out');
const zoomResetButton = document.querySelector('#zoom-reset');
const zoomInButton = document.querySelector('#zoom-in');
const announcement = document.querySelector('#reader-announcement');
let currentPage = 1;
let mode = '';
let zoomIndex = 0;
let immersive = false;
let nativeFullscreen = false;
let scrollFrame;
let touchStart;
let mousePan;
let suppressClickUntil = 0;

function pageId(page) {
  return `p${String(page).padStart(2, '0')}`;
}

function comicPage(page, eager) {
  const [width, height, description] = pages[page - 1];
  const figure = document.createElement('figure');
  figure.id = pageId(page);
  figure.style.aspectRatio = `${width} / ${height}`;
  figure.style.setProperty('--page-ratio', String(width / height));
  const img = new Image(width, height);
  img.alt = `${page}ページ　${description}`;
  img.decoding = 'async';
  img.loading = eager ? 'eager' : 'lazy';
  img.draggable = false;
  figure.append(img);

  img.addEventListener('error', () => {
    if (figure.querySelector('.page-load-error')) return;
    const notice = document.createElement('div');
    notice.className = 'page-load-error';
    const message = document.createElement('p');
    message.textContent = `${page}ページの画像を読み込めませんでした。`;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = '再読み込み';
    retry.addEventListener('click', () => {
      notice.remove();
      img.src = img.src;
    });
    notice.append(message, retry);
    figure.append(notice);
  });

  img.src = `assets/pages/${figure.id}.webp`;
  return figure;
}

function syncPosition(page, announce = false) {
  currentPage = page;
  pageSelect.value = String(page);
  previousButton.disabled = page <= 1;
  nextButton.disabled = page >= pages.length;

  const hash = `#${mode === 'single' ? 'single-' : 'vertical-'}${pageId(page)}`;
  if (location.hash !== hash) {
    try {
      history.replaceState(null, '', hash);
    } catch {
      // Page turning still works in a local file preview.
    }
  }
  try {
    localStorage.setItem(STORAGE_KEY, hash);
  } catch {
    // Reading remains available when browser storage is disabled.
  }
  if (announce) announcement.textContent = `全${pages.length}ページ中、${page}ページ`;
}

function setZoom(index, keepCenter = true) {
  const nextIndex = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, index));
  const figure = comic.firstElementChild;
  const width = figure?.offsetWidth;
  const height = figure?.offsetHeight;
  const preserve = keepCenter && nextIndex > 0 && width > 0 && height > 0 && mode === 'single';
  const bounds = preserve ? readingArea.getBoundingClientRect() : null;
  const before = preserve ? figure.getBoundingClientRect() : null;
  zoomIndex = nextIndex;
  const zoom = ZOOM_LEVELS[zoomIndex];
  comic.style.setProperty('--zoom', String(zoom));
  reader.classList.toggle('reader-zoomed', zoomIndex > 0);
  zoomOutButton.disabled = zoomIndex === 0;
  zoomInButton.disabled = zoomIndex === ZOOM_LEVELS.length - 1;
  zoomResetButton.textContent = `${Math.round(zoom * 100)}%`;

  if (preserve) {
    const after = figure.getBoundingClientRect();
    const x = bounds.left + readingArea.clientWidth / 2;
    const y = bounds.top + readingArea.clientHeight / 2;
    readingArea.scrollBy({
      left: after.left + (x - before.left) * after.width / before.width - x,
      top: after.top + (y - before.top) * after.height / before.height - y,
      behavior: 'instant'
    });
  } else {
    readingArea.scrollTo({ left: 0, top: 0, behavior: 'instant' });
  }
}

function scrollToFigure(figure, offset = 0) {
  const bounds = figure.getBoundingClientRect();
  const top = bounds.top - readingArea.getBoundingClientRect().top + readingArea.scrollTop;
  const gutter = parseFloat(getComputedStyle(comic).paddingTop);
  readingArea.scrollTo({ left: 0, top: top + (offset ? offset * bounds.height : -gutter), behavior: 'instant' });
}

function showPage(page, nextMode = mode) {
  page = Math.min(pages.length, Math.max(1, page));
  const changedMode = mode !== nextMode;
  mode = nextMode;
  syncPosition(page, true);

  const vertical = mode === 'vertical';
  comic.classList.toggle('vertical', vertical);
  reader.classList.toggle('reader-single', !vertical);
  zoomControls.hidden = vertical;
  singleButton.setAttribute('aria-pressed', String(!vertical));
  verticalButton.setAttribute('aria-pressed', String(vertical));
  if (changedMode || !vertical) setZoom(0, false);

  if (vertical) {
    if (changedMode) {
      const figures = pages.map((_, index) => comicPage(index + 1, Math.abs(index + 1 - page) <= 1));
      comic.replaceChildren(...figures);
    }
    scrollToFigure(document.getElementById(pageId(page)));
    return;
  }

  comic.replaceChildren(comicPage(page, true));
  if (page < pages.length) {
    const upcoming = new Image();
    upcoming.fetchPriority = 'low';
    upcoming.src = `assets/pages/${pageId(page + 1)}.webp`;
  }
}

function showLocation() {
  const target = /^#(?:(vertical|single)-)?p(\d{1,2})$/.exec(location.hash);
  showPage(target && Number(target[2]) ? Number(target[2]) : 1, target?.[1] === 'single' ? 'single' : 'vertical');
}

function turnPage(delta) {
  const target = currentPage + delta;
  if (target >= 1 && target <= pages.length) showPage(target);
}

function setImmersive(enabled) {
  const figure = mode === 'vertical' ? document.getElementById(pageId(currentPage)) : null;
  const bounds = figure?.getBoundingClientRect();
  const offset = bounds?.height
    ? Math.max(0, (readingArea.getBoundingClientRect().top - bounds.top) / bounds.height)
    : 0;
  immersive = enabled;
  reader.classList.toggle('reader-immersive', enabled);
  reader.classList.remove('reader-controls-visible');

  const label = enabled ? '全画面を終了' : '全画面';
  fullscreenLabel.textContent = label;
  fullscreenButton.setAttribute('aria-label', label);
  fullscreenButton.setAttribute('aria-pressed', String(enabled));
  fullscreenButton.title = enabled ? '全画面を終了（Escキー）' : '全画面（Fキー）';
  if (figure) scrollToFigure(figure, offset);

  if (enabled) {
    readingArea.focus({ preventScroll: true });
    announcement.textContent = '全画面表示。画面をタップして操作ボタンを表示できます。';
  } else {
    fullscreenButton.focus({ preventScroll: true });
  }
}

function toggleFullscreen() {
  if (immersive) {
    setImmersive(false);
    if (document.fullscreenElement === reader) document.exitFullscreen()?.catch(() => {});
    return;
  }
  setImmersive(true);
  if (document.fullscreenEnabled) reader.requestFullscreen?.()?.catch(() => {
    // The reader-only layout also works without the browser fullscreen API.
  });
}

for (let page = 1; page <= pages.length; page += 1) {
  const option = new Option(`${page} / ${pages.length}`, String(page));
  pageSelect.add(option);
}

pageSelect.addEventListener('change', () => showPage(Number(pageSelect.value)));
previousButton.addEventListener('click', () => turnPage(-1));
nextButton.addEventListener('click', () => turnPage(1));
singleButton.addEventListener('click', () => { if (mode !== 'single') showPage(currentPage, 'single'); });
verticalButton.addEventListener('click', () => { if (mode !== 'vertical') showPage(currentPage, 'vertical'); });
fullscreenButton.addEventListener('click', toggleFullscreen);
zoomOutButton.addEventListener('click', () => setZoom(zoomIndex - 1));
zoomInButton.addEventListener('click', () => setZoom(zoomIndex + 1));
zoomResetButton.addEventListener('click', () => setZoom(0));
window.addEventListener('hashchange', showLocation);

document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement === reader) {
    nativeFullscreen = true;
    if (!immersive) document.exitFullscreen()?.catch(() => {});
  } else if (nativeFullscreen) {
    nativeFullscreen = false;
    if (immersive) setImmersive(false);
  }
});

readingArea.addEventListener('scroll', () => {
  if (mode !== 'vertical' || scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = undefined;
    if (mode !== 'vertical') return;
    const readingLine = readingArea.getBoundingClientRect().top + Math.min(90, readingArea.clientHeight * 0.12);
    const atEnd = readingArea.scrollTop > 0 && readingArea.scrollTop + readingArea.clientHeight >= readingArea.scrollHeight - 2;
    const next = atEnd ? pages.length : Array.prototype.findIndex.call(
      comic.children, (figure) => figure.getBoundingClientRect().bottom > readingLine
    ) + 1;
    if (next && next !== currentPage) syncPosition(next);
  });
}, { passive: true });

document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey ||
      event.target.closest('select, input, textarea, [contenteditable]')) return;
  if ((!event.shiftKey && event.key.toLowerCase() === 'f') || (immersive && event.key === 'Escape')) {
    if (!event.repeat) toggleFullscreen();
    event.preventDefault();
    return;
  }
  if (mode === 'single' && ['+', '=', '-', '0'].includes(event.key)) {
    event.preventDefault();
    setZoom(event.key === '0' ? 0 : zoomIndex + (event.key === '-' ? -1 : 1));
    return;
  }
  if (event.shiftKey) return;
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  turnPage(event.key === 'ArrowLeft' ? 1 : -1);
});

comic.addEventListener('touchstart', (event) => {
  const touch = event.touches[0];
  touchStart = mode === 'single' && zoomIndex === 0 && event.touches.length === 1 && (window.visualViewport?.scale ?? 1) <= 1.01
    ? { x: touch.clientX, y: touch.clientY } : undefined;
}, { passive: true });

comic.addEventListener('touchcancel', () => { touchStart = undefined; });
comic.addEventListener('touchend', (event) => {
  if (!touchStart) return;
  const touch = event.changedTouches[0];
  const dx = touch.clientX - touchStart.x;
  const dy = touch.clientY - touchStart.y;
  touchStart = undefined;
  if (Math.abs(dx) > 60 && Math.abs(dx) > 1.7 * Math.abs(dy)) {
    suppressClickUntil = performance.now() + 350;
    turnPage(dx > 0 ? 1 : -1);
  }
}, { passive: true });

comic.addEventListener('pointerdown', (event) => {
  if (!zoomIndex || event.pointerType !== 'mouse' || event.button !== 0 || !event.target.closest('img')) return;
  mousePan = {
    id: event.pointerId, x: event.clientX, y: event.clientY,
    left: readingArea.scrollLeft, top: readingArea.scrollTop
  };
});

comic.addEventListener('pointermove', (event) => {
  if (mousePan?.id !== event.pointerId) return;
  const dx = event.clientX - mousePan.x;
  const dy = event.clientY - mousePan.y;
  if (!mousePan.active) {
    if (Math.hypot(dx, dy) < 5) return;
    mousePan.active = true;
    comic.setPointerCapture(event.pointerId);
    reader.classList.add('reader-panning');
  }
  readingArea.scrollTo({ left: mousePan.left - dx, top: mousePan.top - dy, behavior: 'instant' });
});

function endMousePan(event) {
  if (mousePan?.id !== event.pointerId) return;
  if (mousePan.active) suppressClickUntil = performance.now() + 200;
  mousePan = undefined;
  reader.classList.remove('reader-panning');
}

window.addEventListener('pointerup', endMousePan);
window.addEventListener('pointercancel', endMousePan);

readingArea.addEventListener('click', (event) => {
  if (!immersive || performance.now() < suppressClickUntil || event.target.closest('button, a')) return;
  const visible = reader.classList.toggle('reader-controls-visible');
  if (!visible) readingArea.focus({ preventScroll: true });
});

dock.hidden = false;
showLocation();
