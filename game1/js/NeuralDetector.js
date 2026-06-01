/**
 * NeuralDetector
 * Нейросетевой распознаватель глифов на TensorFlow.js. Распознаёт
 * отдельные штрихи схемы и хранит модель/примеры прямо в браузере.
 */
import { ImageProcessor } from './ImageProcessor.js?v=20260602a';

// v3 — распознавание по «кляксам» (связным группам штрихов), изображение 64×64.
// Хранилище отделено от v2 (28×28): старая модель/датасет несовместимы по размеру.
const MODEL_URL = 'indexeddb://witch-glyph-canvas-model-v3';
const DATASET_KEY = 'witch-glyph-canvas-dataset-v3';

export class NeuralDetector {
  constructor() {
    this.processor = new ImageProcessor();
    this.size = this.processor.size;        // сторона нормализованного изображения (64)
    this.area = this.size * this.size;      // длина вектора одного примера (4096)
    this.clusterGap = 16;                   // макс. зазор (px, в координатах холста), при котором штрихи считаются одной кляксой
    this.model = null;
    this.ready = false;
    this.dataset = [];
    this.labels = ['circle', 'wave', 'zigzag', 'spiral', 'triangle', 'square', 'star', 'arrow', 'dot', 'branch'];
    this.labelNames = {
      circle: 'круг',
      wave: 'волна·вода',
      zigzag: 'зигзаг·огонь',
      spiral: 'спираль·ветер',
      triangle: 'треуг.·земля',
      square: 'квадрат·барьер',
      star: 'звезда·свет',
      arrow: 'стрелка',
      dot: 'точка',
      branch: 'ветвь·растение'
    };
  }

  buildModel() {
    this._ensureTf();
    const model = tf.sequential();
    // Вход 64×64×1 → три блока conv+pool (64→32→16→8), затем плотные слои.
    model.add(tf.layers.conv2d({ filters: 16, kernelSize: 3, activation: 'relu', padding: 'same', inputShape: [this.size, this.size, 1] }));
    model.add(tf.layers.maxPooling2d({ poolSize: 2 }));
    model.add(tf.layers.conv2d({ filters: 32, kernelSize: 3, activation: 'relu', padding: 'same' }));
    model.add(tf.layers.maxPooling2d({ poolSize: 2 }));
    model.add(tf.layers.conv2d({ filters: 48, kernelSize: 3, activation: 'relu', padding: 'same' }));
    model.add(tf.layers.maxPooling2d({ poolSize: 2 }));
    model.add(tf.layers.flatten());
    model.add(tf.layers.dropout({ rate: 0.3 }));
    model.add(tf.layers.dense({ units: 96, activation: 'relu' }));
    model.add(tf.layers.dense({ units: this.labels.length, activation: 'softmax' }));
    this._compile(model);
    this.model = model;
    return model;
  }

  addExample(canvas, labelName) {
    const label = this.labels.indexOf(labelName);
    if (label === -1) throw new Error(`Неизвестный класс глифа: ${labelName}`);

    const { tensor, empty } = this.processor.process(canvas);
    if (empty) {
      tensor.dispose();
      return false;
    }

    const data = tensor.dataSync();
    this.dataset.push({ data: new Float32Array(data), label });
    tensor.dispose();
    return true;
  }

  getStats() {
    const stats = Object.fromEntries(this.labels.map(label => [label, 0]));
    for (const item of this.dataset) {
      const label = this.labels[item.label];
      if (label) stats[label]++;
    }
    return stats;
  }

  clearDataset() {
    this.dataset = [];
    localStorage.removeItem(DATASET_KEY);
  }

  async train(onProgress, epochs = 30) {
    this._ensureTf();
    this._validateDatasetForTraining();

    const shuffled = this._shuffle([...this.dataset]);
    const n = shuffled.length;
    const flat = new Float32Array(n * this.area);
    const labelIds = new Int32Array(n);

    shuffled.forEach((item, index) => {
      flat.set(item.data, index * this.area);
      labelIds[index] = item.label;
    });

    if (this.model) this.model.dispose();
    this.buildModel();

    const xs = tf.tensor4d(flat, [n, this.size, this.size, 1]);
    const labelTensor = tf.tensor1d(labelIds, 'int32');
    const ys = tf.oneHot(labelTensor, this.labels.length);

    try {
      await this.model.fit(xs, ys, {
        epochs,
        batchSize: Math.min(16, n),
        validationSplit: 0.15,
        shuffle: true,
        callbacks: {
          onEpochEnd: async (epoch, logs) => {
            if (onProgress) onProgress(epoch + 1, epochs, logs || {});
            await tf.nextFrame();
          }
        }
      });
      this.ready = true;
    } finally {
      xs.dispose();
      ys.dispose();
      labelTensor.dispose();
    }
  }

  async predict(canvas) {
    if (!this.ready || !this.model) return null;

    const { tensor, empty } = this.processor.process(canvas);
    if (empty) {
      tensor.dispose();
      return null;
    }

    const prediction = this.model.predict(tensor);
    const probs = Array.from(await prediction.data());
    tensor.dispose();
    prediction.dispose();

    return this._formatPrediction(probs);
  }

  /**
   * Группирует штрихи в «кляксы»: штрихи, чьи линии соприкасаются или почти
   * соприкасаются (зазор ≤ clusterGap), относятся к одному глифу. Так квадрат
   * из 4 отдельных линий собирается в одну группу и распознаётся как квадрат.
   */
  clusterStrokes(strokes, gap = this.clusterGap) {
    const n = strokes.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const union = (a, b) => { parent[find(a)] = find(b); };

    const bboxes = strokes.map(s => this._strokeBBox(s));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (find(i) === find(j)) continue;
        if (!this._bboxNear(bboxes[i], bboxes[j], gap)) continue;
        if (this._strokesClose(strokes[i], strokes[j], gap)) union(i, j);
      }
    }

    const groups = new Map();
    for (let i = 0; i < n; i++) {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(strokes[i]);
    }
    return [...groups.values()];
  }

  _bboxNear(a, b, gap) {
    return a.minX - gap <= b.maxX && a.maxX + gap >= b.minX &&
           a.minY - gap <= b.maxY && a.maxY + gap >= b.minY;
  }

  _strokesClose(a, b, gap) {
    const pa = a.points || [], pb = b.points || [];
    if (!pa.length || !pb.length) return false;
    const g2 = gap * gap;
    const stepA = Math.max(1, Math.floor(pa.length / 48));
    const stepB = Math.max(1, Math.floor(pb.length / 48));
    for (let i = 0; i < pa.length; i += stepA) {
      for (let j = 0; j < pb.length; j += stepB) {
        const dx = pa[i].x - pb[j].x;
        const dy = pa[i].y - pb[j].y;
        if (dx * dx + dy * dy <= g2) return true;
      }
    }
    return false;
  }

  /**
   * Главный вход распознавания. Берёт ВЕСЬ набор штрихов холста, группирует их
   * в кляксы, нормализует каждую в изображение 64×64 и подаёт в сеть. Возвращает
   * один или несколько найденных глифов с их позициями/направлением — поэтому
   * круг активации, стрелки, площадь, счётчики и комбинации продолжают работать.
   */
  async analyzeStrokes(strokes, canvasSize = 520) {
    if (!this.ready || !this.model || !strokes.length) return null;

    const clusters = this.clusterStrokes(strokes);
    const glyphs = [];

    for (const cluster of clusters) {
      const { tensor, empty } = this.processor.processStrokeGroup(cluster, canvasSize);
      if (empty) { tensor.dispose(); continue; }

      const prediction = this.model.predict(tensor);
      const probs = Array.from(await prediction.data());
      tensor.dispose();
      prediction.dispose();

      glyphs.push(this._glyphFromCluster(cluster, this._formatPrediction(probs)));
      await tf.nextFrame();
    }

    const circles = glyphs.filter(g => g.type === 'circle');
    const activationCircle = circles.length
      ? circles.reduce((a, b) => (a.radius > b.radius ? a : b))
      : null;
    const quality = this._evaluateNeuralQuality(strokes, glyphs, activationCircle, canvasSize);

    return {
      glyphs,
      activationCircle,
      quality,
      neural: {
        strokes: glyphs.map(g => ({
          type: g.type,
          name: g.name,
          confidence: g.score,
          all: g.all
        }))
      }
    };
  }

  async saveToBrowser() {
    if (!this.model) throw new Error('Модель ещё не создана.');
    await this.model.save(MODEL_URL);
  }

  async loadFromBrowser() {
    this._ensureTf();
    try {
      if (this.model) this.model.dispose();
      this.model = await tf.loadLayersModel(MODEL_URL);
      this._compile(this.model);
      this.ready = true;
      return true;
    } catch (error) {
      console.info('Нейросетевая модель пока не сохранена в браузере.', error);
      this.ready = false;
      return false;
    }
  }

  async downloadModel() {
    if (!this.model) throw new Error('Модель ещё не создана.');
    await this.model.save('downloads://witch-glyph-model');
  }

  async loadFromUrl(url = './model/witch-glyph-model.json') {
    this._ensureTf();
    if (this.model) this.model.dispose();
    this.model = await tf.loadLayersModel(url);
    this._compile(this.model);
    this.ready = true;
    return true;
  }

  saveDataset() {
    const plain = this.dataset.map(item => ({
      label: item.label,
      data: Array.from(item.data)
    }));
    localStorage.setItem(DATASET_KEY, JSON.stringify(plain));
  }

  loadDataset() {
    try {
      const raw = localStorage.getItem(DATASET_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      this.dataset = parsed
        .filter(item => Number.isInteger(item.label) && Array.isArray(item.data) && item.data.length === this.area)
        .map(item => ({ label: item.label, data: new Float32Array(item.data) }));
      return true;
    } catch (error) {
      console.warn('Не удалось загрузить примеры нейросети.', error);
      this.dataset = [];
      return false;
    }
  }



  _validateDatasetForTraining() {
    const stats = this.getStats();
    const trainedLabels = Object.entries(stats).filter(([, count]) => count >= 3);
    if (trainedLabels.length < 2) {
      throw new Error('Для обучения нужны минимум 2 разных знака и хотя бы по 3 примера каждого. Рисуй один знак без круга, добавляй пример, затем обучай модель.');
    }
  }

  /**
   * Строит глиф из кляксы (группы штрихов): объединённый bbox/центр/радиус,
   * направление по самому длинному штриху (для стрелок), зазор замыкания.
   */
  _glyphFromCluster(cluster, prediction) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let longest = cluster[0];
    let longestLen = -1;

    for (const s of cluster) {
      const bb = this._strokeBBox(s);
      if (bb.minX < minX) minX = bb.minX;
      if (bb.minY < minY) minY = bb.minY;
      if (bb.maxX > maxX) maxX = bb.maxX;
      if (bb.maxY > maxY) maxY = bb.maxY;
      const len = s.length || (s.points ? s.points.length : 0);
      if (len > longestLen) { longestLen = len; longest = s; }
    }

    const bbox = { minX, minY, maxX, maxY };
    const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    const type = prediction.confidence >= 0.35 ? prediction.type : 'unknown';

    const points = longest.points || [];
    const first = points[0] || center;
    const last = points[points.length - 1] || center;
    const dir = { x: last.x - first.x, y: last.y - first.y };
    const dirLen = Math.hypot(dir.x, dir.y) || 1;
    dir.x /= dirLen;
    dir.y /= dirLen;

    return {
      type,
      name: type === 'unknown' ? 'знак?' : prediction.name,
      stroke: longest,
      strokes: cluster,
      center,
      bbox,
      score: prediction.confidence,
      radius: Math.max(maxX - minX, maxY - minY) / 2,
      dir,
      closureGap: Math.hypot(last.x - first.x, last.y - first.y),
      all: prediction.all
    };
  }

  _evaluateNeuralQuality(strokes, glyphs, circle, canvasSize) {
    const q = {
      closureScore: 0,
      smoothnessScore: 0.75,
      symmetryScore: circle ? Math.max(0.35, circle.score) : 0.4,
      centerednessScore: 0.55,
      inkAmount: strokes.reduce((sum, stroke) => sum + (stroke.length || 0), 0),
      strokeOrderScore: 1,
      overloadPenalty: Math.max(0, Math.min(0.4, (strokes.length - 8) * 0.06)),
      gapPenalty: 0,
      intersectionPenalty: 0,
      circleSizeRatio: 0,
      hasCircle: !!circle
    };

    if (circle) {
      const circumference = 2 * Math.PI * (circle.radius || 1);
      q.closureScore = Math.max(0, 1 - (circle.closureGap / (circumference * 0.25 || 1)));
      q.gapPenalty = circle.closureGap > 14 ? Math.min(0.5, circle.closureGap / 100) : 0;
      q.circleSizeRatio = circle.radius / (canvasSize / 2);

      const circleIndex = strokes.indexOf(circle.stroke);
      if (circleIndex === 0 && strokes.length > 1) {
        q.strokeOrderScore = 0.45;
        q.earlyActivation = true;
      } else if (circleIndex !== strokes.length - 1) {
        q.strokeOrderScore = 0.75;
      }

      const inner = glyphs.filter(g => g !== circle && g.type !== 'circle' && g.type !== 'unknown');
      if (inner.length) {
        const totalOffset = inner.reduce((sum, g) => {
          return sum + Math.hypot(g.center.x - circle.center.x, g.center.y - circle.center.y) / (circle.radius || 1);
        }, 0);
        q.centerednessScore = Math.max(0, 1 - totalOffset / inner.length);
      }
    }

    const smoothValues = strokes
      .filter(stroke => stroke.points?.length > 2 && stroke.length)
      .map(stroke => this._strokeSmoothness(stroke));
    if (smoothValues.length) {
      q.smoothnessScore = smoothValues.reduce((sum, value) => sum + value, 0) / smoothValues.length;
    }

    return q;
  }

  _strokeBBox(stroke) {
    if (stroke.bbox && Number.isFinite(stroke.bbox.minX)) return stroke.bbox;
    const points = stroke.points || [];
    if (!points.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    return points.reduce((bbox, point) => ({
      minX: Math.min(bbox.minX, point.x),
      minY: Math.min(bbox.minY, point.y),
      maxX: Math.max(bbox.maxX, point.x),
      maxY: Math.max(bbox.maxY, point.y)
    }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  }

  _strokeSmoothness(stroke) {
    const points = stroke.points || [];
    let turns = 0;
    for (let i = 2; i < points.length; i++) {
      const a = points[i - 2], b = points[i - 1], c = points[i];
      const v1x = b.x - a.x, v1y = b.y - a.y;
      const v2x = c.x - b.x, v2y = c.y - b.y;
      const m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y);
      if (m1 < 2 || m2 < 2) continue;
      const dot = (v1x * v2x + v1y * v2y) / (m1 * m2);
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      if (angle > 1.2) turns++;
    }
    return Math.max(0, 1 - Math.min(1, turns / ((stroke.length || 1) / 30)));
  }

  _compile(model) {
    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    });
  }

  _formatPrediction(probs) {
    let bestIndex = 0;
    for (let i = 1; i < probs.length; i++) {
      if (probs[i] > probs[bestIndex]) bestIndex = i;
    }

    const all = probs
      .map((confidence, index) => ({
        type: this.labels[index],
        name: this.labelNames[this.labels[index]],
        confidence
      }))
      .sort((a, b) => b.confidence - a.confidence);

    const type = this.labels[bestIndex];
    return {
      type,
      name: this.labelNames[type],
      confidence: probs[bestIndex],
      all
    };
  }

  _shuffle(items) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  _ensureTf() {
    if (typeof tf === 'undefined') {
      throw new Error('TensorFlow.js не загружен. Проверь подключение CDN-скрипта.');
    }
  }
}
