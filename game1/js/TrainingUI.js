/**
 * TrainingUI
 * Модальное окно для сбора пользовательских примеров и обучения CNN-модели.
 */
export class TrainingUI {
  constructor(neuralDetector, drawCanvas, onClearCanvas) {
    this.neural = neuralDetector;
    this.drawCanvas = drawCanvas;
    this.onClearCanvas = onClearCanvas || (() => {});
    this.modal = null;
  }

  open() {
    if (!this.modal) this._createModal();
    this.modal.classList.remove('hidden');
    this.refresh();
  }

  close() {
    if (this.modal) this.modal.classList.add('hidden');
  }

  refresh() {
    if (!this.modal) return;
    const statsEl = this.modal.querySelector('#trainStats');
    const stats = this.neural.getStats();
    const total = Object.values(stats).reduce((sum, count) => sum + count, 0);

    const rows = this.neural.labels.map(label => {
      const count = stats[label] || 0;
      const state = count >= 8 ? '✓' : (count > 0 ? '◐' : '○');
      const color = count >= 8 ? 'var(--plant)' : (count > 0 ? 'var(--light)' : 'var(--text-dim)');
      return `
        <div style="display:flex;justify-content:space-between;gap:12px;padding:4px 0;border-bottom:1px dashed rgba(255,255,255,.08)">
          <span style="color:${color}">${state} ${this.neural.labelNames[label]}</span>
          <strong>${count}</strong>
        </div>`;
    }).join('');

    statsEl.innerHTML = `
      <div style="margin-bottom:8px;color:var(--text)">Всего примеров: <strong>${total}</strong></div>
      ${rows}
      <p class="muted" style="margin-top:10px">Совет: рисуй примеры по одному знаку без круга. Минимум для обучения — 2 разных знака и по 3 примера каждого, лучше 8–10.</p>
    `;
  }

  _createModal() {
    this.modal = document.createElement('div');
    this.modal.id = 'trainingModal';
    this.modal.className = 'modal hidden';
    this.modal.innerHTML = `
      <div class="modal-content" style="border-color:var(--accent);box-shadow:0 0 42px rgba(164,143,255,.3), var(--shadow)">
        <button class="modal-close" data-close title="Закрыть">✕</button>
        <h2>🧠 Обучение нейросети</h2>
        <p class="muted">Для обучения рисуй только один знак без круга активации: например одну волну для воды или одну стрелку. Круг, волну и стрелки ИИ потом распознаёт по отдельным штрихам в общей схеме.</p>

        <div style="display:grid;grid-template-columns:minmax(180px,1fr) auto;gap:10px;align-items:end;margin:16px 0;padding:12px;background:var(--bg-3);border:1px solid var(--line);border-radius:12px">
          <label style="display:flex;flex-direction:column;gap:6px;color:var(--text-dim)">
            Тип глифа
            <select id="trainLabel" style="background:var(--bg-2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:9px;font-family:inherit"></select>
          </label>
          <button id="trainAdd" class="primary">➕ Добавить пример</button>
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">
          <button id="trainStart" class="primary">⚡ Обучить модель</button>
          <button id="trainSave" style="background:var(--bg-3);color:var(--text);border:1px solid var(--line);padding:10px 14px;border-radius:8px;font-family:inherit;cursor:pointer">💾 Сохранить</button>
          <button id="trainDownload" style="background:var(--bg-3);color:var(--text);border:1px solid var(--line);padding:10px 14px;border-radius:8px;font-family:inherit;cursor:pointer">⬇ Скачать файлы</button>
          <button id="trainClearData" style="background:rgba(255,58,106,.12);color:var(--risk-forbidden);border:1px solid var(--risk-forbidden);padding:10px 14px;border-radius:8px;font-family:inherit;cursor:pointer">🗑 Очистить</button>
        </div>

        <div id="trainProgress" style="margin:12px 0"></div>
        <div id="trainMsg" style="min-height:24px;margin:8px 0;color:var(--text-dim)"></div>
        <div id="trainStats" style="background:rgba(0,0,0,.18);border:1px solid var(--line);border-radius:12px;padding:12px"></div>
      </div>`;

    document.body.appendChild(this.modal);

    const select = this.modal.querySelector('#trainLabel');
    select.innerHTML = this.neural.labels
      .map(label => `<option value="${label}">${this.neural.labelNames[label]}</option>`)
      .join('');

    this.modal.querySelector('[data-close]').onclick = () => this.close();
    this.modal.addEventListener('click', event => {
      if (event.target === this.modal) this.close();
    });
    this.modal.querySelector('#trainAdd').onclick = () => this._addExample();
    this.modal.querySelector('#trainStart').onclick = () => this._train();
    this.modal.querySelector('#trainSave').onclick = async () => this._save();
    this.modal.querySelector('#trainDownload').onclick = async () => this._download();
    this.modal.querySelector('#trainClearData').onclick = () => this._clearData();
  }

  _addExample() {
    try {
      const label = this.modal.querySelector('#trainLabel').value;
      const added = this.neural.addExample(this.drawCanvas, label);
      if (!added) {
        this._msg('Сначала нарисуй глиф на холсте.', 'warn');
        return;
      }
      this.neural.saveDataset();
      this._msg(`Пример «${this.neural.labelNames[label]}» добавлен.`, 'ok');
      this.onClearCanvas();
      this.refresh();
    } catch (error) {
      this._msg(error.message, 'warn');
    }
  }

  async _train() {
    const progressEl = this.modal.querySelector('#trainProgress');
    progressEl.innerHTML = `
      <div class="bar" style="grid-template-columns:100px 1fr 64px">
        <span class="bar-label">Эпохи</span>
        <div class="bar-track"><div class="bar-fill fill-stability" style="width:0%"></div></div>
        <span id="trainPct">0%</span>
      </div>
      <div id="trainMetrics" class="muted">Ожидание начала обучения…</div>`;

    const fill = progressEl.querySelector('.bar-fill');
    const pct = progressEl.querySelector('#trainPct');
    const metrics = progressEl.querySelector('#trainMetrics');

    try {
      this._msg('Нейросеть учится на отдельных знаках без круга…', 'ok');
      await this.neural.train((epoch, epochs, logs) => {
        const progress = Math.round((epoch / epochs) * 100);
        const acc = this._percent(logs.acc ?? logs.accuracy);
        const valAcc = this._percent(logs.val_acc ?? logs.val_accuracy);
        fill.style.width = `${progress}%`;
        pct.textContent = `${progress}%`;
        metrics.textContent = `Эпоха ${epoch}/${epochs} · точность: ${acc} · проверка: ${valAcc}`;
      });
      await this.neural.saveToBrowser();
      this.neural.saveDataset();
      this._msg('Готово! Модель обучена и сохранена в браузере.', 'ok');
      document.dispatchEvent(new CustomEvent('witch-neural-status-changed'));
    } catch (error) {
      this._msg(error.message, 'warn');
    }
  }

  async _save() {
    try {
      if (this.neural.model) await this.neural.saveToBrowser();
      this.neural.saveDataset();
      this._msg('Данные обучения сохранены.', 'ok');
      document.dispatchEvent(new CustomEvent('witch-neural-status-changed'));
    } catch (error) {
      this._msg(error.message, 'warn');
    }
  }

  async _download() {
    try {
      await this.neural.downloadModel();
      this.neural.saveDataset();
      this._msg('Файлы модели скачиваются. Примеры сохранены в браузере.', 'ok');
    } catch (error) {
      this._msg(error.message, 'warn');
    }
  }

  _clearData() {
    if (!confirm('Удалить все собранные примеры нейросети? Модель в IndexedDB останется до следующего обучения.')) return;
    this.neural.clearDataset();
    this.refresh();
    this._msg('Примеры очищены.', 'warn');
  }

  _msg(text, type = 'ok') {
    const msg = this.modal.querySelector('#trainMsg');
    msg.textContent = text;
    msg.style.color = type === 'ok' ? 'var(--plant)' : 'var(--risk-forbidden)';
  }

  _percent(value) {
    return Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—';
  }
}
