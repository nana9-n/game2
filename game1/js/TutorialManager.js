/**
 * TutorialManager
 * Пошаговое обучение: круг → элементальный знак → стрелка → полное заклинание.
 * Следит за анализом схемы и продвигает игрока по шагам.
 */
import { GlyphTypes } from './GlyphDetector.js';

export class TutorialManager {
  constructor() {
    this.steps = [
      {
        id: 'circle',
        title: 'Шаг 1: Круг активации',
        hint: 'Нарисуй замкнутый круг по центру холста. Чем ровнее — тем стабильнее любое заклинание.',
        check: (report) => {
          const c = report.activationCircle;
          return c && c.type === GlyphTypes.CIRCLE && report.quality.closureScore > 0.7;
        },
        success: 'Отлично! Ровный круг — основа любой схемы. Теперь очисти холст (✕) и переходи дальше.'
      },
      {
        id: 'water',
        title: 'Шаг 2: Знак воды',
        hint: 'Внутри круга нарисуй волнистую линию (~~~). Волна = вода. Сначала знак, потом круг!',
        check: (report) => {
          return report.glyphs.some(g => g.type === GlyphTypes.WAVE);
        },
        success: 'Ты начертил знак воды. Волна несёт смысл потока. Очисти холст и продолжай.'
      },
      {
        id: 'arrow',
        title: 'Шаг 3: Направляющая стрелка',
        hint: 'Нарисуй стрелку → она задаст направление потока заклинания.',
        check: (report) => {
          return report.glyphs.some(g => g.type === GlyphTypes.ARROW);
        },
        success: 'Стрелка распознана! Направляющие линии задают вектор силы.'
      },
      {
        id: 'fullSpell',
        title: 'Шаг 4: Полное заклинание воды',
        hint: 'Соедини всё: сначала волну (вода), затем стрелку (направление), и последним замкни внешний круг. Затем активируй ⚡.',
        check: (report) => {
          const hasWave = report.glyphs.some(g => g.type === GlyphTypes.WAVE);
          const hasArrow = report.glyphs.some(g => g.type === GlyphTypes.ARROW);
          const hasCircle = report.activationCircle &&
            report.quality.closureScore > 0.5;
          return hasWave && hasArrow && hasCircle;
        },
        success: 'Поздравляю! Ты собрал полноценное заклинание воды. Магия — это письмо, и ты освоил первые буквы. Переходи в Мастерскую и экспериментируй!'
      }
    ];
    this.current = 0;
    this.completed = false;
  }

  reset() {
    this.current = 0;
    this.completed = false;
  }

  currentStep() {
    return this.steps[this.current] || null;
  }

  /**
   * Проверяет текущий отчёт. Возвращает {advanced, message, done}.
   */
  evaluate(report) {
    if (this.completed) return { advanced: false, done: true, message: '' };
    const step = this.steps[this.current];
    if (!step) return { advanced: false, done: true, message: '' };

    if (step.check(report)) {
      const msg = step.success;
      this.current++;
      if (this.current >= this.steps.length) {
        this.completed = true;
        return { advanced: true, done: true, message: msg };
      }
      return { advanced: true, done: false, message: msg };
    }
    return { advanced: false, done: false, message: '' };
  }

  getHint() {
    if (this.completed) return '🎓 Обучение завершено! Переходи в Мастерскую.';
    const step = this.steps[this.current];
    return step ? `${step.title}\n${step.hint}` : '';
  }
}