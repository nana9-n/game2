/**
 * NeuralDetector
 * Нейросетевой распознаватель глифов на TensorFlow.js. Работает рядом с
 * эвристическим MagicRecognizer и хранит модель/примеры прямо в браузере.
 */
import { ImageProcessor } from './ImageProcessor.js';

const MODEL_URL = 'indexeddb://witch-glyph-model';
const DATASET_KEY = 'witch-glyph-dataset';

export class NeuralDetector {
  constructor() {
    this.processor = new ImageProcessor();
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
    model.add(tf.layers.conv2d({ filters: 16, kernelSize: 3, activation: 'relu', padding: 'same', inputShape: [28, 28, 1] }));
    model.add(tf.layers.maxPooling2d({ poolSize: 2 }));
    model.add(tf.layers.conv2d({ filters: 32, kernelSize: 3, activation: 'relu', padding: 'same' }));
    model.add(tf.layers.maxPooling2d({ poolSize: 2 }));
    model.add(tf.layers.flatten());
    model.add(tf.layers.dropout({ rate: 0.25 }));
    model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
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
    const minExamples = this.labels.length * 3;
    if (this.dataset.length < minExamples) {
      throw new Error(`Нужно минимум ${minExamples} примеров (по 3 на каждый класс). Сейчас: ${this.dataset.length}.`);
    }

    const shuffled = this._shuffle([...this.dataset]);
    const n = shuffled.length;
    const flat = new Float32Array(n * 28 * 28);
    const labelIds = new Int32Array(n);

    shuffled.forEach((item, index) => {
      flat.set(item.data, index * 28 * 28);
      labelIds[index] = item.label;
    });

    if (this.model) this.model.dispose();
    this.buildModel();

    const xs = tf.tensor4d(flat, [n, 28, 28, 1]);
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

  async predictStrokes(strokes) {
    if (!this.ready || !this.model) return [];
    const results = [];
    for (const stroke of strokes) {
      const { tensor, empty } = this.processor.processStroke(stroke.points || []);
      if (empty) {
        tensor.dispose();
        results.push(null);
        continue;
      }
      const prediction = this.model.predict(tensor);
      const probs = Array.from(await prediction.data());
      tensor.dispose();
      prediction.dispose();
      results.push(this._formatPrediction(probs));
      await tf.nextFrame();
    }
    return results;
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
        .filter(item => Number.isInteger(item.label) && Array.isArray(item.data) && item.data.length === 28 * 28)
        .map(item => ({ label: item.label, data: new Float32Array(item.data) }));
      return true;
    } catch (error) {
      console.warn('Не удалось загрузить примеры нейросети.', error);
      this.dataset = [];
      return false;
    }
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
