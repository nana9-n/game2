/**
 * EffectEngine
 * Получает SpellDescriptor и рендерит соответствующий визуальный эффект
 * на сцене. Все параметры (power, stability, direction, area, risk)
 * влияют на поведение частиц и форм.
 */
import { ParticleSystem } from './ParticleSystem.js';

const COLORS = {
  water:   ['#4fb6e6', '#7fd0f0', '#2a86c0'],
  fire:    ['#ff7546', '#ffb347', '#ff3030', '#ffd060'],
  wind:    ['#b3e8ce', '#d8f5e8', '#88c9a8'],
  earth:   ['#b58a5a', '#8a6740', '#d4a877'],
  light:   ['#fff4b3', '#ffffff', '#ffe066'],
  plant:   ['#7ed16c', '#4fa83c', '#a8e890'],
  barrier: ['#c6a8ff', '#a48fff', '#e0d0ff'],
  mist:    ['#bcd6e0', '#dde8ee'],
  firestorm: ['#ff7546', '#b3e8ce', '#ffb347'],
  lightdome: ['#fff4b3', '#c6a8ff'],
  unknown: ['#888899']
};

export class EffectEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ps = new ParticleSystem();
    this.activeEffects = []; // структурные эффекты (барьеры, камни, лозы)
    this.lastTime = performance.now();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  // Запуск эффекта по дескриптору. spell.center в координатах ХОЛСТА (520х520),
  // переводим в координаты сцены (520x380).
  cast(spell) {
    const sx = this.canvas.width / 2;
    const sy = this.canvas.height * 0.6;
    const origin = { x: sx, y: sy };

    const palette = COLORS[spell.element] || COLORS.unknown;
    const intensity = spell.power / 100;
    const chaos = 1 - spell.stability / 100;
    const dir = spell.direction;
    const hasDir = Math.hypot(dir.x, dir.y) > 0.2;

    switch (spell.shape) {
      case 'beam':     this._beam(origin, palette, intensity, chaos, dir, spell); break;
      case 'spray':    this._spray(origin, palette, intensity, chaos, dir, spell); break;
      case 'fountain': this._fountain(origin, palette, intensity, chaos, spell); break;
      case 'burst':    this._burst(origin, palette, intensity, chaos, spell); break;
      case 'vortex':   this._vortex(origin, palette, intensity, chaos, spell); break;
      case 'gust':     this._gust(origin, palette, intensity, chaos, dir, spell); break;
      case 'lift':     this._lift(origin, palette, intensity, chaos, spell); break;
      case 'platform': this._platform(origin, palette, intensity, spell); break;
      case 'sphere':   this._sphere(origin, palette, intensity, chaos, spell); break;
      case 'shield':   this._shield(origin, palette, intensity, spell); break;
      case 'vine':     this._vine(origin, palette, intensity, chaos, spell); break;
      case 'fizzle':
      default:         this._fizzle(origin, palette, spell); break;
    }

    // Риск: добавляем сбои
    if (spell.risk === 'high' || spell.risk === 'forbidden') {
      this._riskSparks(origin, chaos);
    }
  }

  // ---------- Конкретные эффекты ----------

  _beam(o, pal, I, chaos, dir, spell) {
    const n = Math.floor(40 + I * 80);
    for (let i = 0; i < n; i++) {
      const spread = (Math.random() - 0.5) * (0.3 + chaos * 1.5);
      const angle = Math.atan2(dir.y, dir.x) + spread;
      const speed = (3 + I * 6) * (0.6 + Math.random() * 0.4);
      this.ps.emit({
        x: o.x, y: o.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.6 + Math.random() * 0.6,
        size: 3 + I * 4,
        color: pal[i % pal.length],
        gravity: spell.element === 'water' ? 0.05 : 0,
        shape: spell.element === 'fire' ? 'spark' : 'circle'
      });
    }
  }

    _spray(o, pal, I, chaos, dir, spell) {
    const n = Math.floor(30 + I * 50);
    const baseAngle = Math.atan2(dir.y, dir.x);
    for (let i = 0; i < n; i++) {
      const angle = (Math.hypot(dir.x, dir.y) > 0.2 ? baseAngle : -Math.PI / 2)
        + (Math.random() - 0.5) * (0.8 + chaos * 2);
      const speed = 2 + Math.random() * (4 + I * 4);
      this.ps.emit({
        x: o.x, y: o.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.8 + Math.random(),
        size: 2 + Math.random() * 4,
        color: pal[i % pal.length],
        gravity: 0.15
      });
    }
  }

  _fountain(o, pal, I, chaos, spell) {
    const n = Math.floor(60 + I * 80);
    for (let i = 0; i < n; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * (0.4 + chaos);
      const speed = 4 + Math.random() * (5 + I * 5);
      this.ps.emit({
        x: o.x + (Math.random() - 0.5) * 10,
        y: o.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1 + Math.random() * 1.2,
        size: 3 + Math.random() * 3,
        color: pal[i % pal.length],
        gravity: 0.18
      });
    }
  }

  _burst(o, pal, I, chaos, spell) {
    const n = Math.floor(80 + I * 120);
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * (5 + I * 6);
      this.ps.emit({
        x: o.x, y: o.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.6 + Math.random() * 0.8,
        size: 3 + Math.random() * 4,
        color: pal[i % pal.length],
        gravity: spell.element === 'fire' ? -0.05 : 0,
        shape: spell.element === 'fire' ? 'spark' : 'circle'
      });
    }
  }

  _vortex(o, pal, I, chaos, spell) {
    // Создаём «структурный» вихрь, который живёт N секунд и постоянно эмитит
    this.activeEffects.push({
      type: 'vortex',
      x: o.x, y: o.y,
      life: spell.duration, maxLife: spell.duration,
      radius: spell.area * 0.5,
      palette: pal,
      intensity: I,
      chaos,
      t: 0
    });
  }

  _gust(o, pal, I, chaos, dir, spell) {
    const n = Math.floor(40 + I * 60);
    const baseAngle = Math.atan2(dir.y, dir.x);
    for (let i = 0; i < n; i++) {
      const angle = baseAngle + (Math.random() - 0.5) * (0.5 + chaos);
      const speed = 4 + Math.random() * (5 + I * 4);
      this.ps.emit({
        x: o.x + (Math.random() - 0.5) * 20,
        y: o.y + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.8 + Math.random(),
        size: 4 + Math.random() * 5,
        color: pal[i % pal.length],
        glow: false
      });
    }
  }

  _lift(o, pal, I, chaos, spell) {
    // Левитация: «объект» поднимается, вокруг — частицы ветра
    this.activeEffects.push({
      type: 'lift',
      x: o.x, y: o.y, baseY: o.y,
      life: spell.duration, maxLife: spell.duration,
      palette: pal, intensity: I, chaos,
      t: 0,
      offsetX: chaos * 60 * (Math.random() - 0.5)
    });
  }

  _platform(o, pal, I, spell) {
    // Каменная платформа/колонна вырастает снизу
    this.activeEffects.push({
      type: 'platform',
      x: o.x, y: o.y,
      width: spell.area * 0.8,
      targetHeight: 40 + I * 80,
      currentHeight: 0,
      life: spell.duration + 2, maxLife: spell.duration + 2,
      palette: pal
    });
    // Камешки при появлении
    for (let i = 0; i < 30; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
      const speed = 2 + Math.random() * 4;
      this.ps.emit({
        x: o.x + (Math.random() - 0.5) * spell.area * 0.6,
        y: o.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.8 + Math.random(),
        size: 3 + Math.random() * 4,
        color: pal[i % pal.length],
        gravity: 0.25,
        shape: 'square',
        glow: false
      });
    }
  }

  _sphere(o, pal, I, chaos, spell) {
    this.activeEffects.push({
      type: 'sphere',
      x: o.x, y: o.y,
      radius: spell.area * 0.4,
      life: spell.duration, maxLife: spell.duration,
      palette: pal, intensity: I, chaos,
      t: 0
    });
  }

  _shield(o, pal, I, spell) {
    this.activeEffects.push({
      type: 'shield',
      x: o.x, y: o.y,
      radius: spell.area * 0.6,
      life: spell.duration, maxLife: spell.duration,
      palette: pal, intensity: I,
      stability: spell.stability,
      t: 0
    });
  }

  _vine(o, pal, I, chaos, spell) {
    // Несколько лоз, растущих вверх
    const count = 1 + Math.floor(I * 4);
    for (let i = 0; i < count; i++) {
      this.activeEffects.push({
        type: 'vine',
        x: o.x + (Math.random() - 0.5) * spell.area * 0.5,
        y: o.y,
        segments: [],
        maxSegments: 12 + Math.floor(I * 18),
        life: spell.duration + 2, maxLife: spell.duration + 2,
        palette: pal,
        chaos,
        t: 0,
        growth: 0
      });
    }
  }

  _fizzle(o, pal, spell) {
    // Бесполезный «пшик» — дым и слабые искры
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 2;
      this.ps.emit({
        x: o.x, y: o.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        life: 0.8 + Math.random(),
        size: 4 + Math.random() * 4,
        color: '#666677',
        glow: false,
        gravity: -0.04
      });
    }
  }

  _riskSparks(o, chaos) {
    const n = Math.floor(20 + chaos * 40);
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 6;
      this.ps.emit({
        x: o.x, y: o.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.3 + Math.random() * 0.5,
        size: 2 + Math.random() * 3,
        color: '#ff5577',
        shape: 'spark',
        gravity: 0.1
      });
    }
  }

  // ---------- Обновление структурных эффектов ----------

  _updateActive(dt) {
    for (const e of this.activeEffects) {
      e.life -= dt;
      e.t += dt;

      if (e.type === 'vortex') {
        // Эмитим частицы по спирали
        const emitN = 2 + Math.floor(e.intensity * 3);
        for (let i = 0; i < emitN; i++) {
          const a = e.t * 4 + i * 1.3;
          const r = e.radius * (0.4 + 0.6 * Math.random());
          this.ps.emit({
            x: e.x + Math.cos(a) * r,
            y: e.y + Math.sin(a) * r,
            vx: -Math.sin(a) * 3,
            vy: Math.cos(a) * 3 - 0.5,
            life: 0.5 + Math.random() * 0.5,
            size: 3 + Math.random() * 3,
            color: e.palette[i % e.palette.length],
            glow: false
          });
        }
      }

      if (e.type === 'lift') {
        const phase = 1 - e.life / e.maxLife;
        e.x = e.baseX || e.x;
        // Лёгкое колыхание
        const bob = Math.sin(e.t * 3) * 4;
        e.currentY = e.baseY - 40 * e.intensity * Math.min(1, phase * 2) + bob;
        e.currentX = e.x + e.offsetX * Math.min(1, phase * 2);
        // Вокруг крутятся ветровые частицы
        if (Math.random() < 0.5) {
          const a = Math.random() * Math.PI * 2;
          this.ps.emit({
            x: e.currentX + Math.cos(a) * 20,
            y: e.currentY + Math.sin(a) * 20,
            vx: -Math.sin(a) * 2,
            vy: Math.cos(a) * 2,
            life: 0.5,
            size: 3,
            color: e.palette[0],
            glow: false
          });
        }
      }

      if (e.type === 'platform') {
        const grow = Math.min(1, e.t / 0.6);
        e.currentHeight = e.targetHeight * grow;
      }

      if (e.type === 'sphere') {
        // Пульсация
        e.pulse = 1 + Math.sin(e.t * 4) * 0.05;
      }

      if (e.type === 'shield') {
        e.pulse = 1 + Math.sin(e.t * 2) * 0.04;
      }

      if (e.type === 'vine') {
        // Растим сегменты по времени
        const targetCount = Math.min(e.maxSegments, Math.floor(e.t * 8));
        while (e.segments.length < targetCount) {
          const last = e.segments[e.segments.length - 1] ||
            { x: e.x, y: e.y, angle: -Math.PI / 2 };
          const wobble = (Math.random() - 0.5) * (0.4 + e.chaos * 1.2);
          const angle = last.angle + wobble;
          const len = 8 + Math.random() * 4;
          e.segments.push({
            x: last.x + Math.cos(angle) * len,
            y: last.y + Math.sin(angle) * len,
            angle
          });
        }
      }
    }
    this.activeEffects = this.activeEffects.filter(e => e.life > 0);
  }

  _drawActive(ctx) {
    for (const e of this.activeEffects) {
      const t = Math.max(0, e.life / e.maxLife);

      if (e.type === 'lift') {
        // Рисуем «объект» — маленький светящийся куб
        ctx.save();
        ctx.translate(e.currentX, e.currentY);
        ctx.shadowBlur = 20; ctx.shadowColor = e.palette[0];
        ctx.fillStyle = '#d4c8b0';
        ctx.fillRect(-12, -12, 24, 24);
        ctx.strokeStyle = e.palette[0];
        ctx.lineWidth = 2;
        ctx.strokeRect(-12, -12, 24, 24);
        ctx.restore();
      }

      if (e.type === 'platform') {
        ctx.save();
        const w = e.width, h = e.currentHeight;
        const g = ctx.createLinearGradient(0, e.y - h, 0, e.y);
        g.addColorStop(0, e.palette[2] || e.palette[0]);
        g.addColorStop(1, e.palette[1] || e.palette[0]);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(e.x - w / 2, e.y);
        ctx.lineTo(e.x - w / 2 + 6, e.y - h);
        ctx.lineTo(e.x + w / 2 - 6, e.y - h);
        ctx.lineTo(e.x + w / 2, e.y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#2a2010';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }

      if (e.type === 'sphere') {
        ctx.save();
        const r = e.radius * (e.pulse || 1);
        const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
        grad.addColorStop(0, e.palette[1]);
        grad.addColorStop(0.5, e.palette[0]);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.globalAlpha = t;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (e.type === 'shield') {
        ctx.save();
        ctx.globalAlpha = 0.4 * t;
        const r = e.radius * (e.pulse || 1);
        ctx.strokeStyle = e.palette[0];
        ctx.lineWidth = 3;
        ctx.shadowBlur = 15; ctx.shadowColor = e.palette[0];
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.stroke();
        // Внутренний слой
        ctx.globalAlpha = 0.15 * t;
        ctx.fillStyle = e.palette[1];
        ctx.fill();
        // Если стабильность низкая — рисуем «трещины»
        if (e.stability < 50) {
          ctx.globalAlpha = 0.7;
          ctx.lineWidth = 1;
          ctx.strokeStyle = '#ff5577';
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2 + e.t;
            ctx.beginPath();
            ctx.moveTo(e.x + Math.cos(a) * r * 0.4, e.y + Math.sin(a) * r * 0.4);
            ctx.lineTo(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r);
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      if (e.type === 'vine') {
        ctx.save();
        ctx.strokeStyle = e.palette[1] || e.palette[0];
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.shadowBlur = 6; ctx.shadowColor = e.palette[0];
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        for (const s of e.segments) ctx.lineTo(s.x, s.y);
        ctx.stroke();
        // Листики на каждом 3-м сегменте
        ctx.fillStyle = e.palette[0];
        for (let i = 2; i < e.segments.length; i += 3) {
          const s = e.segments[i];
          ctx.beginPath();
          ctx.ellipse(s.x, s.y, 6, 3, s.angle, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      if (e.type === 'vortex') {
        // Полупрозрачное кольцо
        ctx.save();
        ctx.globalAlpha = 0.2 * t;
        ctx.strokeStyle = e.palette[0];
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // ---------- Главный цикл ----------

  _loop(now) {
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    const ctx = this.ctx;
    // Затухающий фон-«призрак» предыдущего кадра
    ctx.fillStyle = 'rgba(12, 13, 31, 0.25)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Земля-горизонт
    ctx.save();
    const grad = ctx.createLinearGradient(0, this.canvas.height * 0.6, 0, this.canvas.height);
    grad.addColorStop(0, 'rgba(40, 30, 60, 0.0)');
    grad.addColorStop(1, 'rgba(20, 15, 35, 0.6)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, this.canvas.height * 0.6, this.canvas.width, this.canvas.height * 0.4);
    ctx.restore();

    this._updateActive(dt);
    this._drawActive(ctx);

    this.ps.update(dt * 60); // нормализуем под старую формулу скорости
    this.ps.draw(ctx);

    requestAnimationFrame(this._loop);
  }

  clearAll() {
    this.ps.clear();
    this.activeEffects = [];
  }
}