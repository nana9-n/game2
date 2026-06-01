/**
 * SpellCompiler
 * Превращает результат распознавания в SpellDescriptor.
 *
 * v2 — Многослойная система комбинаций.
 * Один чертёж может порождать несколько связанных эффектов одновременно.
 * Комбо разрешаются жадно (сначала длинные / высший приоритет), оставшиеся
 * знаки становятся самостоятельными слоями. Все направляемые слои учитывают
 * стрелку. API обратно совместим: поля element, shape, combo, direction
 * по-прежнему присутствуют; новое поле layers[] содержит все слои.
 */

const GlyphTypes = {
  CIRCLE:     'circle',
  BROKEN_CIRCLE: 'brokenCircle',
  LINE:       'line',
  ARROW:      'arrow',
  WAVE:       'wave',
  ZIGZAG:     'zigzag',
  SPIRAL:     'spiral',
  TRIANGLE:   'triangle',
  SQUARE:     'square',
  STAR:       'star',
  DOT:        'dot',
  BRANCH:     'branch',
  PARALLEL:   'parallelLines',
  CONCENTRIC: 'concentricCircles',
  UNKNOWN:    'unknown'
};

// Знак → элемент
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
  water:     'spray',
  fire:      'burst',
  wind:      'vortex',
  earth:     'platform',
  light:     'sphere',
  plant:     'vine',
  bloom:     'floweringVines',
  prism:     'beam',
  barrier:   'shield',
  mist:      'steam',
  firestorm: 'firestorm',
  lightdome: 'shield',
  mud:       'growth',
  lava:      'lava',
  storm:     'storm',
  unknown:   'fizzle'
};

/**
 * Таблица комбинаций упорядочена по приоритету.
 * 3-элементные комбо идут первыми, затем 2-элементные.
 * Жадный алгоритм потребляет элементы сверху вниз:
 * если комбо сработало — его элементы убираются из пула «remaining».
 * Оставшиеся элементы порождают самостоятельные эффекты.
 */
const COMBO_TABLE = [
  // ── 3 элемента ────────────────────────────────────────────────────────
  {
    elements: ['earth', 'water', 'light'],
    result: { element: 'bloom',     shape: 'floweringVines', label: 'Земля + Вода + Свет = Цветение',      boost: 1.4  }
  },
  // ── 2 элемента ────────────────────────────────────────────────────────
  { elements: ['water',  'plant'],   result: { element: 'bloom',      shape: 'floweringVines', label: 'Вода + Лозы = Цветущие лозы',        boost: 1.3  } },
  { elements: ['light',  'plant'],   result: { element: 'bloom',      shape: 'floweringVines', label: 'Свет + Растение = Бурный рост',       boost: 1.35 } },
  { elements: ['light',  'barrier'], result: { element: 'lightdome',  shape: 'shield',         label: 'Свет + Барьер = Световой купол',      boost: 1.2  } },
  { elements: ['light',  'water'],   result: { element: 'prism',      shape: 'beam',           label: 'Свет + Вода = Призматический луч',    boost: 1.18 } },
  { elements: ['fire',   'wind'],    result: { element: 'firestorm',  shape: 'firestorm',      label: 'Огонь + Ветер = Огненный вихрь',      boost: 1.35 } },
  { elements: ['water',  'wind'],    result: { element: 'storm',      shape: 'storm',          label: 'Вода + Ветер = Шторм',                boost: 1.15 } },
  { elements: ['earth',  'fire'],    result: { element: 'lava',       shape: 'lava',           label: 'Земля + Огонь = Магма',               boost: 1.2  } },
  { elements: ['earth',  'water'],   result: { element: 'mud',        shape: 'growth',         label: 'Земля + Вода = Грязь/Рост',           boost: 1.1  } },
  { elements: ['earth',  'plant'],   result: { element: 'plant',      shape: 'vine',           label: 'Земля + Растение = Корни/Лоза',       boost: 1.0  } },
  { elements: ['fire',   'water'],   result: { element: 'mist',       shape: 'steam',          label: 'Огонь + Вода = Паровая завеса',       boost: 1.0  } },
];

// Элементы-эффекты, которые НЕ наследуют направление стрелки
// (защитные / рассеивающие, всегда вокруг источника)
const NON_DIRECTIONAL = new Set(['barrier', 'lightdome']);

export class SpellCompiler {

  /**
   * Собирает SpellDescriptor из отчёта NeuralDetector.analyzeStrokes.
   * Возвращает поле layers[] — список всех эффектов для одновременного каста.
   * Поля element / shape / combo остаются для обратной совместимости.
   */
  static compile(report, options = {}) {
    const { glyphs, activationCircle, quality } = report;
    const notes = [];

    // ── 1. Все элементальные знаки ─────────────────────────────────────
    const elementGlyphs = glyphs.filter(g => ELEMENT_MAP[g.type]);
    const presentElements = [...new Set(elementGlyphs.map(g => ELEMENT_MAP[g.type]))];
    let element = 'unknown';
    let elementGlyph = null;

    if (elementGlyphs.length) {
      elementGlyph = elementGlyphs.reduce((a, b) => (a.score > b.score ? a : b));
      element = ELEMENT_MAP[elementGlyph.type];
      if (presentElements.length === 1) {
        notes.push(`Распознан элементальный знак: ${this._elementName(element)}.`);
      } else {
        notes.push(`Распознаны знаки: ${presentElements.map(e => this._elementName(e)).join(', ')}.`);
      }
    } else {
      notes.push('Не найден элементальный знак внутри круга — эффект неопределён.');
    }

    // ── 2. Направление (стрелки) ────────────────────────────────────────
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
      notes.push('Направляющая стрелка задаёт направление потока.');
    }

    // ── 3. Базовые параметры из качества ────────────────────────────────
    let stability = this._computeStability(quality);
    let power     = this._computePower(quality, glyphs);
    let area      = this._computeArea(activationCircle, glyphs);
    let duration  = this._computeDuration(quality, glyphs);

    // ── 4. Модификаторы ─────────────────────────────────────────────────

    // Концентрические круги → увеличение области
    if (glyphs.some(g => g.concentric)) {
      area *= 1.5;
      notes.push('Концентрические круги увеличили область воздействия.');
    }

    // Параллельные линии → усиление
    if (glyphs.some(g => g.type === GlyphTypes.PARALLEL)) {
      if (presentElements.includes('barrier')) {
        power += 15;
        notes.push('Параллельные линии укрепили барьер.');
      } else {
        power += 8;
      }
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

    // Повторение одного и того же знака (несколько зигзагов огня и т.д.)
    if (elementGlyphs.length > presentElements.length && presentElements.length > 0) {
      const extra = elementGlyphs.length - presentElements.length;
      power     += extra * 6;
      stability -= extra * 4;
      notes.push('Повторение знака усилило интенсивность, но снизило стабильность.');
    }

    // Толщина линий (давление)
    const avgPressure = this._avgPressure(glyphs);
    if (avgPressure > 0.7) {
      power += 12; duration -= 1;
      notes.push('Толстые мощные линии: эффект сильнее, но затратнее.');
    } else if (avgPressure < 0.35) {
      power -= 8;
      notes.push('Тонкие линии дали слабый, экономный эффект.');
    }

    // Незамкнутый / отсутствующий круг
    if (!activationCircle) {
      stability = Math.min(stability, 20);
      power    *= 0.4;
      notes.push('Внешний круг активации не нарисован — энергия растекается хаотично.');
    } else if (quality.closureScore < 0.55) {
      stability *= 0.6;
      power     *= 0.7;
      notes.push(`Круг не замкнут (разрыв ~${Math.round(activationCircle.closureGap)} px) — часть энергии утекла.`);
    }

    // Размер круга
    if (activationCircle) {
      if (quality.circleSizeRatio < 0.18) {
        power *= 0.6;
        notes.push('Круг слишком мал — эффект слабый.');
      } else if (quality.circleSizeRatio > 0.85) {
        notes.push('Очень большой круг — повышенный расход чернил.');
      }
    }

    // Ранняя активация (круг нарисован первым)
    if (quality.earlyActivation) {
      stability *= 0.6;
      notes.push('Круг замкнут слишком рано — схема активировалась до завершения, эффект неполный.');
    }

    // Риск
    const risk = this._assessRisk(element, stability, power, glyphs, options);

    // ── Финальная нормализация ───────────────────────────────────────────
    stability = Math.max(0, Math.min(100, Math.round(stability)));
    power     = Math.max(0, Math.min(100, Math.round(power)));
    area      = Math.max(20, Math.min(260, Math.round(area)));
    duration  = Math.max(0.5, Math.min(12, +duration.toFixed(1)));

    if (stability < 30) {
      notes.push('Низкая стабильность: эффект нестабилен, возможны искры, дым и трещины.');
    }

    // ── 5. Многослойное разрешение ───────────────────────────────────────
    const layers = presentElements.length > 0
      ? this._resolveAllLayers(presentElements, power, area, duration, stability, direction, arrows)
      : [];

    // Если нет активационного круга — все слои превращаются в «пшик»
    if (!activationCircle) {
      for (const l of layers) l.shape = 'fizzle';
    }

    // Обратная совместимость: element / combo / shape из первого слоя
    let combo = null;
    const firstComboLayer = layers.find(l => l.isCombo);
    if (firstComboLayer) {
      element = firstComboLayer.element;
      combo = { element: firstComboLayer.element, label: firstComboLayer.label };
    } else if (layers.length > 0) {
      element = layers[0].element;
    }

    let shape;
    if (layers.length > 0) {
      shape = layers[0].shape;
    } else {
      shape = DEFAULT_SHAPE[element] || 'fizzle';
      if (arrows.length) shape = this._shapeFromArrows(element, arrows, direction);
      if (!activationCircle) shape = 'fizzle';
    }

    // Итоговые заметки о многослойности
    if (layers.length > 1) {
      notes.push(`Многослойная схема: ${layers.map(l => l.label).join(' · ')}.`);
    } else if (layers.length === 1 && layers[0].isCombo) {
      notes.push(`Комбинация знаков → ${layers[0].label}.`);
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
      forbidden: false,
      center: activationCircle ? activationCircle.center : { x: 260, y: 260 },
      combo:  combo ? combo.label : null,
      notes,
      glyphSummary: this._glyphSummary(glyphs),
      layers   // ← новое поле: массив всех слоёв для одновременного каста
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Многослойное разрешение комбинаций
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Жадно матчит COMBO_TABLE (высший приоритет — сначала).
   * Совпавшие элементы убираются из пула. Остаток → самостоятельные слои.
   * Направляемые слои получают вектор стрелки; барьер/купол — нет.
   */
  static _resolveAllLayers(presentElements, power, area, duration, stability, direction, arrows) {
    if (!presentElements.length) return [];

    const remaining = new Set(presentElements);
    const layers    = [];

    for (const entry of COMBO_TABLE) {
      if (entry.elements.every(e => remaining.has(e))) {
        for (const e of entry.elements) remaining.delete(e);

        const res   = entry.result;
        const isDir = !NON_DIRECTIONAL.has(res.element);
        const lDir  = isDir && arrows.length ? direction : { x: 0, y: 0, angle: 0 };

        // Форма: берём из combo table, уточняем стрелкой для направляемых
        let layerShape = res.shape;
        if (isDir && arrows.length) {
          const refined = this._shapeFromArrows(res.element, arrows, direction);
          if (refined !== (DEFAULT_SHAPE[res.element] || 'fizzle')) layerShape = refined;
        }

        layers.push({
          element:  res.element,
          shape:    layerShape,
          label:    res.label,
          power:    Math.round(Math.min(100, power   * res.boost)),
          area:     Math.round(Math.min(330, area    * res.boost)),
          duration: Math.max(0.5, Math.min(12, +(duration * 1.15).toFixed(1))),
          stability,
          direction: lDir,
          vector:    lDir,
          isCombo:   true
        });
      }
    }

    // Оставшиеся знаки → самостоятельные эффекты (чуть меньшая область)
    for (const element of remaining) {
      const isDir = !NON_DIRECTIONAL.has(element);
      const lDir  = isDir && arrows.length ? direction : { x: 0, y: 0, angle: 0 };

      let layerShape = DEFAULT_SHAPE[element] || 'fizzle';
      if (isDir && arrows.length) {
        layerShape = this._shapeFromArrows(element, arrows, direction);
      }

      layers.push({
        element,
        shape:    layerShape,
        label:    this._elementName(element),
        power,
        area:     Math.round(area * 0.85),
        duration,
        stability,
        direction: lDir,
        vector:    lDir,
        isCombo:   false
      });
    }

    return layers;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Вспомогательные расчёты
  // ─────────────────────────────────────────────────────────────────────

  static _computeStability(q) {
    let s = 100;
    s *= (0.4 + 0.6 * q.symmetryScore);
    s *= (0.5 + 0.5 * q.smoothnessScore);
    s *= (0.6 + 0.4 * q.closureScore);
    s *= (0.7 + 0.3 * q.centerednessScore);
    s *= q.strokeOrderScore;
    s -= q.overloadPenalty    * 100;
    s -= q.gapPenalty         * 100;
    s -= q.intersectionPenalty * 100;
    return s;
  }

  static _computePower(q, glyphs) {
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
    if (arrows.length >= 3) return 'burst';
    if (dir.y < -0.5) {
      if (element === 'earth')  return 'platform';
      if (element === 'water')  return 'fountain';
      if (element === 'wind')   return 'lift';
      if (element === 'plant')  return 'vine';
    }
    if (Math.abs(dir.x) > 0.5) {
      if (element === 'water')  return 'beam';
      if (element === 'fire')   return 'beam';
      if (element === 'light')  return 'beam';
      if (element === 'wind')   return 'gust';
      if (element === 'prism')  return 'beam';
    }
    return DEFAULT_SHAPE[element] || 'fizzle';
  }

  static _assessRisk(element, stability, power, glyphs, options) {
    let level = 'low';
    if (stability < 35) level = 'high';
    else if (stability < 60 || power > 70) level = 'medium';
    return { level, forbidden: false };
  }

  static _elementName(e) {
    return {
      water:     'Вода',
      fire:      'Огонь',
      wind:      'Ветер',
      earth:     'Земля',
      light:     'Свет',
      plant:     'Растение',
      bloom:     'Цветущие лозы',
      prism:     'Призматический луч',
      barrier:   'Барьер',
      mist:      'Туман/Пар',
      firestorm: 'Огненный вихрь',
      lightdome: 'Световой купол',
      mud:       'Грязь/Рост',
      lava:      'Магма',
      storm:     'Шторм',
      unknown:   'Неизвестно'
    }[e] || e;
  }

  /** @deprecated Используй _resolveAllLayers — оставлен для обратной совместимости */
  static _resolveCombo(elements) {
    const remaining = new Set(elements);
    for (const entry of COMBO_TABLE) {
      if (entry.elements.every(e => remaining.has(e))) {
        return { element: entry.result.element, label: entry.result.label };
      }
    }
    return null;
  }

  static _glyphSummary(glyphs) {
    const names = {
      [GlyphTypes.CIRCLE]:     'круг',
      [GlyphTypes.BROKEN_CIRCLE]: 'разорванный круг',
      [GlyphTypes.WAVE]:       'волна (вода)',
      [GlyphTypes.ZIGZAG]:     'зигзаг (огонь)',
      [GlyphTypes.SPIRAL]:     'спираль (ветер)',
      [GlyphTypes.TRIANGLE]:   'треугольник (земля)',
      [GlyphTypes.STAR]:       'звезда (свет)',
      [GlyphTypes.BRANCH]:     'ветвление (растение)',
      [GlyphTypes.SQUARE]:     'квадрат (барьер)',
      [GlyphTypes.ARROW]:      'стрелка',
      [GlyphTypes.LINE]:       'линия',
      [GlyphTypes.PARALLEL]:   'параллельные линии',
      [GlyphTypes.DOT]:        'точка',
      [GlyphTypes.CONCENTRIC]: 'концентрические круги',
      [GlyphTypes.UNKNOWN]:    'неопознанный знак'
    };
    return glyphs.map(g => names[g.type] || g.type);
  }
}
