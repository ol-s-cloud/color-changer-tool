const originalCanvas = document.getElementById('originalCanvas');
const modifiedCanvas = document.getElementById('modifiedCanvas');
const originalCtx = originalCanvas.getContext('2d', { willReadFrequently: true });
const modifiedCtx = modifiedCanvas.getContext('2d', { willReadFrequently: true });
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const workspace = document.getElementById('workspace');
const fromColor = document.getElementById('fromColor');
const fromColorHex = document.getElementById('fromColorHex');
const toColor = document.getElementById('toColor');
const toColorHex = document.getElementById('toColorHex');
const tolerance = document.getElementById('tolerance');
const toleranceValue = document.getElementById('toleranceValue');
const sampleModeButton = document.getElementById('sampleModeButton');
const sampleState = document.getElementById('sampleState');
const detectedWrap = document.getElementById('detectedWrap');
const detectedColors = document.getElementById('detectedColors');
const downloadLink = document.getElementById('downloadLink');

let originalImageData = null;
let originalFileName = 'image.png';
let sampleMode = false;
let activeObjectUrl = null;

uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') fileInput.click();
});
uploadArea.addEventListener('dragover', (event) => {
  event.preventDefault();
  uploadArea.classList.add('dragover');
});
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', (event) => {
  event.preventDefault();
  uploadArea.classList.remove('dragover');
  const file = event.dataTransfer.files?.[0];
  if (file) handleFile(file);
});
fileInput.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (file) handleFile(file);
});

document.getElementById('replaceImageButton').addEventListener('click', () => fileInput.click());
document.getElementById('changeButton').addEventListener('click', processImage);
document.getElementById('resetButton').addEventListener('click', resetImage);
sampleModeButton.addEventListener('click', toggleSampleMode);

tolerance.addEventListener('input', () => {
  toleranceValue.textContent = tolerance.value;
  if (originalImageData) processImage(false);
});

bindColorPair(fromColor, fromColorHex, () => originalImageData && processImage(false));
bindColorPair(toColor, toColorHex, () => originalImageData && processImage(false));

document.querySelectorAll('.preset').forEach((button) => {
  button.addEventListener('click', () => {
    setColor(fromColor, fromColorHex, button.dataset.from);
    setColor(toColor, toColorHex, button.dataset.to);
    if (originalImageData) processImage(false);
  });
});

originalCanvas.addEventListener('click', (event) => {
  if (!sampleMode || !originalImageData) return;
  const rect = originalCanvas.getBoundingClientRect();
  const scaleX = originalCanvas.width / rect.width;
  const scaleY = originalCanvas.height / rect.height;
  const x = Math.max(0, Math.min(originalCanvas.width - 1, Math.floor((event.clientX - rect.left) * scaleX)));
  const y = Math.max(0, Math.min(originalCanvas.height - 1, Math.floor((event.clientY - rect.top) * scaleY)));
  const pixel = originalCtx.getImageData(x, y, 1, 1).data;
  const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
  setColor(fromColor, fromColorHex, hex);
  toggleSampleMode(false);
  processImage(false);
});

function handleFile(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    alert('Please choose a PNG, JPG, or WebP image.');
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      originalCanvas.width = img.naturalWidth;
      originalCanvas.height = img.naturalHeight;
      modifiedCanvas.width = img.naturalWidth;
      modifiedCanvas.height = img.naturalHeight;

      originalCtx.clearRect(0, 0, originalCanvas.width, originalCanvas.height);
      modifiedCtx.clearRect(0, 0, modifiedCanvas.width, modifiedCanvas.height);
      originalCtx.drawImage(img, 0, 0);
      modifiedCtx.drawImage(img, 0, 0);
      originalImageData = originalCtx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
      originalFileName = file.name || 'image.png';

      document.getElementById('fileName').textContent = originalFileName;
      document.getElementById('fileMeta').textContent = `${img.naturalWidth} × ${img.naturalHeight} · ${formatBytes(file.size)}`;
      uploadArea.hidden = true;
      workspace.hidden = false;
      downloadLink.hidden = true;
      detectTopColors();
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

function processImage(showDownload = true) {
  if (!originalImageData) return;

  const source = hexToRgb(fromColorHex.value);
  const target = hexToRgb(toColorHex.value);
  if (!source || !target) {
    alert('Enter a valid hex color such as #13493F.');
    return;
  }

  const imageData = new ImageData(new Uint8ClampedArray(originalImageData.data), originalImageData.width, originalImageData.height);
  const data = imageData.data;
  const threshold = Number(tolerance.value);

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const distance = Math.sqrt(
      Math.pow(data[i] - source.r, 2) +
      Math.pow(data[i + 1] - source.g, 2) +
      Math.pow(data[i + 2] - source.b, 2)
    );

    if (distance <= threshold) {
      data[i] = target.r;
      data[i + 1] = target.g;
      data[i + 2] = target.b;
    }
  }

  modifiedCtx.putImageData(imageData, 0, 0);
  if (showDownload) prepareDownload();
}

function resetImage() {
  if (!originalImageData) return;
  modifiedCtx.putImageData(originalImageData, 0, 0);
  downloadLink.hidden = true;
}

function prepareDownload() {
  modifiedCanvas.toBlob((blob) => {
    if (!blob) return;
    if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = URL.createObjectURL(blob);
    downloadLink.href = activeObjectUrl;
    downloadLink.download = `${stripExtension(originalFileName)}-recolored.png`;
    downloadLink.hidden = false;
  }, 'image/png');
}

function toggleSampleMode(force) {
  sampleMode = typeof force === 'boolean' ? force : !sampleMode;
  originalCanvas.classList.toggle('sample-mode', sampleMode);
  sampleState.textContent = sampleMode ? 'CLICK A PIXEL' : '';
  sampleModeButton.textContent = sampleMode ? 'Cancel color picker' : 'Pick from image';
}

function detectTopColors() {
  const { data, width, height } = originalImageData;
  const counts = new Map();
  const totalPixels = width * height;
  const step = Math.max(1, Math.floor(totalPixels / 35000));

  for (let pixel = 0; pixel < totalPixels; pixel += step) {
    const i = pixel * 4;
    if (data[i + 3] < 40) continue;
    const r = Math.round(data[i] / 32) * 32;
    const g = Math.round(data[i + 1] / 32) * 32;
    const b = Math.round(data[i + 2] / 32) * 32;
    const key = `${Math.min(r, 255)},${Math.min(g, 255)},${Math.min(b, 255)}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  detectedColors.innerHTML = '';
  top.forEach(([key]) => {
    const [r, g, b] = key.split(',').map(Number);
    const hex = rgbToHex(r, g, b);
    const button = document.createElement('button');
    button.className = 'detected-color';
    button.type = 'button';
    button.style.backgroundColor = hex;
    button.title = `Use ${hex}`;
    button.setAttribute('aria-label', `Use detected color ${hex}`);
    button.addEventListener('click', () => {
      setColor(fromColor, fromColorHex, hex);
      processImage(false);
    });
    detectedColors.appendChild(button);
  });
  detectedWrap.hidden = top.length === 0;
}

function bindColorPair(colorInput, textInput, onChange) {
  colorInput.addEventListener('input', () => {
    textInput.value = colorInput.value.toUpperCase();
    onChange?.();
  });
  textInput.addEventListener('change', () => {
    const normalized = normalizeHex(textInput.value);
    if (!normalized) {
      textInput.value = colorInput.value.toUpperCase();
      return;
    }
    setColor(colorInput, textInput, normalized);
    onChange?.();
  });
}

function setColor(colorInput, textInput, value) {
  const normalized = normalizeHex(value);
  if (!normalized) return;
  colorInput.value = normalized;
  textInput.value = normalized.toUpperCase();
}

function normalizeHex(value) {
  const clean = String(value).trim();
  const withHash = clean.startsWith('#') ? clean : `#${clean}`;
  return /^#[0-9a-fA-F]{6}$/.test(withHash) ? withHash.toLowerCase() : null;
}

function hexToRgb(hex) {
  const valid = normalizeHex(hex);
  if (!valid) return null;
  return {
    r: parseInt(valid.slice(1, 3), 16),
    g: parseInt(valid.slice(3, 5), 16),
    b: parseInt(valid.slice(5, 7), 16)
  };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function stripExtension(name) {
  return name.replace(/\.[^/.]+$/, '') || 'image';
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes === 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
