/**
 * ImageProcessor
 * Готовит рисунок глифа для нейросети: нормализованное изображение 64×64×1.
 * Рисунок обрезается по пикселям, масштабируется в поле innerSize и центрируется.
 */
export class ImageProcessor {
  constructor() {
    this.size = 64;
    this.innerSize = 52;
    this.padding = 6;
    this.buffer = document.createElement('canvas');
    this.buffer.width = this.size;
    this.buffer.height = this.size;
    this.ctx = this.buffer.getContext('2d', { willReadFrequently: true });

    this.mask = document.createElement('canvas');
    this.maskCtx = this.mask.getContext('2d', { willReadFrequently: true });
  }

  /**
   * Преобразует canvas в тензор [1, 64, 64, 1] со значениями 0..1.
   * @param {HTMLCanvasElement} sourceCanvas
   * @returns {{tensor: tf.Tensor, preview: HTMLCanvasElement, empty: boolean}}
   */
  process(sourceCanvas) {
    this._ensureTf();

    const srcCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;
    const pixels = srcCtx.getImageData(0, 0, width, height);
    const bbox = this._findInkBounds(pixels.data, width, height);

    this._clearBuffer();

    if (!bbox) {
      return {
        tensor: tf.zeros([1, this.size, this.size, 1]),
        preview: this.buffer,
        empty: true
      };
    }

    this._drawNormalizedMask(pixels, bbox, width, height);

    const tensor = tf.tidy(() => tf.browser
      .fromPixels(this.buffer, 1)
      .toFloat()
      .div(255)
      .expandDims(0));

    return { tensor, preview: this.buffer, empty: false };
  }

  /**
   * Рисует ГРУППУ штрихов (одну «кляксу» — связанные штрихи одного глифа)
   * на временном холсте и прогоняет через общий pipeline нормализации.
   * Так квадрат из 4 линий попадает в сеть как цельное изображение квадрата.
   * @param {Array<{points:Array<{x:number,y:number}>}>|Array<Array>} strokeList
   * @param {number} sourceSize
   */
  processStrokeGroup(strokeList, sourceSize = 520) {
    const canvas = document.createElement('canvas');
    canvas.width = sourceSize;
    canvas.height = sourceSize;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, sourceSize, sourceSize);
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const stroke of strokeList) {
      const points = Array.isArray(stroke) ? stroke : (stroke.points || []);
      if (points.length === 1) {
        ctx.beginPath();
        ctx.arc(points[0].x, points[0].y, 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.stroke();
      }
    }

    return this.process(canvas);
  }

  /**
   * Совместимость: один штрих как частный случай группы из одного штриха.
   * @param {Array<{x:number,y:number}>} points
   */
  processStroke(points, sourceSize = 520) {
    return this.processStrokeGroup([points], sourceSize);
  }

  _ensureTf() {
    if (typeof tf === 'undefined') {
      throw new Error('TensorFlow.js не загружен. Проверь подключение CDN-скрипта.');
    }
  }

  _clearBuffer() {
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.size, this.size);
    this.ctx.restore();
  }

  _findInkBounds(data, width, height) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        const bright = (r + g + b) / 3;
        if (a > 12 && bright > 18) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (!Number.isFinite(minX)) return null;

    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const pad = Math.max(2, Math.round(Math.max(w, h) * 0.2));

    return {
      minX: Math.max(0, minX - pad),
      minY: Math.max(0, minY - pad),
      maxX: Math.min(width - 1, maxX + pad),
      maxY: Math.min(height - 1, maxY + pad)
    };
  }

  _drawNormalizedMask(pixels, bbox, sourceWidth, sourceHeight) {
    this.mask.width = sourceWidth;
    this.mask.height = sourceHeight;

    const maskImage = this.maskCtx.createImageData(sourceWidth, sourceHeight);
    const src = pixels.data;
    const dst = maskImage.data;

    // Переводим любые светлые/непрозрачные чернила в белый цвет на чёрном фоне.
    for (let i = 0; i < src.length; i += 4) {
      const bright = (src[i] + src[i + 1] + src[i + 2]) / 3;
      const ink = src[i + 3] > 12 && bright > 18;
      dst[i] = ink ? 255 : 0;
      dst[i + 1] = ink ? 255 : 0;
      dst[i + 2] = ink ? 255 : 0;
      dst[i + 3] = 255;
    }
    this.maskCtx.putImageData(maskImage, 0, 0);

    const cropW = bbox.maxX - bbox.minX + 1;
    const cropH = bbox.maxY - bbox.minY + 1;
    const scale = Math.min(this.innerSize / cropW, this.innerSize / cropH);
    const dstW = Math.max(1, Math.round(cropW * scale));
    const dstH = Math.max(1, Math.round(cropH * scale));
    const dstX = Math.round((this.size - dstW) / 2);
    const dstY = Math.round((this.size - dstH) / 2);

    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    this.ctx.drawImage(this.mask, bbox.minX, bbox.minY, cropW, cropH, dstX, dstY, dstW, dstH);
  }
}
