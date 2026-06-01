/**
 * StrokeRecorder
 * Захватывает рисование пользователя на canvas (мышь + touch + pointer/перо).
 * Записывает штрихи с координатами, давлением, временем.
 * Поддерживает undo, clear, загрузку сохранённых штрихов.
 */

export class Stroke {
  constructor() {
    this.points = [];      // {x, y, pressure, t}
    this.length = 0;       // суммарная длина пути
    this.isDot = false;
    this.avgPressure = 0.5;
    this.bbox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  }

  addPoint(x, y, pressure, t) {
    const prev = this.points[this.points.length - 1];
    if (prev) {
      this.length += Math.hypot(x - prev.x, y - prev.y);
    }
    this.points.push({ x, y, pressure, t });
    if (x < this.bbox.minX) this.bbox.minX = x;
    if (y < this.bbox.minY) this.bbox.minY = y;
    if (x > this.bbox.maxX) this.bbox.maxX = x;
    if (y > this.bbox.maxY) this.bbox.maxY = y;
  }

  finalize() {
    // Точка, если путь очень короткий
    const w = this.bbox.maxX - this.bbox.minX;
    const h = this.bbox.maxY - this.bbox.minY;
    this.isDot = this.length < 12 && w < 12 && h < 12;

    // Средне давление
    let p = 0;
    for (const pt of this.points) p += (pt.pressure || 0.5);
    this.avgPressure = this.points.length ? p / this.points.length : 0.5;
  }
}

export class StrokeRecorder {
  /**
   * @param {HTMLCanvasElement} canvas  холст для рисования
   * @param {Function} onDraw    вызывается при добавлении точки (живой анализ)
   * @param {Function} onStrokeEnd вызывается при завершении штриха
   */
  constructor(canvas, onDraw, onStrokeEnd) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onDraw = onDraw || (() => {});
    this.onStrokeEnd = onStrokeEnd || (() => {});

    this.strokes = [];
    this.redoStack = [];
    this.current = null;
    this.drawing = false;

    this._setupStyle();
    this._bindEvents();
  }

  _setupStyle() {
    const ctx = this.ctx;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#3e2a16';
    ctx.shadowBlur = 4;
    ctx.shadowColor = 'rgba(74,50,24,0.5)';
  }

  _pos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    let clientX, clientY, pressure = 0.5;

    if (e.touches && e.touches.length) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
      pressure = e.touches[0].force || 0.5;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
      if (typeof e.pressure === 'number' && e.pressure > 0) pressure = e.pressure;
    }
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
      pressure
    };
  }

  _bindEvents() {
    const start = (e) => {
      e.preventDefault();
      this.drawing = true;
      this.current = new Stroke();
      const p = this._pos(e);
      this.current.addPoint(p.x, p.y, p.pressure, performance.now());
    };

    const move = (e) => {
      if (!this.drawing || !this.current) return;
      e.preventDefault();
      const p = this._pos(e);
      const prev = this.current.points[this.current.points.length - 1];
      // Пропускаем слишком близкие точки (сглаживание)
      if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < 1.5) return;

      this.current.addPoint(p.x, p.y, p.pressure, performance.now());

      // Рисуем сегмент с учётом давления
      const ctx = this.ctx;
      ctx.lineWidth = 2 + p.pressure * 4;
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

      this.onDraw();
    };

    const end = (e) => {
      if (!this.drawing) return;
      e.preventDefault();
      this.drawing = false;
      if (this.current && this.current.points.length) {
        this.current.finalize();
        this.strokes.push(this.current);
        this.redoStack = [];
        this.onStrokeEnd();
      }
      this.current = null;
    };

    // Pointer events (универсальные: мышь, перо, тач)
    if (window.PointerEvent) {
      this.canvas.addEventListener('pointerdown', start);
      this.canvas.addEventListener('pointermove', move);
      this.canvas.addEventListener('pointerup', end);
      this.canvas.addEventListener('pointerleave', end);
      this.canvas.addEventListener('pointercancel', end);
    } else {
      // Fallback
      this.canvas.addEventListener('mousedown', start);
      this.canvas.addEventListener('mousemove', move);
      this.canvas.addEventListener('mouseup', end);
      this.canvas.addEventListener('mouseleave', end);
      this.canvas.addEventListener('touchstart', start, { passive: false });
      this.canvas.addEventListener('touchmove', move, { passive: false });
      this.canvas.addEventListener('touchend', end);
    }
  }

  // ---------- Управление ----------

  undo() {
    const stroke = this.strokes.pop();
    if (stroke) this.redoStack.push(stroke);
    this._redraw();
  }

  redo() {
    const stroke = this.redoStack.pop();
    if (stroke) this.strokes.push(stroke);
    this._redraw();
  }

  clear() {
    this.strokes = [];
    this.redoStack = [];
    this.current = null;
    this.drawing = false;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Программно добавляет один штрих из массива точек {x, y}
   * (например, ровный круг, нарисованный кнопкой), не трогая остальные.
   */
  addStrokeFromPoints(points) {
    if (!points || points.length < 2) return;
    const s = new Stroke();
    const now = performance.now();
    for (const p of points) s.addPoint(p.x, p.y, 0.5, now);
    s.finalize();
    this.strokes.push(s);
    this.redoStack = [];
    this._redraw();
  }

  /**
   * Загружает штрихи из сохранённых данных (только координаты).
   */
  loadStrokes(rawStrokes) {
    this.strokes = [];
    this.redoStack = [];
    for (const raw of rawStrokes) {
      const s = new Stroke();
      for (const p of raw.points) {
        s.addPoint(p.x, p.y, 0.5, 0);
      }
      s.finalize();
      this.strokes.push(s);
    }
    this._redraw();
  }

  /**
   * Перерисовывает все штрихи (после undo / загрузки).
   */
  _redraw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.strokeStyle = '#3e2a16';
    for (const s of this.strokes) {
      const pts = s.points;
      if (pts.length < 2) {
        // Точка
        if (pts.length === 1) {
          ctx.beginPath();
          ctx.arc(pts[0].x, pts[0].y, 3, 0, Math.PI * 2);
          ctx.fillStyle = '#3e2a16';
          ctx.fill();
        }
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineWidth = 2 + (pts[i].pressure || 0.5) * 4;
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
    }
  }
}