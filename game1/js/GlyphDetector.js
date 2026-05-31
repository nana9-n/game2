/**
 * GlyphDetector
 * Распознаёт примитивы по геометрии штриха.
 * Каждый штрих классифицируется как один из примитивов через набор
 * нечётких эвристик (fuzzy recognition).
 */
export const GlyphTypes = {
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

export class GlyphDetector {

  /**
   * Анализирует все штрихи и возвращает список распознанных глифов:
   * [{type, stroke, center, radius, bbox, score, dir, closureGap}]
   * Также определяет составные глифы (параллельные линии, концентрические круги).
   */
  static detectAll(strokes) {
    const glyphs = strokes.map(s => this.classifyStroke(s));

    // Пост-обработка: ищем параллельные линии
    this._detectParallel(glyphs);
    // Пост-обработка: концентрические круги
    this._detectConcentric(glyphs);

    return glyphs;
  }

  // ---------- Геометрические утилиты ----------

  static _centroid(points) {
    let x = 0, y = 0;
    for (const p of points) { x += p.x; y += p.y; }
    return { x: x / points.length, y: y / points.length };
  }

  static _bboxSize(bbox) {
    return { w: bbox.maxX - bbox.minX, h: bbox.maxY - bbox.minY };
  }

  static _avgRadius(points, c) {
    let r = 0;
    for (const p of points) r += Math.hypot(p.x - c.x, p.y - c.y);
    return r / points.length;
  }

  // Сколько раз направление движения резко меняется (углы > порога)
  static _countSharpTurns(points, threshold = 0.9) {
    let count = 0;
    for (let i = 2; i < points.length; i++) {
      const a = points[i - 2], b = points[i - 1], c = points[i];
      const v1x = b.x - a.x, v1y = b.y - a.y;
      const v2x = c.x - b.x, v2y = c.y - b.y;
      const m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y);
      if (m1 < 2 || m2 < 2) continue;
      const dot = (v1x * v2x + v1y * v2y) / (m1 * m2);
      const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
      if (ang > threshold) count++;
    }
    return count;
  }

  // Прямолинейность: отношение прямого расстояния к длине пути
  static _straightness(points, length) {
    const a = points[0], b = points[points.length - 1];
    const direct = Math.hypot(b.x - a.x, b.y - a.y);
    return length > 0 ? direct / length : 0;
  }

  // ---------- Классификация одного штриха ----------

  static classifyStroke(stroke) {
    const pts = stroke.points;
    const result = {
      type: GlyphTypes.UNKNOWN,
      stroke,
      center: this._centroid(pts),
      bbox: stroke.bbox,
      score: 0,
      radius: 0,
      dir: { x: 0, y: 0 },
      closureGap: Infinity
    };

    // Точка
    if (stroke.isDot || stroke.length < 12) {
      result.type = GlyphTypes.DOT;
      result.score = 0.9;
      return result;
    }

    const size = this._bboxSize(stroke.bbox);
    const c = result.center;
    const startEndGap = Math.hypot(
      pts[0].x - pts[pts.length - 1].x,
      pts[0].y - pts[pts.length - 1].y
    );
    result.closureGap = startEndGap;
    const straightness = this._straightness(pts, stroke.length);
    const turns = this._countSharpTurns(pts);

    // --- Замкнутая фигура? (концы рядом) ---
    const closed = startEndGap < stroke.length * 0.18 && stroke.length > 60;

    if (closed) {
      return this._classifyClosed(stroke, result, size, c, turns);
    }

    // --- Спираль: радиус систематически растёт/падает + много оборотов ---
    const spiralScore = this._spiralScore(pts, c);
    if (spiralScore > 0.6) {
      result.type = GlyphTypes.SPIRAL;
      result.score = spiralScore;
      result.radius = this._avgRadius(pts, c);
      return result;
    }

    // --- Прямая линия / стрелка ---
    if (straightness > 0.82) {
      const head = this._detectArrowHead(pts);
      if (head) {
        result.type = GlyphTypes.ARROW;
        result.score = 0.8;
        result.dir = head.dir;
      } else {
        result.type = GlyphTypes.LINE;
        result.score = straightness;
        const a = pts[0], b = pts[pts.length - 1];
        const m = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        result.dir = { x: (b.x - a.x) / m, y: (b.y - a.y) / m };
      }
      return result;
    }

    // --- Зигзаг vs Волна (по «угловатости» поворотов) ---
    const oscillations = this._countOscillations(pts);
    if (oscillations >= 2) {
      const sharpness = turns / Math.max(1, oscillations);
      if (sharpness > 1.4) {
        result.type = GlyphTypes.ZIGZAG;
        result.score = 0.75;
      } else {
        result.type = GlyphTypes.WAVE;
        result.score = 0.75;
      }
      // направление общего потока
      const a = pts[0], b = pts[pts.length - 1];
      const m = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      result.dir = { x: (b.x - a.x) / m, y: (b.y - a.y) / m };
      return result;
    }

    // --- Ветвление (растение): есть основная вертикаль + ответвления ---
    if (size.h > size.w * 1.1 && turns >= 2) {
      result.type = GlyphTypes.BRANCH;
      result.score = 0.6;
      return result;
    }

    return result;
  }

  // Замкнутые фигуры: круг / треугольник / квадрат / звезда / разорванный круг
  static _classifyClosed(stroke, result, size, c, turns) {
    const pts = stroke.points;
    const avgR = this._avgRadius(pts, c);
    // отклонение радиуса (для круга мало)
    let variance = 0;
    for (const p of pts) {
      const r = Math.hypot(p.x - c.x, p.y - c.y);
      variance += (r - avgR) ** 2;
    }
    variance = Math.sqrt(variance / pts.length) / (avgR || 1);

    result.radius = avgR;

    // Считаем «вершины»: точки максимально удалённые с резкими поворотами
    const corners = this._countCorners(pts);

    if (variance < 0.18 && corners <= 1) {
      result.type = GlyphTypes.CIRCLE;
      result.score = 1 - variance;
      return result;
    }

    if (corners === 3) {
      result.type = GlyphTypes.TRIANGLE;
      result.score = 0.8;
      return result;
    }
    if (corners === 4) {
      result.type = GlyphTypes.SQUARE;
      result.score = 0.8;
      return result;
    }
    if (corners >= 5) {
      result.type = GlyphTypes.STAR;
      result.score = 0.7;
      return result;
    }

    // Замкнуто, но кривовато → разорванный/нестабильный круг
    result.type = GlyphTypes.BROKEN_CIRCLE;
    result.score = 0.5;
    return result;
  }

  // Подсчёт углов многоугольника (упрощение Дугласа-Пекера + углы)
  static _countCorners(points) {
    const simplified = this._simplify(points, 8);
    let corners = 0;
    const n = simplified.length;
    for (let i = 0; i < n; i++) {
      const a = simplified[(i - 1 + n) % n];
      const b = simplified[i];
      const cc = simplified[(i + 1) % n];
      const v1x = b.x - a.x, v1y = b.y - a.y;
      const v2x = cc.x - b.x, v2y = cc.y - b.y;
      const m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y);
      if (m1 < 4 || m2 < 4) continue;
      const dot = (v1x * v2x + v1y * v2y) / (m1 * m2);
      const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
      if (ang > 0.7) corners++;
    }
    return corners;
  }

  // Упрощение полилинии (Дуглас-Пекер)
  static _simplify(points, epsilon) {
    if (points.length < 3) return points.slice();
    const sqEps = epsilon * epsilon;
    const keep = new Array(points.length).fill(false);
    keep[0] = keep[points.length - 1] = true;

    const stack = [[0, points.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop();
      let maxD = 0, idx = -1;
      for (let i = s + 1; i < e; i++) {
        const d = this._perpDistSq(points[i], points[s], points[e]);
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (maxD > sqEps && idx !== -1) {
        keep[idx] = true;
        stack.push([s, idx], [idx, e]);
      }
    }
    return points.filter((_, i) => keep[i]);
  }

  static _perpDistSq(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = dx * dx + dy * dy;
    if (len === 0) return (p.x - a.x) ** 2 + (p.y - a.y) ** 2;
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + t * dx, py = a.y + t * dy;
    return (p.x - px) ** 2 + (p.y - py) ** 2;
  }

  // Оценка «спиральности»: монотонный рост угла + изменение радиуса
  static _spiralScore(points, c) {
    if (points.length < 10) return 0;
    let prevAngle = Math.atan2(points[0].y - c.y, points[0].x - c.x);
    let totalRotation = 0;
    let radii = [];
    for (let i = 1; i < points.length; i++) {
      const a = Math.atan2(points[i].y - c.y, points[i].x - c.x);
      let d = a - prevAngle;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      totalRotation += d;
      prevAngle = a;
      radii.push(Math.hypot(points[i].x - c.x, points[i].y - c.y));
    }
    const turns = Math.abs(totalRotation) / (2 * Math.PI);
    // меняется ли радиус монотонно
    const rStart = radii.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
    const rEnd = radii.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const radiusChange = Math.abs(rEnd - rStart) / (Math.max(rStart, rEnd) || 1);

    if (turns > 0.9 && radiusChange > 0.25) {
      return Math.min(1, turns * 0.4 + radiusChange);
    }
    return 0;
  }

  // Кол-во колебаний (смены знака поперечного смещения относительно главной оси)
  static _countOscillations(points) {
    const a = points[0], b = points[points.length - 1];
    const ax = b.x - a.x, ay = b.y - a.y;
    const m = Math.hypot(ax, ay) || 1;
    const nx = -ay / m, ny = ax / m; // нормаль
    let prevSign = 0, count = 0;
    for (const p of points) {
      const proj = (p.x - a.x) * nx + (p.y - a.y) * ny;
      const sign = Math.sign(proj);
      if (sign !== 0 && sign !== prevSign && prevSign !== 0 && Math.abs(proj) > 6) {
        count++;
      }
      if (sign !== 0) prevSign = sign;
    }
    return count;
  }

  // Распознавание наконечника стрелки (резкий разворот в конце)
  static _detectArrowHead(points) {
    if (points.length < 6) return null;
    const tail = points[Math.floor(points.length * 0.6)];
    const tip = points[points.length - 1];
    const dx = tip.x - tail.x, dy = tip.y - tail.y;
    const m = Math.hypot(dx, dy) || 1;
    // Наконечник: проверяем резкий поворот у конца
    const turns = this._countSharpTurns(points.slice(-8), 1.5);
    if (turns >= 1) {
      const a = points[0], b = points[points.length - 1];
      const mm = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { dir: { x: (b.x - a.x) / mm, y: (b.y - a.y) / mm } };
    }
    return null;
  }

  // ---------- Составные глифы ----------

  static _detectParallel(glyphs) {
    const lines = glyphs.filter(g => g.type === GlyphTypes.LINE);
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        const dot = lines[i].dir.x * lines[j].dir.x + lines[i].dir.y * lines[j].dir.y;
        if (Math.abs(dot) > 0.9) {
          // близкие по направлению — отмечаем как параллельные
          lines[i].parallelWith = lines[j];
          lines[i].type = GlyphTypes.PARALLEL;
          lines[j].type = GlyphTypes.PARALLEL;
        }
      }
    }
  }

  static _detectConcentric(glyphs) {
    const circles = glyphs.filter(
      g => g.type === GlyphTypes.CIRCLE || g.type === GlyphTypes.BROKEN_CIRCLE
    );
    for (let i = 0; i < circles.length; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        const d = Math.hypot(
          circles[i].center.x - circles[j].center.x,
          circles[i].center.y - circles[j].center.y
        );
        if (d < Math.min(circles[i].radius, circles[j].radius) * 0.4) {
          circles[i].concentric = true;
          circles[j].concentric = true;
        }
      }
    }
  }
}