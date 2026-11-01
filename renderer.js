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
  showPlayerImage();
  startTimer();
  showUiTemporarily();
}

function showPlayerImage() {
  const img = images[playIndex];
  playerImg.src = img.url;
  playerTitle.textContent = img.name;
  playerCounter.textContent = `${playIndex + 1} / ${images.length}`;
}

function startTimer() {
  stopTimer();
  playing = true;
  btnToggle.textContent = '⏸';
  timer = setInterval(() => nextImage(1), intervalSeconds * 1000);
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

function nextImage(step) {
  playIndex = (playIndex + step + images.length) % images.length;
  showPlayerImage();
  if (playing) startTimer(); // 手动切换后重置计时
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
btnPrev.addEventListener('click', clickAndBlur(() => nextImage(-1)));
btnNext.addEventListener('click', clickAndBlur(() => nextImage(1)));
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
      case 'ArrowLeft': nextImage(-1); break;
      case 'ArrowRight': nextImage(1); break;
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
