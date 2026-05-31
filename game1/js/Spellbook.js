/**
 * Spellbook
 * Хранит «удачные» заклинания: миниатюра, дескриптор, заметки.
 * Сохраняет в localStorage.
 */
const STORAGE_KEY = 'witch-hat-atelier-spellbook-v1';

export class Spellbook {
  constructor() {
    this.entries = this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  _save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries)); }
    catch {}
  }

  /**
   * Добавляет запись.
   * @param {Array} strokes  массив штрихов (для миниатюры)
   * @param {object} spell   SpellDescriptor
   */
  add(strokes, spell) {
    // Сохраняем только координаты — без давления и времени, чтобы экономить
    const compactStrokes = strokes.map(s => ({
      points: s.points.map(p => ({ x: p.x, y: p.y }))
    }));

    const entry = {
      id: Date.now(),
      name: this._nameFor(spell),
      element: spell.element,
      power: spell.power,
      stability: spell.stability,
      risk: spell.risk,
      shape: spell.shape,
      notes: spell.notes,
      strokes: compactStrokes,
      created: new Date().toLocaleString()
    };
    this.entries.unshift(entry);
    if (this.entries.length > 30) this.entries.pop();
    this._save();
    return entry;
  }

  _nameFor(spell) {
    const elementNames = {
      water: 'Водный знак', fire: 'Огненный знак', wind: 'Знак ветра',
      earth: 'Земляной знак', light: 'Светоч', plant: 'Знак роста',
      barrier: 'Барьер', mist: 'Туман', firestorm: 'Огнешторм',
      lightdome: 'Световой купол', unknown: 'Незавершённая схема'
    };
    const base = elementNames[spell.element] || 'Схема';
    return `${base} (${spell.shape})`;
  }

  all() { return this.entries; }

  remove(id) {
    this.entries = this.entries.filter(e => e.id !== id);
    this._save();
  }

  /**
   * Рисует миниатюру схемы на canvas.
   */
  renderThumbnail(canvas, entry) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Найти bbox всех штрихов
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of entry.strokes) {
      for (const p of s.points) {
        if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
      }
    }
    const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
    const scale = Math.min(canvas.width / w, canvas.height / h) * 0.85;
    const dx = (canvas.width - w * scale) / 2 - minX * scale;
    const dy = (canvas.height - h * scale) / 2 - minY * scale;

    ctx.strokeStyle = '#cbb9ff';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of entry.strokes) {
      ctx.beginPath();
      const pts = s.points;
      if (!pts.length) continue;
      ctx.moveTo(pts[0].x * scale + dx, pts[0].y * scale + dy);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x * scale + dx, pts[i].y * scale + dy);
      }
      ctx.stroke();
    }
  }
}