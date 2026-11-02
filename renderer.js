// ---------- 状态 ----------
let images = [];        // [{ name, url }]
let currentIndex = -1;  // 当前预览的图片下标
let playIndex = 0;      // 全屏播放的下标
let playing = false;
let timer = null;
let hideUiTimer = null;
let intervalSeconds = 3;

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const btnSelect = $('btn-select');
const btnPlay = $('btn-play');
const folderPathEl = $('folder-path');
const countLabel = $('count-label');
const gridEl = $('grid');
const emptyHint = $('empty-hint');
const previewImg = $('preview-img');
const previewEmpty = $('preview-empty');
const previewName = $('preview-name');
const previewIndex = $('preview-index');
const player = $('player');
const playerImg = $('player-img');
const playerTitle = $('player-title');
const playerCounter = $('player-counter');
const btnPrev = $('btn-prev');
const btnNext = $('btn-next');
const btnToggle = $('btn-toggle');
const btnExit = $('btn-exit');
const intervalInput = $('interval');
const intervalLabel = $('interval-label');

// ---------- 选择文件夹 ----------
btnSelect.addEventListener('click', async () => {
  const result = await window.api.selectFolder();
  if (!result) return;
  images = result.images || [];
  dimsCache.clear(); // 换文件夹后清空尺寸缓存
  currentIndex = -1;
  folderPathEl.textContent = result.folderPath;
  folderPathEl.title = result.folderPath;
  document.title = `${result.folderPath} - 图片预览播放器`;

  if (result.error) {
    countLabel.textContent = '读取失败';
    renderGrid();
    return;
  }
  countLabel.textContent = `共 ${images.length} 张图片`;
  btnPlay.disabled = images.length === 0;
  renderGrid();
  resetPreview();
});

// ---------- 缩略图网格 ----------
function renderGrid() {
  gridEl.innerHTML = '';
  emptyHint.hidden = images.length > 0;

  const frag = document.createDocumentFragment();
  images.forEach((img, i) => {
    const div = document.createElement('div');
    div.className = 'thumb' + (i === currentIndex ? ' selected' : '');
    div.title = img.name;

    const thumb = document.createElement('img');
    thumb.loading = 'lazy';
    thumb.src = img.url;
    thumb.onerror = () => { thumb.src = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#262b38"/><text x="40" y="46" font-size="14" fill="#9aa1b2" text-anchor="middle">?</text></svg>'); };

    const name = document.createElement('div');
    name.className = 'thumb-name';
    name.textContent = img.name;

    div.appendChild(thumb);
    div.appendChild(name);
    div.addEventListener('click', () => selectImage(i));
    div.addEventListener('dblclick', () => startPlayback(i));
    frag.appendChild(div);
  });
  gridEl.appendChild(frag);
}

function selectImage(i) {
  currentIndex = i;
  document.querySelectorAll('.thumb').forEach((el, idx) => {
    el.classList.toggle('selected', idx === i);
  });
  previewImg.src = images[i].url;
  previewImg.hidden = false;
  previewEmpty.hidden = true;
  previewName.textContent = images[i].name;
  previewIndex.textContent = `${i + 1} / ${images.length}`;
}

function resetPreview() {
  previewImg.hidden = true;
  previewImg.removeAttribute('src');
  previewEmpty.hidden = false;
  previewName.textContent = '';
  previewIndex.textContent = '';
}

// ---------- 全屏播放 ----------
// 放映规则：
//  - 横屏图：单独铺满整个屏幕
//  - 竖屏图：与之前的竖图横向紧贴排成一条（整体居中）；屏幕放不下时整体左移，为新图腾出空间
const stripEl = $('strip');
let stripImages = [];          // 当前条带中的图片下标
let dimsCache = new Map();     // 下标 -> {w, h}（图片实际尺寸缓存）
let currentOffset = 0;         // 条带当前水平位移
let pruneTimer = null;         // 移出屏幕左缘的图片的清理定时器
let advancing = false;         // 防止快速连按导致的并发切换
const SHIFT_MS = 600;          // 与 CSS 中 .strip 的 transform 时长一致

function getDims(i) {
  return new Promise((resolve) => {
    const cached = dimsCache.get(i);
    if (cached) return resolve(cached);
    const probe = new Image();
    probe.onload = () => {
      const d = { w: probe.naturalWidth, h: probe.naturalHeight };
      dimsCache.set(i, d);
      resolve(d);
    };
    probe.onerror = () => {
      dimsCache.set(i, { w: 0, h: 0 });
      resolve({ w: 0, h: 0 });
    };
    probe.src = images[i].url;
  });
}

// 提前读取后面一批图片的尺寸，保证切换时能立刻分类排版
function preloadDims(from) {
  const n = Math.min(60, images.length);
  for (let k = 0; k < n; k++) getDims((from + k) % images.length);
}

function isPortrait(d) {
  return d.w > 0 && d.h > 0 && d.w < d.h;
}

function updateLabels(i) {
  playerTitle.textContent = images[i].name;
  playerCounter.textContent = `${i + 1} / ${images.length}`;
}

// 横屏图：单独铺满屏幕
function showLandscape(i) {
  stripEl.hidden = true;
  playerImg.hidden = false;
  playerImg.classList.remove('shown');
  playerImg.onload = () => playerImg.classList.add('shown');
  playerImg.src = images[i].url;
  updateLabels(i);
}

function clearStrip() {
  stripEl.innerHTML = '';
  stripImages = [];
  currentOffset = 0;
}

// 竖屏图：紧贴追加到条带末尾
function addToStrip(i) {
  const el = document.createElement('img');
  el.draggable = false;
  el.className = 'strip-img';
  el.__idx = i;
  el.onload = () => el.classList.add('shown');
  el.src = images[i].url;
  playerImg.hidden = true;
  stripEl.hidden = false;
  stripEl.appendChild(el);
  stripImages.push(i);
  layoutStrip();
}

// 排版：放得下就整体居中；放不下就右缘对齐（即整体左移，为新图腾出空间）
function layoutStrip() {
  const sw = player.clientWidth;
  const sh = player.clientHeight;
  let total = 0;
  for (const img of stripEl.children) {
    const d = dimsCache.get(img.__idx);
    const w = d && d.h ? (sh * d.w) / d.h : sh * 0.75;
    total += w;
  }
  stripEl.style.width = total + 'px';
  currentOffset = total <= sw ? (sw - total) / 2 : sw - total;
  stripEl.style.transform = `translateX(${currentOffset}px)`;
  schedulePrune();
}

// 滑动动画结束后，把完全移出屏幕左缘的图片从 DOM 中摘掉
function schedulePrune() {
  if (pruneTimer) clearTimeout(pruneTimer);
  pruneTimer = setTimeout(pruneStrip, SHIFT_MS + 100);
}

function pruneStrip() {
  pruneTimer = null;
  let acc = currentOffset;
  let removed = 0;
  for (const img of [...stripEl.children]) {
    const w = img.offsetWidth;
    if (acc + w <= 1) {
      img.remove();
      removed++;
    } else {
      break;
    }
    acc += w;
  }
  if (removed > 0) {
    // 摘掉的是屏幕外的图，剩余图片的屏幕位置不变，因此用无动画模式重排，避免跳动
    stripEl.classList.add('no-anim');
    layoutStrip();
    void stripEl.offsetWidth; // 强制重排，让无动画生效
    stripEl.classList.remove('no-anim');
    stripImages.splice(0, removed);
  }
}

// 以第 i 张为起点重新开始放映（进入播放或回退到单张时用）
async function showSingle(i) {
  clearStrip();
  const d = await getDims(i);
  if (isPortrait(d)) addToStrip(i);
  else showLandscape(i);
  updateLabels(i);
}

async function startPlayback(fromIndex) {
  if (images.length === 0) return;
  playIndex = Math.max(0, Math.min(fromIndex, images.length - 1));
  player.hidden = false;
  try {
    if (!document.fullscreenElement && player.requestFullscreen) {
      await player.requestFullscreen();
    }
  } catch (err) {
    // 无法进入系统全屏时，仍在窗口内以全屏层播放
  }
  preloadDims(playIndex);
  await showSingle(playIndex);
  startTimer();
  showUiTemporarily();
}

function startTimer() {
  stopTimer();
  playing = true;
  btnToggle.textContent = '⏸';
  timer = setInterval(nextImage, intervalSeconds * 1000);
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
  playing = false;
  btnToggle.textContent = '▶';
}

function togglePlay() {
  playing ? stopTimer() : startTimer();
}

// 下一张：竖图拼接（放不下则整体左移），横图清空条带单独铺满
async function nextImage() {
  if (advancing) return;
  advancing = true;
  try {
    playIndex = (playIndex + 1) % images.length;
    const d = await getDims(playIndex);
    if (isPortrait(d)) {
      addToStrip(playIndex);
    } else {
      clearStrip();
      showLandscape(playIndex);
    }
    updateLabels(playIndex);
    if (playing) startTimer(); // 手动切换后重置计时
  } finally {
    advancing = false;
  }
}

// 上一张：条带里有多张时先收回最后一张；只剩单张时退到上一张重新放映
async function prevImage() {
  if (advancing) return;
  advancing = true;
  try {
    if (stripImages.length > 1) {
      stripEl.lastElementChild.remove();
      stripImages.pop();
      playIndex = stripImages[stripImages.length - 1];
      layoutStrip();
      updateLabels(playIndex);
      if (playing) startTimer();
      return;
    }
    playIndex = (playIndex - 1 + images.length) % images.length;
    await showSingle(playIndex);
    if (playing) startTimer();
  } finally {
    advancing = false;
  }
}

function exitPlayback() {
  stopTimer();
  player.hidden = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

// 点击后移除焦点，避免空格/回车键再次触发按钮
const clickAndBlur = (fn) => (e) => { e.currentTarget.blur(); fn(); };
btnPlay.addEventListener('click', clickAndBlur(() => startPlayback(currentIndex >= 0 ? currentIndex : 0)));
previewImg.addEventListener('click', () => startPlayback(currentIndex));
btnPrev.addEventListener('click', clickAndBlur(prevImage));
btnNext.addEventListener('click', clickAndBlur(nextImage));
btnToggle.addEventListener('click', clickAndBlur(togglePlay));
btnExit.addEventListener('click', clickAndBlur(exitPlayback));

intervalInput.addEventListener('input', () => {
  intervalSeconds = Number(intervalInput.value);
  intervalLabel.textContent = intervalSeconds + 's';
  if (playing) startTimer();
});

// 播放层内点击图片：暂停 / 继续
playerImg.addEventListener('click', (e) => {
  if (e.target === playerImg) togglePlay();
});
stripEl.addEventListener('click', (e) => {
  if (e.target.tagName === 'IMG') togglePlay();
});

// 鼠标移动时短暂显示 UI
player.addEventListener('mousemove', showUiTemporarily);

function showUiTemporarily() {
  player.classList.remove('hide-ui');
  if (hideUiTimer) clearTimeout(hideUiTimer);
  hideUiTimer = setTimeout(() => player.classList.add('hide-ui'), 2500);
}

// 用户按 Esc 退出系统全屏后同步清理
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && !player.hidden) {
    exitPlayback();
  }
});

// ---------- 键盘快捷键 ----------
document.addEventListener('keydown', (e) => {
  const inPlayer = !player.hidden;

  // 焦点在间隔滑杆上时，方向键留给滑杆本身
  if (e.target === intervalInput && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    return;
  }

  if (inPlayer) {
    switch (e.key) {
      case 'ArrowLeft': prevImage(); break;
      case 'ArrowRight': nextImage(); break;
      case ' ': e.preventDefault(); togglePlay(); break;
      case 'Escape': exitPlayback(); break;
      default: return;
    }
    return;
  }

  if (images.length === 0) return;
  switch (e.key) {
    case 'ArrowLeft':
      if (currentIndex > 0) selectImage(currentIndex - 1);
      break;
    case 'ArrowRight':
      if (currentIndex < images.length - 1) selectImage(currentIndex + 1);
      break;
    case ' ':
    case 'Enter':
    case 'f':
      e.preventDefault();
      startPlayback(currentIndex >= 0 ? currentIndex : 0);
      break;
  }
});
