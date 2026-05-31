/**
 * UIController
 * Связывает всё вместе: рисование → распознавание → компиляция → эффект → UI.
 * Управляет режимами, панелью анализа, книгой, испытаниями, обучением.
 */
import { StrokeRecorder } from './StrokeRecorder.js';
import { MagicRecognizer } from './MagicRecognizer.js';
import { SpellCompiler } from './SpellCompiler.js';
import { EffectEngine } from './EffectEngine.js';
import { Spellbook } from './Spellbook.js';
import { TutorialManager } from './TutorialManager.js';

const TRIALS = [
  { id: 't1', text: '🔥 Потуши огонь водой: нарисуй круг + волну + стрелку вправо.',
    win: s => s.element === 'water' && s.stability > 45 },
  { id: 't2', text: '🪨 Построй каменную платформу: круг + треугольник + стрелка вверх.',
    win: s => s.element === 'earth' && (s.shape === 'platform') },
  { id: 't3', text: '💡 Освети тёмную комнату: круг + звезда/лучи + точка в центре.',
    win: s => s.element === 'light' && s.stability > 40 },
  { id: 't4', text: '🌿 Вырасти лозу до предмета: круг + ветвление + линия вверх.',
    win: s => s.element === 'plant' },
  { id: 't5', text: '🛡 Создай барьер от камней: круг + квадрат + параллельные линии.',
    win: s => s.element === 'barrier' && s.stability > 50 },
  { id: 't6', text: '🌪 Подними куб ветром: круг + спираль + стрелки вверх.',
    win: s => s.element === 'wind' }
];

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

    this.mode = 'sandbox';
    this.autoActivate = false;
    this.currentTrial = 0;
    this.lastReport = null;

    this._bindUI();
    this._drawActivationGuide();
    this._updateModeUI();
  }

  // ---------- Привязка интерфейса ----------

  _bindUI() {
    document.getElementById('btnUndo').onclick = () => {
      this.recorder.undo();
      this._onDraw();
    };
    document.getElementById('btnClear').onclick = () => {
      this.recorder.clear();
      this._clearAnalysis();
      this._drawActivationGuide();
    };
    document.getElementById('btnCast').onclick = () => this._castSpell();

    const toggle = document.getElementById('toggleAuto');
    toggle.onchange = e => { this.autoActivate = e.target.checked; };

    // Режимы
    document.querySelectorAll('.mode-switch button').forEach(btn => {
      btn.onclick = () => this._switchMode(btn.dataset.mode);
    });

    // Закрытие модалок
    document.querySelectorAll('[data-close]').forEach(el => {
      el.onclick = () => {
        document.getElementById('bookModal').classList.add('hidden');
        document.getElementById('warnModal').classList.add('hidden');
      };
    });
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
      this.tutorial.reset();
      hint.textContent = this.tutorial.getHint();
    } else if (this.mode === 'trial') {
      this.currentTrial = 0;
      hint.textContent = TRIALS[0].text;
    } else {
      hint.textContent = 'Свободная мастерская: рисуй любые схемы. Удачные сохраняй в Книгу.';
    }
  }

  // ---------- Подсказка-направляющая (полупрозрачный круг) ----------

  _drawActivationGuide() {
    const ctx = this.overlayCtx;
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    ctx.save();
    ctx.strokeStyle = 'rgba(123,108,255,0.18)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.arc(260, 260, 180, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ---------- События рисования ----------

  _onDraw() {
    // Живой анализ (лёгкий)
    this._analyze(true);
  }

  _onStrokeEnd() {
    this._analyze(false);
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

  _analyze(live) {
    const strokes = this.recorder.strokes;
    if (!strokes.length) { this._clearAnalysis(); return; }

    const report = MagicRecognizer.analyze(strokes, this.drawCanvas.width);
    this.lastReport = report;

    // Обновляем индикатор чернил
    const ink = report.quality.inkAmount;
    const inkPercent = Math.max(0, 100 - Math.min(100, ink / 40));
    document.getElementById('inkFill').style.width = inkPercent + '%';

    // Живая панель: что распознано
    const liveEl = document.getElementById('analysisLive');
    const glyphs = report.glyphs;
    const tags = glyphs.map(g =>
      `<span class="glyph-tag">${this._glyphLabel(g.type)}</span>`).join('');
    const circleInfo = report.activationCircle
      ? `Круг: замкнутость ${Math.round(report.quality.closureScore * 100)}%`
      : 'Круг активации не нарисован';
    liveEl.innerHTML = `
      <div>${tags || '<span class="muted">штрихи анализируются…</span>'}</div>
      <div class="muted" style="margin-top:6px">${circleInfo}</div>
    `;
  }

  // ---------- Активация заклинания ----------

  _castSpell() {
    const strokes = this.recorder.strokes;
    if (!strokes.length) return;

    const report = MagicRecognizer.analyze(strokes, this.drawCanvas.width);
    const target = this.mode === 'trial' ? { alive: false } : null;
    const spell = SpellCompiler.compile(report, { mode: this.mode, target });

    // Запретная магия → предупреждение
    if (spell.forbidden) {
      this._showWarning(
        'Эта схема воздействует на запретную область магии (тело, разум, ' +
        'необратимое превращение живого). Магия требует ответственности. ' +
        (this.mode === 'tutorial'
          ? 'В режиме обучения такая схема заблокирована.'
          : 'В песочнице показан безопасный нестабильный откат: дым и трещины пространства.')
      );
      // В песочнице показываем безопасный сбой
      if (this.mode !== 'tutorial') {
        spell.shape = 'fizzle';
        spell.stability = 15;
        this.engine.cast(spell);
      }
      this._renderResult(spell, true);
      return;
    }

    // Запускаем эффект
    this.engine.cast(spell);
    this._renderResult(spell, false);

    // Сохраняем удачные в книгу (стабильность > 50)
    if (spell.stability > 50 && spell.element !== 'unknown') {
      this.spellbook.add(strokes, spell);
    }

    // Проверка испытания
    if (this.mode === 'trial') {
      this._checkTrial(spell);
    }
  }

  _checkTrial(spell) {
    const trial = TRIALS[this.currentTrial];
    const hint = document.getElementById('trialHint');
    if (trial && trial.win(spell)) {
      hint.innerHTML = `✅ Испытание пройдено!<br>` +
        (this.currentTrial + 1 < TRIALS.length
          ? `Следующее: ${TRIALS[this.currentTrial + 1].text}`
          : '🏆 Все испытания пройдены! Ты — настоящий мастер чертёжной магии.');
      this.currentTrial = Math.min(this.currentTrial + 1, TRIALS.length - 1);
      setTimeout(() => {
        this.recorder.clear();
        this._clearAnalysis();
        this._drawActivationGuide();
      }, 1500);
    } else {
      hint.innerHTML = `❌ Эффект не подходит. ${trial.text}`;
    }
  }

  // ---------- Отрисовка результата ----------

  _renderResult(spell, isWarning) {
    const el = document.getElementById('spellResult');
    const elName = {
      water: 'Вода', fire: 'Огонь', wind: 'Ветер', earth: 'Земля',
      light: 'Свет', plant: 'Растение', barrier: 'Барьер',
      mist: 'Туман', firestorm: 'Огнешторм', lightdome: 'Световой купол',
      unknown: 'Неизвестно'
    }[spell.element] || spell.element;

    const riskLabel = {
      low: 'Низкий', medium: 'Средний', high: 'Высокий', forbidden: 'ЗАПРЕЩЕНО'
    }[spell.risk];

    const notes = spell.notes.map(n => `<li>${n}</li>`).join('');

    el.innerHTML = `
      <div style="margin-bottom:8px">
        <strong class="element-${spell.element}">${elName}</strong>
        — форма: <em>${this._shapeLabel(spell.shape)}</em>
        ${spell.combo ? `<br><small class="element-wind">${spell.combo}</small>` : ''}
      </div>

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

  // ---------- Предупреждение (этический барьер) ----------

  _showWarning(text) {
    const modal = document.getElementById('warnModal');
    document.getElementById('warnText').textContent = text;
    modal.classList.remove('hidden');
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
      sphere: 'сфера света', shield: 'щит', vine: 'лоза', fizzle: 'пшик (сбой)'
    }[shape] || shape;
  }
}