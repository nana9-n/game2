/**
 * UIController
 * Связывает всё вместе: рисование → распознавание → компиляция → эффект → UI.
 * Управляет режимами, панелью анализа, книгой, испытаниями, обучением.
 */
import { StrokeRecorder } from './StrokeRecorder.js?v=20260602a';
import { SpellCompiler } from './SpellCompiler.js?v=20260602a';
import { EffectEngine } from './EffectEngine.js?v=20260602a';
import { Spellbook } from './Spellbook.js?v=20260602a';
import { TutorialManager } from './TutorialManager.js?v=20260602a';
import { NeuralDetector } from './NeuralDetector.js?v=20260602a';
import { TrainingUI } from './TrainingUI.js?v=20260602a';
import { LevelManager } from './LevelManager.js?v=20260602a';

export class UIController {
  constructor() {
    this.drawCanvas = document.getElementById('drawCanvas');
    this.overlay = document.getElementById('overlayCanvas');
    this.overlayCtx = this.overlay.getContext('2d');
    this.sceneCanvas = document.getElementById('sceneCanvas');

    this.recorder = new StrokeRecorder(
      this.drawCanvas,
      () => this._onDraw(),
      () => this._onStrokeEnd()
    );
    this.engine = new EffectEngine(this.sceneCanvas);
    this.spellbook = new Spellbook();
    this.tutorial = new TutorialManager();
    this.levels = new LevelManager();
    this.neural = new NeuralDetector();
    this.neuralEnabled = true;
    this._initNeural();
    this.trainingUI = new TrainingUI(this.neural, this.drawCanvas, () => {
      this.recorder.clear();
      this._drawActivationGuide();
    });

    this.mode = 'sandbox';
    this.autoActivate = false;
    this.gameWon = false;
    this.lastReport = null;

    this.engine.onSpellHit = (spell, point, area, effect) => this._handleSpellHit(spell, point, area, effect);

    this._bindUI();
    this._drawActivationGuide();
    this._updateModeUI();
  }


  // ---------- Нейросетевой слой ----------

  async _initNeural() {
    try {
      this.neural.loadDataset();
      await this.neural.loadFromBrowser();
    } catch (error) {
      console.warn('Не удалось инициализировать нейросеть.', error);
    } finally {
      this._updateNeuralStatus();
    }
  }

  _updateNeuralStatus() {
    const badge = document.getElementById('nnStatus');
    if (!badge) return;
    if (this.neural.ready) {
      badge.textContent = '🧠 ИИ активен';
      badge.style.opacity = '1';
    } else {
      badge.textContent = '🧠 ИИ не обучен';
      badge.style.opacity = '.5';
    }
  }

  // ---------- Привязка интерфейса ----------

  _bindUI() {
    document.getElementById('btnUndo').onclick = () => this._undoStroke();
    document.getElementById('btnRedo').onclick = () => this._redoStroke();
    document.getElementById('btnCircle').onclick = () => this._drawCircle();
    document.getElementById('btnClear').onclick = () => this._clearDrawing();
    document.getElementById('btnCast').onclick = () => this._castSpell();

    document.addEventListener('keydown', event => this._handleHotkeys(event));

    const trainButton = document.getElementById('btnTrainNN');
    if (trainButton) trainButton.onclick = () => this.trainingUI.open();

    document.addEventListener('witch-neural-status-changed', () => this._updateNeuralStatus());

    const toggle = document.getElementById('toggleAuto');
    toggle.onchange = e => { this.autoActivate = e.target.checked; };

    // Режимы
    document.querySelectorAll('.mode-switch button').forEach(btn => {
      btn.onclick = () => this._switchMode(btn.dataset.mode);
    });

    // Закрытие модалок — закрывает ту модалку, в которой нажата кнопка
    document.querySelectorAll('[data-close]').forEach(el => {
      el.onclick = () => el.closest('.modal')?.classList.add('hidden');
    });

    document.getElementById('btnLevelReset')?.addEventListener('click', () => this._resetLevel());
    document.getElementById('btnLevelHints')?.addEventListener('click', () => this._openHints());
    document.getElementById('btnLevelMap')?.addEventListener('click', () => this._toggleLevelMap());
    document.getElementById('btnNextLevel')?.addEventListener('click', () => this._nextLevel());
  }

  _handleHotkeys(event) {
    const key = event.key.toLowerCase();
    const target = event.target;
    const isTyping = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
    if (isTyping) return;

    if ((event.ctrlKey || event.metaKey) && key === 'z' && !event.shiftKey) {
      event.preventDefault();
      this._undoStroke();
    } else if (((event.ctrlKey || event.metaKey) && key === 'y') || ((event.ctrlKey || event.metaKey) && event.shiftKey && key === 'z')) {
      event.preventDefault();
      this._redoStroke();
    } else if ((event.ctrlKey || event.metaKey) && key === 'enter') {
      event.preventDefault();
      this._castSpell();
    } else if ((event.ctrlKey || event.metaKey) && (key === 'backspace' || key === 'delete')) {
      event.preventDefault();
      this._clearDrawing();
    }
  }

  _undoStroke() {
    this.recorder.undo();
    this._onDraw();
  }

  _redoStroke() {
    this.recorder.redo();
    this._onDraw();
  }

  _clearDrawing() {
    this.recorder.clear();
    this._clearAnalysis();
    this._drawActivationGuide();
  }

  _handleHotkeys(event) {
    const key = event.key.toLowerCase();
    const target = event.target;
    const isTyping = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
    if (isTyping) return;

    if ((event.ctrlKey || event.metaKey) && key === 'z' && !event.shiftKey) {
      event.preventDefault();
      this._undoStroke();
    } else if (((event.ctrlKey || event.metaKey) && key === 'y') || ((event.ctrlKey || event.metaKey) && event.shiftKey && key === 'z')) {
      event.preventDefault();
      this._redoStroke();
    } else if ((event.ctrlKey || event.metaKey) && key === 'enter') {
      event.preventDefault();
      this._castSpell();
    } else if ((event.ctrlKey || event.metaKey) && (key === 'backspace' || key === 'delete')) {
      event.preventDefault();
      this._clearDrawing();
    }
  }

  _undoStroke() {
    this.recorder.undo();
    this._onDraw();
  }

  _redoStroke() {
    this.recorder.redo();
    this._onDraw();
  }

  _clearDrawing() {
    this.recorder.clear();
    this._clearAnalysis();
    this._drawActivationGuide();
  }

  /**
   * Рисует ровный замкнутый круг активации по направляющей и анализирует схему.
   */
  _drawCircle() {
    const cx = this.drawCanvas.width / 2;
    const cy = this.drawCanvas.height / 2;
    const r = 180; // совпадает с полупрозрачной направляющей
    const steps = 72;
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2 - Math.PI / 2;
      points.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    this.recorder.addStrokeFromPoints(points);
    this._onStrokeEnd();
  }

  _switchMode(mode) {
    if (mode === 'book') {
      this._openBook();
      return;
    }
    this.mode = mode;
    document.querySelectorAll('.mode-switch button').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === mode));
    this.recorder.clear();
    this._clearAnalysis();
    this._drawActivationGuide();
    this._updateModeUI();
  }

  _updateModeUI() {
    const hint = document.getElementById('trialHint');
    if (this.mode === 'tutorial') {
      this._exitGameMode();
      this.tutorial.reset();
      hint.textContent = this.tutorial.getHint();
    } else if (this.mode === 'trial') {
      this._enterGameMode();
    } else {
      this._exitGameMode();
      hint.textContent = 'Свободная мастерская: рисуй любые схемы. Удачные сохраняй в Книгу.';
    }
  }

  // ---------- Подсказка-направляющая (полупрозрачный круг) ----------

  _drawActivationGuide() {
    const ctx = this.overlayCtx;
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    ctx.save();
    ctx.strokeStyle = 'rgba(120,86,40,0.28)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.arc(260, 260, 180, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ---------- События рисования ----------

  _onDraw() {
    // Во время рисования полное распознавание не запускаем — оно тяжёлое
    // (кластеризация штрихов + инференс по каждой кляксе). Распознавание
    // всего холста выполняется по завершении штриха / замыкании круга
    // в _onStrokeEnd. Здесь только лёгкая подсказка-состояние.
    const liveEl = document.getElementById('analysisLive');
    if (liveEl && this.recorder.strokes.length) {
      liveEl.innerHTML = '<p class="muted">✍️ Рисуем… Замкни круг — и схема распознается целиком.</p>';
    }
  }

  async _onStrokeEnd() {
    await this._analyze(false);
    const report = this.lastReport;

    // Автоактивация по замыканию круга (канонический режим)
    if (this.autoActivate && report && report.activationCircle &&
        report.quality.closureScore > 0.65) {
      // Круг замкнут — активируем
      setTimeout(() => this._castSpell(), 200);
    }

    // Обучение
    if (this.mode === 'tutorial' && report) {
      const res = this.tutorial.evaluate(report);
      const hint = document.getElementById('trialHint');
      if (res.advanced) {
        hint.textContent = res.message + '\n\n' + this.tutorial.getHint();
      }
    }
  }

  async _analyze(live) {
    const strokes = this.recorder.strokes;
    if (!strokes.length) { this._clearAnalysis(); return; }

    const liveEl = document.getElementById('analysisLive');
    if (!this.neuralEnabled || !this.neural.ready) {
      this.lastReport = null;
      liveEl.innerHTML = '<p class="muted">🧠 Сначала обучи нейросеть: рисуй отдельные знаки без круга и добавляй примеры.</p>';
      return;
    }

    let report = null;
    try {
      report = await this.neural.analyzeStrokes(strokes, this.drawCanvas.width);
    } catch (error) {
      console.warn('Нейросетевое распознавание штрихов не удалось.', error);
      liveEl.innerHTML = '<p class="muted">ИИ не смог распознать штрихи. Попробуй ещё раз или дообучи модель.</p>';
      return;
    }

    if (!report) {
      this.lastReport = null;
      liveEl.innerHTML = '<p class="muted">ИИ пока не готов к распознаванию.</p>';
      return;
    }

    this.lastReport = report;

    // Обновляем индикатор чернил
    const ink = report.quality.inkAmount;
    const inkPercent = Math.max(0, 100 - Math.min(100, ink / 40));
    document.getElementById('inkFill').style.width = inkPercent + '%';

    // Панель распознавания теперь показывает только TensorFlow.js-предсказания
    // по отдельным штрихам, чтобы круг не смешивался со знаком внутри.
    const tags = report.glyphs.map(g => {
      const confidence = Number.isFinite(g.score) ? ` ${Math.round(g.score * 100)}%` : '';
      return `<span class="glyph-tag">${this._glyphLabel(g.type)}${confidence}</span>`;
    }).join('');
    const circleInfo = report.activationCircle
      ? `Круг: ИИ распознал отдельно · замкнутость ${Math.round(report.quality.closureScore * 100)}%`
      : 'Круг активации ИИ не распознал отдельным штрихом';
    const neuralInfo = !live
      ? '<div style="margin-top:6px;color:var(--accent)">🧠 Распознавание: TensorFlow.js по отдельным знакам</div>'
      : '';

    liveEl.innerHTML = `
      <div>${tags || '<span class="muted">ИИ анализирует отдельные штрихи…</span>'}</div>
      <div class="muted" style="margin-top:6px">${circleInfo}</div>
      ${neuralInfo}
    `;
  }

  // ---------- Активация заклинания ----------

  async _castSpell() {
    const strokes = this.recorder.strokes;
    if (!strokes.length) return;

    if (!this.neuralEnabled || !this.neural.ready) {
      document.getElementById('analysisLive').innerHTML =
        '<p class="muted">🧠 Заклинание не активировано: сначала обучи TensorFlow.js распознавать твои знаки.</p>';
      return;
    }

    const report = await this.neural.analyzeStrokes(strokes, this.drawCanvas.width);
    if (!report) return;
    this.lastReport = report;

    const target = this.mode === 'trial' ? { alive: false } : null;
    const spell = SpellCompiler.compile(report, { mode: this.mode, target });

    // Запускаем эффект
    this.engine.cast(spell);
    this._renderResult(spell, false);

    // Сохраняем удачные в книгу (стабильность > 50)
    if (spell.stability > 50 && spell.element !== 'unknown') {
      this.spellbook.add(strokes, spell);
    }

    if (this.mode === 'trial') this._updateGameHud();
  }


  // ---------- Игровой режим ----------

  _enterGameMode() {
    document.getElementById('gameHud')?.classList.remove('hidden');
    const level = this.levels.objects.length ? this.levels.currentLevel() : this.levels.loadSavedOrFirst();
    this.gameWon = false;
    this.engine.setGameObjects(this.levels.objects);
    this._showLevelMap(false);
    this._updateGameHud(level);
  }

  _exitGameMode() {
    document.getElementById('gameHud')?.classList.add('hidden');
    document.getElementById('hintModal')?.classList.add('hidden');
    this.engine.setGameObjects([]);
    this.gameWon = false;
  }

  _resetLevel() {
    if (this.mode !== 'trial') return;
    this.levels.reset();
    this.gameWon = false;
    this.engine.setGameObjects(this.levels.objects);
    document.getElementById('btnNextLevel')?.classList.add('hidden');
    this._showLevelMap(false);
    this._updateGameHud();
  }

  _nextLevel() {
    if (this.mode !== 'trial') return;
    if (!this.levels.isLastLevel() || this.gameWon) this.levels.nextLevel();
    this.gameWon = false;
    this.engine.setGameObjects(this.levels.objects);
    document.getElementById('btnNextLevel')?.classList.add('hidden');
    this._showLevelMap(false);
    this._updateGameHud();
    this.recorder.clear();
    this._clearAnalysis();
    this._drawActivationGuide();
  }

  _toggleLevelMap() {
    const map = document.getElementById('levelMap');
    this._showLevelMap(map?.classList.contains('hidden'));
  }

  /**
   * Отдельное окно подсказок: открывается кнопкой «Подсказки».
   * Здесь спрятаны все «нарисуй то-то» — чтобы игрок сначала думал сам.
   */
  _openHints() {
    if (this.mode !== 'trial') return;
    const level = this.levels.currentLevel();
    const content = document.getElementById('hintContent');
    if (!content) return;

    const steps = this.levels.getProgress().items;
    const stepList = steps.length > 1
      ? `<ul class="hint-steps">${steps.map(s => `<li>${s.label}</li>`).join('')}</ul>`
      : '';

    content.innerHTML = `
      <p class="hint-goal">🎯 ${level.description}</p>
      <p class="hint-text">${level.hint}</p>
      ${stepList}
    `;
    document.getElementById('hintModal')?.classList.remove('hidden');
  }

  _showLevelMap(show) {
    const map = document.getElementById('levelMap');
    if (!map) return;
    map.classList.toggle('hidden', !show);
    if (show) this._renderLevelMap();
  }

  _renderLevelMap() {
    const map = document.getElementById('levelMap');
    if (!map) return;
    map.innerHTML = this.levels.levels.map((level, index) => {
      const completed = this.levels.isCompleted(index);
      const unlocked = this.levels.isUnlocked(index);
      const active = index === this.levels.index;
      return `
        <button class="level-card ${active ? 'active' : ''} ${completed ? 'completed' : ''}" data-level="${index}" ${unlocked ? '' : 'disabled'}>
          <span>${index + 1}</span>
          <strong>${level.title}</strong>
          <small>${completed ? 'Пройден' : unlocked ? 'Доступен' : 'Закрыт'}</small>
        </button>`;
    }).join('');
    map.querySelectorAll('[data-level]').forEach(button => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.level);
        if (!this.levels.isUnlocked(index)) return;
        this.levels.loadLevel(index);
        this.gameWon = false;
        this.engine.setGameObjects(this.levels.objects);
        document.getElementById('btnNextLevel')?.classList.add('hidden');
        this._showLevelMap(false);
        this._updateGameHud();
      });
    });
  }

  _handleSpellHit(spell, point, area) {
    if (this.mode !== 'trial' || this.gameWon) return;

    const messages = [];
    for (const object of this.levels.objects) {
      const distance = Math.hypot(object.x - point.x, object.y - point.y);
      if (distance > area * 0.72 + object.radius) continue;
      const result = object.applySpell(spell);
      if (result.message) messages.push(result.message);
    }

    this._updateGameHud(this.levels.currentLevel(), false);
    if (messages.length) {
      document.getElementById('trialHint').textContent = messages.join('\n');
    } else {
      const level = this.levels.currentLevel();
      document.getElementById('trialHint').textContent = `Заклинание не попало в цель. ${level.description}`;
    }

    if (this.levels.checkWin()) this._completeLevel();
  }

  _completeLevel() {
    if (this.gameWon) return;
    this.gameWon = true;
    this.levels.completeCurrent();
    const level = this.levels.currentLevel();

    // Без всплывающего окна: просто разблокируем кнопку «Следующий уровень»
    // и показываем краткое сообщение в строке-подсказке сцены.
    document.getElementById('btnNextLevel')?.classList.toggle('hidden', this.levels.isLastLevel());
    document.getElementById('trialHint').textContent = this.levels.isLastLevel()
      ? `🏆 Финал пройден! ${level.reward}`
      : `✅ Уровень пройден! ${level.reward} Следующий уровень открыт.`;

    this._updateGameHud(level, false);
  }

  _updateGameHud(level = this.levels.currentLevel(), updateHint = true) {
    if (this.mode !== 'trial' || !level) return;
    const progress = this.levels.getProgress();
    const number = this.levels.index + 1;
    document.getElementById('levelTitle').textContent = `${number}. ${level.title}`;
    document.getElementById('levelGoal').textContent = `🎯 Цель: ${level.description}`;
    document.getElementById('levelProgressFill').style.width = `${progress.total}%`;
    if (updateHint) document.getElementById('trialHint').textContent = `${level.title}: ${level.description}`;

    const stars = document.getElementById('levelStars');
    if (stars) {
      stars.innerHTML = this.levels.levels.map((item, index) => {
        const done = this.levels.isCompleted(index);
        const active = index === this.levels.index;
        return `<span class="${done ? 'done' : ''} ${active ? 'active' : ''}">${index + 1}</span>`;
      }).join('');
    }

    const objectProgress = document.getElementById('objectProgress');
    if (objectProgress) {
      // Показываем только нейтральный прогресс без подсказки-решения
      objectProgress.innerHTML = progress.items.map(item => {
        const name = item.stepCount > 1
          ? `${item.objectLabel} · шаг ${item.stepIndex + 1}`
          : item.objectLabel;
        return `
        <div class="object-progress-row">
          <span>${name}</span>
          <div class="mini-track"><div style="width:${item.value}%"></div></div>
        </div>`;
      }).join('');
    }

    this._renderLevelMap();
  }

  // ---------- Отрисовка результата ----------

  // Вспомогательный метод: человекочитаемое имя элемента (используется в UI)
  _elementName(e) {
    return {
      water: 'Вода', fire: 'Огонь', wind: 'Ветер', earth: 'Земля',
      light: 'Свет', plant: 'Растение', bloom: 'Цветущие лозы',
      prism: 'Призматический луч', barrier: 'Барьер',
      mist: 'Туман/Пар', firestorm: 'Огненный вихрь', lightdome: 'Световой купол',
      mud: 'Грязь/Рост', lava: 'Магма', storm: 'Шторм',
      jungle: 'Буйные джунгли', volcano: 'Извержение', ice: 'Лёд', solar: 'Солнечный взрыв',
      aurora: 'Полярное сияние', sandstorm: 'Песчаная буря', ash: 'Пожар и пепел', thorns: 'Терновый щит',
      unknown: 'Неизвестно'
    }[e] || e;
  }

  _renderResult(spell, isWarning) {
    const el = document.getElementById('spellResult');

    // ── Многослойный заголовок ─────────────────────────────────────────
    let layersHTML = '';
    if (spell.layers && spell.layers.length > 0) {
      const items = spell.layers.map(layer => {
        if (layer.isCombo) {
          return `<span class="combo-tag element-${layer.element}">${layer.label}</span>`;
        }
        const name = this._elementName(layer.element);
        return `<span class="glyph-tag element-${layer.element}">${name}</span>`;
      }).join('');
      layersHTML = `<div class="spell-layers">${items}</div>`;
    } else {
      const elName = this._elementName(spell.element);
      layersHTML = `
        <div style="margin-bottom:8px">
          <strong class="element-${spell.element}">${elName}</strong>
          — форма: <em>${this._shapeLabel(spell.shape)}</em>
          ${spell.combo ? `<br><small class="element-wind">${spell.combo}</small>` : ''}
        </div>`;
    }

    const riskLabel = {
      low: 'Низкий', medium: 'Средний', high: 'Высокий'
    }[spell.risk];

    const notes = spell.notes.map(n => `<li>${n}</li>`).join('');

    el.innerHTML = `
      ${layersHTML}
      <div class="bar">
        <span class="bar-label">Сила</span>
        <div class="bar-track"><div class="bar-fill fill-power" style="width:${spell.power}%"></div></div>
        <span>${spell.power}</span>
      </div>
      <div class="bar">
        <span class="bar-label">Стабильность</span>
        <div class="bar-track"><div class="bar-fill fill-stability" style="width:${spell.stability}%"></div></div>
        <span>${spell.stability}</span>
      </div>
      <div class="bar">
        <span class="bar-label">Длительность</span>
        <span>${spell.duration} с</span>
      </div>
      <div class="bar">
        <span class="bar-label">Область</span>
        <span>${spell.area} px</span>
      </div>
      <div class="bar">
        <span class="bar-label">Риск</span>
        <span class="risk-${spell.risk}">${riskLabel}</span>
      </div>
      <ul class="notes">${notes}</ul>
    `;
  }

  _clearAnalysis() {
    document.getElementById('analysisLive').innerHTML =
      '<p class="muted">Начни рисовать круг активации и знак внутри…</p>';
    document.getElementById('spellResult').innerHTML = '';
    document.getElementById('inkFill').style.width = '100%';
    this.lastReport = null;
  }

  // ---------- Книга заклинаний ----------

  _openBook() {
    const modal = document.getElementById('bookModal');
    const list = document.getElementById('bookList');
    const entries = this.spellbook.all();
    list.innerHTML = '';

    if (!entries.length) {
      list.innerHTML = '<p class="muted">Пока пусто. Создай стабильное заклинание (стабильность > 50), и оно появится здесь.</p>';
    }

    for (const entry of entries) {
      const div = document.createElement('div');
      div.className = 'book-entry';
      div.innerHTML = `
        <canvas width="160" height="120"></canvas>
        <h3>${entry.name}</h3>
        <p>Стаб.: ${entry.stability} · Сила: ${entry.power}</p>
        <p class="muted">${entry.created}</p>
        <button class="del-btn" title="Удалить">✕</button>
      `;
      const cv = div.querySelector('canvas');
      this.spellbook.renderThumbnail(cv, entry);

      // Клик → «повторить» (загрузить штрихи и активировать)
      div.onclick = (e) => {
        if (e.target.classList.contains('del-btn')) return;
        modal.classList.add('hidden');
        this._replayEntry(entry);
      };

      // Удаление
      div.querySelector('.del-btn').onclick = (e) => {
        e.stopPropagation();
        this.spellbook.remove(entry.id);
        this._openBook(); // перерисовать список
      };

      list.appendChild(div);
    }

    modal.classList.remove('hidden');
  }

  /**
   * Загружает сохранённые штрихи в рекордер, перерисовывает и активирует.
   */
  _replayEntry(entry) {
    this.mode = 'sandbox';
    document.querySelectorAll('.mode-switch button').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === 'sandbox'));

    this.recorder.clear();
    this._drawActivationGuide();

    // Восстанавливаем штрихи
    this.recorder.loadStrokes(entry.strokes);
    this._analyze(false);

    // Небольшая пауза, затем активация
    setTimeout(() => this._castSpell(), 400);
  }

  // ---------- Текстовые ярлыки ----------

  _glyphLabel(type) {
    return {
      circle: 'круг',
      brokenCircle: 'разорв. круг',
      line: 'линия',
      arrow: 'стрелка',
      wave: 'волна·вода',
      zigzag: 'зигзаг·огонь',
      spiral: 'спираль·ветер',
      triangle: 'треуг.·земля',
      square: 'квадрат·барьер',
      star: 'звезда·свет',
      dot: 'точка',
      branch: 'ветвь·растение',
      parallelLines: 'парал. линии',
      concentricCircles: 'концентр. круги',
      unknown: 'знак?'
    }[type] || type;
  }

  _shapeLabel(shape) {
    return {
      beam: 'луч', spray: 'брызги', fountain: 'фонтан', burst: 'взрыв',
      vortex: 'вихрь', gust: 'порыв', lift: 'левитация', platform: 'платформа',
      sphere: 'сфера света', shield: 'щит', vine: 'лоза', floweringVines: 'цветущие лозы',
      steam: 'пар', firestorm: 'огненный вихрь', storm: 'шторм', lava: 'магма', growth: 'рост', fizzle: 'пшик (сбой)'
    }[shape] || shape;
  }
}