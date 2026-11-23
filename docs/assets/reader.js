const STORAGE_KEY = 'dennoworks-episode-0';
const pages = window.episodePages;
const comic = document.querySelector('#comic');
const header = document.querySelector('.reader-header');
const dock = document.querySelector('#reader-dock');
const singleButton = document.querySelector('#single-mode');
const verticalButton = document.querySelector('#vertical-mode');
const pageSelect = document.querySelector('#page-select');
const previousButton = document.querySelector('#prev-page');
const nextButton = document.querySelector('#next-page');
const announcement = document.querySelector('#reader-announcement');
let currentPage = 1;
let mode = '';
let scrollFrame;
let touchStart;

function pageId(page) {
  return `p${String(page).padStart(2, '0')}`;
}

function comicPage(page, eager) {
  const [width, height, description] = pages[page - 1];
  const figure = document.createElement('figure');
  figure.id = pageId(page);
  figure.style.aspectRatio = `${width} / ${height}`;
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

  const hash = `#${mode === 'vertical' ? 'vertical-' : ''}${pageId(page)}`;
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

function showPage(page, nextMode = mode) {
  page = Math.min(pages.length, Math.max(1, page));
  const changedMode = mode !== nextMode;
  mode = nextMode;
  syncPosition(page, true);

  const vertical = mode === 'vertical';
  comic.classList.toggle('vertical', vertical);
  singleButton.setAttribute('aria-pressed', String(!vertical));
  verticalButton.setAttribute('aria-pressed', String(vertical));

  if (vertical) {
    if (changedMode) {
      const figures = pages.map((_, index) => comicPage(index + 1, Math.abs(index + 1 - page) <= 1));
      comic.replaceChildren(...figures);
    }
    document.getElementById(pageId(page)).scrollIntoView({ block: 'start', behavior: 'instant' });
    return;
  }

  comic.replaceChildren(comicPage(page, true));
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (page < pages.length) {
    const upcoming = new Image();
    upcoming.fetchPriority = 'low';
    upcoming.src = `assets/pages/${pageId(page + 1)}.webp`;
  }
}

function showLocation() {
  const target = /^#(vertical-)?p(\d{1,2})$/.exec(location.hash);
  showPage(target && Number(target[2]) ? Number(target[2]) : 1, target?.[1] ? 'vertical' : 'single');
}

function turnPage(delta) {
  const target = currentPage + delta;
  if (target >= 1 && target <= pages.length) showPage(target);
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
window.addEventListener('hashchange', showLocation);

window.addEventListener('scroll', () => {
  if (mode !== 'vertical' || scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = undefined;
    if (mode !== 'vertical') return;
    const readingLine = header.offsetHeight + Math.min(90, window.innerHeight * 0.12);
    const next = Array.prototype.findIndex.call(comic.children, (figure) => figure.getBoundingClientRect().bottom > readingLine) + 1;
    if (next && next !== currentPage) syncPosition(next);
  });
}, { passive: true });

document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
      event.target.closest('select, input, textarea, [contenteditable]')) return;
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  turnPage(event.key === 'ArrowLeft' ? 1 : -1);
});

comic.addEventListener('touchstart', (event) => {
  const touch = event.touches[0];
  touchStart = mode === 'single' && event.touches.length === 1 && (window.visualViewport?.scale ?? 1) === 1
    ? { x: touch.clientX, y: touch.clientY } : undefined;
}, { passive: true });

comic.addEventListener('touchcancel', () => { touchStart = undefined; });
comic.addEventListener('touchend', (event) => {
  if (!touchStart) return;
  const touch = event.changedTouches[0];
  const dx = touch.clientX - touchStart.x;
  const dy = touch.clientY - touchStart.y;
  touchStart = undefined;
  if (Math.abs(dx) > 60 && Math.abs(dx) > 1.7 * Math.abs(dy)) turnPage(dx > 0 ? 1 : -1);
}, { passive: true });

dock.hidden = false;
showLocation();
