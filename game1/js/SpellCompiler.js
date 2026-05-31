/**
 * SpellCompiler
 * Превращает результат распознавания в SpellDescriptor.
 * Здесь живёт «грамматика глифов»: какой знак → какой элемент,
 * как модификаторы влияют на форму, силу, длительность, риск.
 */
const GlyphTypes = {
  CIRCLE: 'circle',
  BROKEN_CIRCLE: 'brokenCircle',
  LINE: 'line',
  ARROW: 'arrow',
  WAVE: 'wave',
  ZIGZAG: 'zigzag',
  SPIRAL: 'spiral',
  TRIANGLE: 'triangle',
  SQUARE: 'square',
  STAR: 'star',
  DOT: 'dot',
  BRANCH: 'branch',
  PARALLEL: 'parallelLines',
  CONCENTRIC: 'concentricCircles',
  UNKNOWN: 'unknown'
};

// Соответствие основного знака → элемент
const ELEMENT_MAP = {
  [GlyphTypes.WAVE]:     'water',
  [GlyphTypes.ZIGZAG]:   'fire',
  [GlyphTypes.SPIRAL]:   'wind',
  [GlyphTypes.TRIANGLE]: 'earth',
  [GlyphTypes.STAR]:     'light',
  [GlyphTypes.BRANCH]:   'plant',
  [GlyphTypes.SQUARE]:   'barrier'
};

// Базовая форма эффекта по элементу
const DEFAULT_SHAPE = {
  water:   'spray',
  fire:    'burst',
  wind:    'vortex',
  earth:   'platform',
  light:   'sphere',
  plant:   'vine',
  barrier: 'shield',
  unknown: 'fizzle'
};

export class SpellCompiler {

  /**
   * Собирает SpellDescriptor из отчёта распознавания TensorFlow.js.
   * @param {object} report  результат NeuralDetector.analyzeStrokes
   * @param {object} options { mode: 'sandbox'|'tutorial', target: {...} }
   */
  static compile(report, options = {}) {
    const { glyphs, activationCircle, quality } = report;
    const notes = [];

    // ---------- 1. Определяем элемент ----------
    const elementGlyphs = glyphs.filter(g => ELEMENT_MAP[g.type]);
    let element = 'unknown';
    let elementGlyph = null;

    if (elementGlyphs.length) {
      // выбираем самый «уверенный» элементальный знак
      elementGlyph = elementGlyphs.reduce((a, b) => (a.score > b.score ? a : b));
      element = ELEMENT_MAP[elementGlyph.type];
      notes.push(`Распознан элементальный знак: ${this._elementName(element)}.`);
    } else {
      notes.push('Не найден элементальный знак внутри круга — эффект неопределён.');
    }

    // ---------- 2. Комбинации элементов (режим экспериментов) ----------
    const presentElements = [...new Set(elementGlyphs.map(g => ELEMENT_MAP[g.type]))];
    let combo = null;
    if (presentElements.length >= 2) {
      combo = this._resolveCombo(presentElements);
      if (combo) {
        element = combo.element;
        notes.push(`Комбинация знаков → ${combo.label}.`);
      }
    }

    // ---------- 3. Направление (стрелки/линии) ----------
    const arrows = glyphs.filter(g => g.type === GlyphTypes.ARROW);
    const arrowVectors = arrows.map(a => ({
      x: a.dir?.x || 0,
      y: a.dir?.y || 0,
      angle: Math.atan2(a.dir?.y || 0, a.dir?.x || 1),
      confidence: a.score || 0
    }));
    let direction = { x: 0, y: 0, angle: 0 };
    if (arrowVectors.length) {
      for (const a of arrowVectors) { direction.x += a.x; direction.y += a.y; }
      const m = Math.hypot(direction.x, direction.y) || 1;
      direction.x /= m; direction.y /= m;
      direction.angle = Math.atan2(direction.y, direction.x);
      notes.push(`Направляющая стрелка задаёт направление потока.`);
    }

    // ---------- 4. Базовые параметры из качества ----------
    let stability = this._computeStability(quality);
    let power = this._computePower(quality, glyphs);
    let area = this._computeArea(activationCircle, glyphs);
    let duration = this._computeDuration(quality, glyphs);

    // ---------- 5. Форма эффекта + модификаторы ----------
    let shape = DEFAULT_SHAPE[element] || 'fizzle';

    // Концентрические круги → увеличение области
    if (glyphs.some(g => g.concentric)) {
      area *= 1.5;
      notes.push('Концентрические круги увеличили область воздействия.');
    }

    // Квадрат-контейнер (если элемент не сам barrier)
    const hasSquare = glyphs.some(g => g.type === GlyphTypes.SQUARE);
    if (hasSquare && element !== 'barrier') {
      notes.push('Квадрат-ограничитель локализует эффект в заданной области.');
      area *= 0.7;
      stability += 8;
    }

    // Параллельные линии → усиление барьера / модификатор
    if (glyphs.some(g => g.type === GlyphTypes.PARALLEL)) {
      if (element === 'barrier') { power += 15; notes.push('Параллельные линии укрепили барьер.'); }
      else { power += 8; }
    }

    // Точка фокуса → концентрация
    const dots = glyphs.filter(g => g.type === GlyphTypes.DOT);
    if (dots.length === 1) {
      power += 10;
      notes.push('Точка фокуса сконцентрировала энергию.');
    } else if (dots.length > 1) {
      notes.push('Несколько точек — эффект делится на цели.');
      power *= 0.8;
    }

    // Стрелки определяют конкретную форму
    if (arrows.length) {
      shape = this._shapeFromArrows(element, arrows, direction);
    }

    // Повторение элементальных знаков → интенсивность
    if (elementGlyphs.length > 1 && !combo) {
      power += elementGlyphs.length * 6;
      stability -= elementGlyphs.length * 4;
      notes.push('Повторение знака усилило интенсивность, но снизило стабильность.');
    }

    // ---------- 6. Влияние толщины линий (давление) ----------
    const avgPressure = this._avgPressure(glyphs);
    if (avgPressure > 0.7) {
      power += 12;
      duration -= 1;
      notes.push('Толстые мощные линии: эффект сильнее, но затратнее.');
    } else if (avgPressure < 0.35) {
      power -= 8;
      notes.push('Тонкие линии дали слабый, экономный эффект.');
    }

    // ---------- 7. Незамкнутый / отсутствующий круг ----------
    if (!activationCircle) {
      stability = Math.min(stability, 20);
      power *= 0.4;
      shape = 'fizzle';
      notes.push('Внешний круг активации не нарисован — энергия растекается хаотично.');
    } else if (quality.closureScore < 0.55) {
      stability *= 0.6;
      power *= 0.7;
      notes.push(`Круг не замкнут (разрыв ~${Math.round(activationCircle.closureGap)} px) — часть энергии утекла.`);
    }

    // ---------- 8. Размер круга ----------
    if (activationCircle) {
      if (quality.circleSizeRatio < 0.18) {
        power *= 0.6;
        notes.push('Круг слишком мал — эффект слабый.');
      } else if (quality.circleSizeRatio > 0.85) {
        notes.push('Очень большой круг — повышенный расход чернил.');
      }
    }

    // ---------- 9. Ранняя активация (круг нарисован первым) ----------
    if (quality.earlyActivation) {
      stability *= 0.6;
      notes.push('Круг замкнут слишком рано — схема активировалась до завершения, эффект неполный.');
    }

    // ---------- 10. Оценка риска ----------
    let risk = this._assessRisk(element, stability, power, glyphs, options);
    if (risk.forbidden) {
      notes.push('⚠ Эта схема воздействует на запретную область магии.');
    }

    // ---------- Финальная нормализация ----------
    stability = Math.max(0, Math.min(100, Math.round(stability)));
    power = Math.max(0, Math.min(100, Math.round(power)));
    area = Math.max(20, Math.min(260, Math.round(area)));
    duration = Math.max(0.5, Math.min(12, +duration.toFixed(1)));

    // Низкая стабильность портит форму
    if (stability < 30 && shape !== 'fizzle') {
      notes.push('Низкая стабильность: эффект нестабилен, возможны искры, дым и трещины.');
    }

    return {
      element,
      shape,
      direction,
      vector: direction,
      arrows: arrowVectors,
      power,
      stability,
      duration,
      area,
      risk: risk.level,
      forbidden: risk.forbidden,
      center: activationCircle ? activationCircle.center : { x: 260, y: 260 },
      combo: combo ? combo.label : null,
      notes,
      glyphSummary: this._glyphSummary(glyphs)
    };
  }

  // ---------- Вспомогательные расчёты ----------

  static _computeStability(q) {
    let s = 100;
    s *= (0.4 + 0.6 * q.symmetryScore);
    s *= (0.5 + 0.5 * q.smoothnessScore);
    s *= (0.6 + 0.4 * q.closureScore);
    s *= (0.7 + 0.3 * q.centerednessScore);
    s *= q.strokeOrderScore;
    s -= q.overloadPenalty * 100;
    s -= q.gapPenalty * 100;
    s -= q.intersectionPenalty * 100;
    return s;
  }

  static _computePower(q, glyphs) {
    // База от количества чернил + кол-ва значимых глифов
    let p = 30 + Math.min(40, q.inkAmount / 25);
    p += glyphs.filter(g => ELEMENT_MAP[g.type]).length * 5;
    return p;
  }

  static _computeArea(circle, glyphs) {
    if (!circle) return 40;
    return circle.radius * 1.1;
  }

  static _computeDuration(q, glyphs) {
    let d = 3;
    // Двойная линия / много чернил → дольше
    d += Math.min(4, q.inkAmount / 400);
    return d;
  }

  static _avgPressure(glyphs) {
    let total = 0, n = 0;
    for (const g of glyphs) {
      if (g.stroke && g.stroke.avgPressure) { total += g.stroke.avgPressure; n++; }
    }
    return n ? total / n : 0.5;
  }

  static _shapeFromArrows(element, arrows, dir) {
    // Несколько стрелок наружу → взрыв/расширение
    if (arrows.length >= 3) return 'burst';
    // Стрелка вверх
    if (dir.y < -0.5) {
      if (element === 'earth') return 'platform';   // каменная колонна
      if (element === 'water') return 'fountain';
      if (element === 'wind') return 'lift';         // левитация
      if (element === 'plant') return 'vine';
    }
    // Горизонтальный поток
    if (Math.abs(dir.x) > 0.5) {
      if (element === 'water') return 'beam';
      if (element === 'fire') return 'beam';
      if (element === 'light') return 'beam';
      if (element === 'wind') return 'gust';
    }
    return DEFAULT_SHAPE[element] || 'fizzle';
  }

  static _resolveCombo(elements) {
    const has = e => elements.includes(e);
    if (has('water') && has('wind')) return { element: 'mist', label: 'Вода + Ветер = Туман/Дождь' };
    if (has('fire') && has('wind'))  return { element: 'firestorm', label: 'Огонь + Ветер = Огненный поток' };
    if (has('earth') && has('plant')) return { element: 'plant', label: 'Земля + Растение = Корни/Лоза' };
    if (has('light') && has('barrier')) return { element: 'lightdome', label: 'Свет + Барьер = Световой купол' };
    return null;
  }

  static _assessRisk(element, stability, power, glyphs, options) {
    // «Запретная» магия: воздействие на живую цель боевым/трансформирующим эффектом
    const target = options.target;
    const isCombat = ['fire', 'firestorm', 'earth'].includes(element) && power > 60;
    const tooManyStars = glyphs.filter(g => g.type === GlyphTypes.STAR).length >= 2;

    let forbidden = false;
    if (target && target.alive && (isCombat || element === 'fire')) {
      forbidden = true;
    }
    // Режим обучения блокирует мощную/опасную магию
    if (options.mode === 'tutorial' && (power > 75 || forbidden)) {
      forbidden = true;
    }

    let level = 'low';
    if (forbidden) level = 'forbidden';
    else if (stability < 35) level = 'high';
    else if (stability < 60 || power > 70) level = 'medium';

    return { level, forbidden };
  }

  static _elementName(e) {
    return {
      water: 'Вода', fire: 'Огонь', wind: 'Ветер', earth: 'Земля',
      light: 'Свет', plant: 'Растение', barrier: 'Барьер',
      mist: 'Туман', firestorm: 'Огненный шторм', lightdome: 'Световой купол',
      unknown: 'Неизвестно'
    }[e] || e;
  }

  static _glyphSummary(glyphs) {
    const names = {
      [GlyphTypes.CIRCLE]: 'круг',
      [GlyphTypes.BROKEN_CIRCLE]: 'разорванный круг',
      [GlyphTypes.WAVE]: 'волна (вода)',
      [GlyphTypes.ZIGZAG]: 'зигзаг (огонь)',
      [GlyphTypes.SPIRAL]: 'спираль (ветер)',
      [GlyphTypes.TRIANGLE]: 'треугольник (земля)',
      [GlyphTypes.STAR]: 'звезда (свет)',
      [GlyphTypes.BRANCH]: 'ветвление (растение)',
      [GlyphTypes.SQUARE]: 'квадрат (барьер)',
      [GlyphTypes.ARROW]: 'стрелка',
      [GlyphTypes.LINE]: 'линия',
      [GlyphTypes.PARALLEL]: 'параллельные линии',
      [GlyphTypes.DOT]: 'точка',
      [GlyphTypes.CONCENTRIC]: 'концентрические круги',
      [GlyphTypes.UNKNOWN]: 'неопознанный знак'
    };
    return glyphs.map(g => names[g.type] || g.type);
  }
}