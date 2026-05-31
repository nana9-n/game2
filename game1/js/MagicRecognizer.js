/**
 * MagicRecognizer
 * Оценивает качество схемы и собирает данные для компиляции заклинания.
 * Работает поверх GlyphDetector: считает closure, smoothness, symmetry,
 * centeredness, overload, gaps, intersections, strokeOrder.
 */
import { GlyphDetector, GlyphTypes } from './GlyphDetector.js';

export class MagicRecognizer {

  /**
   * Главный вход. Возвращает «отчёт» о схеме:
   * { glyphs, activationCircle, quality, intent }
   */
  static analyze(strokes, canvasSize) {
    const glyphs = GlyphDetector.detectAll(strokes);

    // Находим внешний круг активации = самый большой круг/разорванный круг
    const circles = glyphs.filter(
      g => g.type === GlyphTypes.CIRCLE || g.type === GlyphTypes.BROKEN_CIRCLE
    );
    let activationCircle = null;
    if (circles.length) {
      activationCircle = circles.reduce((a, b) => (a.radius > b.radius ? a : b));
    }

    const quality = this._evaluateQuality(strokes, glyphs, activationCircle, canvasSize);

    return { glyphs, activationCircle, quality };
  }

  static _evaluateQuality(strokes, glyphs, circle, canvasSize) {
    const q = {
      closureScore: 0,
      smoothnessScore: 0,
      symmetryScore: 0,
      centerednessScore: 0,
      inkAmount: 0,
      strokeOrderScore: 1,
      overloadPenalty: 0,
      gapPenalty: 0,
      intersectionPenalty: 0,
      circleSizeRatio: 0,
      hasCircle: !!circle
    };

    // --- Чернила ---
    q.inkAmount = strokes.reduce((a, s) => a + s.length, 0);

    // --- Замыкание круга ---
    if (circle) {
      const gap = circle.closureGap;
      const circumference = 2 * Math.PI * circle.radius;
      q.closureScore = Math.max(0, 1 - (gap / (circumference * 0.25 || 1)));
      if (gap > 14) {
        q.gapPenalty = Math.min(0.5, gap / 100);
      }
      // размер круга относительно холста
      const maxR = canvasSize / 2;
      q.circleSizeRatio = circle.radius / maxR;
    }

    // --- Плавность (по кривизне на единицу длины) ---
    let totalSmooth = 0, count = 0;
    for (const s of strokes) {
      if (s.points.length < 3) continue;
      const turns = GlyphDetector._countSharpTurns(s.points, 1.2);
      const norm = 1 - Math.min(1, turns / (s.length / 30));
      totalSmooth += norm; count++;
    }
    q.smoothnessScore = count ? totalSmooth / count : 0.5;

    // --- Симметрия круга ---
    if (circle) {
      let variance = 0;
      const pts = circle.stroke.points;
      const c = circle.center;
      const avgR = circle.radius;
      for (const p of pts) {
        const r = Math.hypot(p.x - c.x, p.y - c.y);
        variance += (r - avgR) ** 2;
      }
      variance = Math.sqrt(variance / pts.length) / (avgR || 1);
      q.symmetryScore = Math.max(0, 1 - variance * 2);
    } else {
      q.symmetryScore = 0.4;
    }

    // --- Центрированность: насколько элементы внутри круга центрированы ---
    if (circle) {
      const c = circle.center;
      const inner = glyphs.filter(g => g !== circle && g.type !== GlyphTypes.CIRCLE);
      if (inner.length) {
        let totalOffset = 0;
        for (const g of inner) {
          const d = Math.hypot(g.center.x - c.x, g.center.y - c.y);
          totalOffset += d / (circle.radius || 1);
        }
        q.centerednessScore = Math.max(0, 1 - (totalOffset / inner.length));
      } else {
        q.centerednessScore = 0.5;
      }
    }

    // --- Перегрузка: слишком много штрихов ---
    if (strokes.length > 7) {
      q.overloadPenalty = Math.min(0.4, (strokes.length - 7) * 0.08);
    }

    // --- Пересечения линий разных штрихов ---
    q.intersectionPenalty = Math.min(0.3, this._countIntersections(strokes) * 0.05);

    // --- Порядок штрихов: круг должен быть нарисован последним ---
    if (circle) {
      const circleIdx = strokes.indexOf(circle.stroke);
      if (circleIdx === 0 && strokes.length > 1) {
        // круг нарисован первым → ранняя активация
        q.strokeOrderScore = 0.45;
        q.earlyActivation = true;
      } else if (circleIdx === strokes.length - 1) {
        // круг последний → идеально
        q.strokeOrderScore = 1.0;
      } else {
        q.strokeOrderScore = 0.75;
      }
    }

    return q;
  }

  // Грубый подсчёт пересечений между сегментами разных штрихов
  static _countIntersections(strokes) {
    let count = 0;
    const segs = [];
    for (let si = 0; si < strokes.length; si++) {
      const pts = strokes[si].points;
      // прореживаем
      for (let i = 0; i < pts.length - 1; i += 3) {
        segs.push({ a: pts[i], b: pts[Math.min(i + 3, pts.length - 1)], si });
      }
    }
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        if (segs[i].si === segs[j].si) continue;
        if (this._segIntersect(segs[i].a, segs[i].b, segs[j].a, segs[j].b)) count++;
      }
    }
    return count;
  }

  static _segIntersect(p1, p2, p3, p4) {
    const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
    if (Math.abs(d) < 1e-6) return false;
    const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
    const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
    return t > 0 && t < 1 && u > 0 && u < 1;
  }
}