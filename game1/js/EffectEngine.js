/**
 * EffectEngine
 * Масштабный движок визуальных эффектов для заклинаний. Поддерживает
 * несколько активных кастов, направленные потоки, комбо-реакции и частицы
 * с физикой через ParticleSystem.
 */
import { ParticleSystem } from './Particle.js';

const PALETTES = {
  water: ['#4fd8ff', '#86efff', '#1a7fca', '#d7fbff'],
  fire: ['#fff176', '#ffb13d', '#ff4b24', '#5b160d', '#6a6a72'],
  wind: ['#d7fff0', '#91e7d0', '#c7f7ff', '#95b8a8'],
  earth: ['#d29b5a', '#8b5631', '#5f3a22', '#d9c0a0'],
  light: ['#f7edbc', '#e4cf73', '#b88b35', '#fff7d6'],
  plant: ['#9edc78', '#438b42', '#2f6f32', '#d98ab5'],
  bloom: ['#9edc78', '#438b42', '#d98ab5', '#f5c6de'],
  prism: ['#b8e3f2', '#d4c5f2', '#f0d27c', '#ffffff'],
  barrier: ['#b9a4e8', '#735cc5', '#d9dcf4', '#4f438f'],
  mist: ['#d5e3ec', '#aebfcb', '#edf5f7', '#8298a5'],
  firestorm: ['#fff176', '#ff7a24', '#ff2b12', '#d7fff0'],
  lightdome: ['#fffdf0', '#fff0a8', '#d7c2ff', '#ffffff'],
  mud: ['#7b5a32', '#5f3f24', '#3f7a32', '#caa06b'],
  lava: ['#fff176', '#ff7a24', '#ad2215', '#3b1710'],
  storm: ['#aeefff', '#5fb8ff', '#d7fff0', '#6e8d98'],
  unknown: ['#b8b8c6', '#7f7f8c', '#333342']
};

const COMBOS = {
  'fire+water': { element: 'mist', shape: 'steam', label: '💨 ПАР!', duration: 3.4, boost: 1.0 },
  'fire+wind': { element: 'firestorm', shape: 'firestorm', label: '🔥🌪 ОГНЕННЫЙ ВИХРЬ!', duration: 4.6, boost: 1.35 },
  'earth+water': { element: 'mud', shape: 'growth', label: '🌿 ГРЯЗЬ И РОСТ!', duration: 4.2, boost: 1.1 },
  'earth+fire': { element: 'lava', shape: 'lava', label: '🌋 МАГМА!', duration: 4.0, boost: 1.2 },
  'water+wind': { element: 'storm', shape: 'storm', label: '🌧 ШТОРМ!', duration: 4.0, boost: 1.15 },
  'plant+water': { element: 'bloom', shape: 'floweringVines', label: '🌸 ЦВЕТУЩИЕ ЛОЗЫ!', duration: 4.8, boost: 1.3 },
  'light+plant': { element: 'bloom', shape: 'floweringVines', label: '🌸 БУРНЫЙ РОСТ!', duration: 4.4, boost: 1.35 },
  'light+water': { element: 'prism', shape: 'beam', label: '🌈 ПРИЗМАТИЧЕСКИЙ ЛУЧ!', duration: 3.8, boost: 1.18 }
};

export class EffectEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = new ParticleSystem(1100);
    this.activeEffects = [];
    this.labels = [];
    this.flashes = [];
    this.gameObjects = [];
    this.onSpellHit = null;
    this.lastTime = performance.now();
    this.lastDt = 0.016;
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  /**
   * API не изменён: UIController по-прежнему вызывает engine.cast(spell).
   */
  cast(spell) {
    const effect = this._createEffect(spell);
    const combo = this._findCombo(effect);

    this.activeEffects.push(effect);
    this._impact(effect, spell.combo ? `✦ ${spell.combo}` : null);
    this._notifySpellHit(spell, effect);

    if (combo) {
      this._triggerCombo(combo, effect);
    } else if (spell.combo) {
      this._addLabel(spell.combo, effect.origin, PALETTES.light[1]);
    }
  }

  _createEffect(spell, override = {}) {
    const element = override.element || spell.element || 'unknown';
    const palette = PALETTES[element] || PALETTES[spell.element] || PALETTES.unknown;
    const power = Math.max(0.05, (spell.power || 35) / 100) * (override.boost || 1);
    const stability = Math.max(0, Math.min(100, spell.stability ?? 60));
    const chaos = 1 - stability / 100;
    const area = Math.max(50, Math.min(330, (spell.area || 120) * (override.boost || 1)));
    const duration = override.duration || Math.max(1.2, spell.duration || 3);
    const origin = this._scenePoint(spell.center);
    const dir = this._direction(spell, element);

    return {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      element,
      shape: override.shape || spell.shape || 'burst',
      origin,
      dir,
      arrows: spell.arrows || [],
      palette,
      power,
      stability,
      chaos,
      area,
      duration,
      age: 0,
      emitAcc: 0,
      dead: false,
      spell,
      structures: this._createStructures(element, override.shape || spell.shape, origin, area, dir, palette, stability)
    };
  }

  _scenePoint(center) {
    const sourceW = 520;
    const sourceH = 520;
    const x = center?.x == null ? this.canvas.width / 2 : center.x / sourceW * this.canvas.width;
    const y = center?.y == null ? this.canvas.height * 0.62 : center.y / sourceH * this.canvas.height;
    return { x, y: Math.min(this.canvas.height * 0.82, y) };
  }

  _direction(spell, element) {
    const d = spell.vector || spell.direction || { x: 0, y: 0 };
    let x = Number.isFinite(d.x) ? d.x : (Number.isFinite(d.dx) ? d.dx : 0);
    let y = Number.isFinite(d.y) ? d.y : (Number.isFinite(d.dy) ? d.dy : 0);
    if (Math.hypot(x, y) < 0.15) {
      if (element === 'fire' || element === 'light' || element === 'plant') { x = 0; y = -1; }
      else if (element === 'earth') { x = 0; y = -0.55; }
      else { x = 1; y = -0.08; }
    }
    const m = Math.hypot(x, y) || 1;
    return { x: x / m, y: y / m, angle: Math.atan2(y, x) };
  }

  _createStructures(element, shape, origin, area, dir, palette, stability) {
    const structures = [];
    if (shape === 'shield' || element === 'barrier') {
      structures.push({ type: 'shield', radius: area * 0.65, ripple: 0, cracks: stability < 45 });
    }
    if (shape === 'platform' || element === 'earth') {
      structures.push({ type: 'platform', width: area * 1.2, height: area * 0.28 });
    }
    if (shape === 'sphere' || element === 'light' || element === 'lightdome') {
      structures.push({ type: 'sphere', radius: area * 0.5 });
    }
    if (shape === 'vortex' || element === 'wind' || element === 'firestorm') {
      structures.push({ type: 'vortex', radius: area * 0.6, spin: dir.angle });
    }
    if (shape === 'vine' || shape === 'floweringVines' || element === 'plant' || element === 'bloom') {
      structures.push({
        type: 'vine',
        points: [{ x: origin.x, y: origin.y }],
        length: area,
        dir,
        blooms: element === 'plant' || element === 'bloom',
        flowers: element === 'bloom' || shape === 'floweringVines'
      });
    }
    return structures.map(s => ({ ...s, origin, palette, t: 0 }));
  }

  _findCombo(effect) {
    const lightTarget = this.activeEffects.find(e => !e.dead && this._intersects(e, effect) && (e.element === 'light' || effect.element === 'light'));
    if (lightTarget) {
      const other = lightTarget.element === 'light' ? effect : lightTarget;
      return { existing: lightTarget, recipe: { element: other.element, shape: 'amplify', label: '✨ УСИЛЕНИЕ СВЕТОМ!', duration: 3.2, boost: 1.35 } };
    }

    for (const existing of this.activeEffects) {
      if (existing.dead || !this._intersects(existing, effect)) continue;
      const key = [existing.element, effect.element].sort().join('+');
      if (COMBOS[key]) return { existing, recipe: COMBOS[key] };
    }
    return null;
  }

  _intersects(a, b) {
    const d = Math.hypot(a.origin.x - b.origin.x, a.origin.y - b.origin.y);
    return d < (a.area + b.area) * 0.65;
  }

  _triggerCombo(combo, incoming) {
    const { existing, recipe } = combo;
    existing.duration = Math.min(existing.duration, existing.age + 0.8);
    incoming.duration = Math.min(incoming.duration, incoming.age + 1.0);

    const center = {
      x: (existing.origin.x + incoming.origin.x) / 2,
      y: (existing.origin.y + incoming.origin.y) / 2
    };
    const spell = {
      ...incoming.spell,
      element: recipe.element,
      shape: recipe.shape,
      power: Math.min(100, (incoming.spell.power || 50) + 25),
      stability: Math.max(35, incoming.spell.stability || 60),
      area: Math.max(existing.area, incoming.area) * recipe.boost,
      duration: recipe.duration,
      center: { x: center.x / this.canvas.width * 520, y: center.y / this.canvas.height * 520 },
      direction: incoming.dir
    };
    const comboEffect = this._createEffect(spell, recipe);
    comboEffect.origin = center;
    this.activeEffects.push(comboEffect);
    this._impact(comboEffect, recipe.label);
    this._notifySpellHit(spell, comboEffect);
    this._addLabel(recipe.label, center, comboEffect.palette[0]);
  }

  setGameObjects(objects = []) {
    this.gameObjects = objects;
  }

  _notifySpellHit(spell, effect) {
    if (!this.onSpellHit) return;
    this.onSpellHit(spell, effect.origin, effect.area, effect);
  }

  _impact(effect, label) {
    this.flashes.push({ x: effect.origin.x, y: effect.origin.y, r: effect.area * 0.55, life: 0.22, maxLife: 0.22, color: effect.palette[0] });
    this.particles.emit({
      count: Math.floor(18 + effect.power * 42),
      x: effect.origin.x,
      y: effect.origin.y,
      angle: 0,
      spread: Math.PI * 2,
      speed: 90 + effect.power * 160,
      speedJitter: 120,
      life: 0.35,
      lifeJitter: 0.25,
      size: 3 + effect.power * 5,
      sizeJitter: 5,
      color: effect.palette[1] || effect.palette[0],
      shape: 'spark',
      glow: true,
      additive: false,
      drag: 0.92,
      turbulence: effect.chaos * 45
    });
    if (label) this._addLabel(label, effect.origin, effect.palette[0]);
  }

  _addLabel(text, origin, color = '#fff0a8') {
    this.labels.push({ text, x: origin.x, y: origin.y - 34, color, life: 1.8, maxLife: 1.8 });
  }

  _loop(now) {
    const dt = Math.min(0.05, (now - this.lastTime) / 1000 || 0.016);
    this.lastTime = now;
    this.lastDt = dt;

    this._fadeScene();
    this._update(dt);
    this._draw();

    requestAnimationFrame(this._loop);
  }

  _fadeScene() {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(19, 24, 22, 0.19)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const grad = ctx.createLinearGradient(0, this.canvas.height * 0.55, 0, this.canvas.height);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(18, 12, 8, 0.22)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, this.canvas.height * 0.55, this.canvas.width, this.canvas.height * 0.45);
    ctx.restore();
  }

  _update(dt) {
    for (const effect of this.activeEffects) {
      effect.age += dt;
      if (effect.age >= effect.duration) effect.dead = true;
      if (!effect.dead) this._emitForEffect(effect, dt);
      this._updateStructures(effect, dt);
    }

    this.activeEffects = this.activeEffects.filter(e => !e.dead || e.age < e.duration + 1.2);
    this.particles.setForces({ wind: this._globalWind(), gravity: 0 });
    this.particles.update(dt);
    this.flashes = this.flashes.filter(f => (f.life -= dt) > 0);
    this.labels = this.labels.filter(l => (l.life -= dt) > 0);
  }

  _globalWind() {
    const wind = this.activeEffects.find(e => !e.dead && (e.element === 'wind' || e.element === 'firestorm' || e.element === 'storm'));
    return wind ? { x: wind.dir.x * 35 * wind.power, y: wind.dir.y * 18 * wind.power } : { x: 0, y: 0 };
  }

  _emitForEffect(effect, dt) {
    const rate = 55 + effect.power * 145;
    effect.emitAcc += rate * dt;
    while (effect.emitAcc >= 1) {
      this._emitElement(effect);
      effect.emitAcc -= 1;
    }
  }

  _emitElement(effect) {
    switch (effect.element) {
      case 'water': this._emitWater(effect); break;
      case 'fire': this._emitFire(effect); break;
      case 'wind': this._emitWind(effect); break;
      case 'earth': this._emitEarth(effect); break;
      case 'light': case 'lightdome': this._emitLight(effect); break;
      case 'plant': case 'bloom': this._emitPlant(effect); break;
      case 'barrier': this._emitBarrier(effect); break;
      case 'mist': this._emitSteam(effect); break;
      case 'firestorm': this._emitFirestorm(effect); break;
      case 'mud': this._emitMud(effect); break;
      case 'lava': this._emitLava(effect); break;
      case 'storm': this._emitStorm(effect); break;
      case 'prism': this._emitPrism(effect); break;
      default: this._emitFizzle(effect); break;
    }
  }

  _emitWater(e) {
    const angle = e.shape === 'fountain' ? -Math.PI / 2 : e.dir.angle;
    this.particles.emit({ count: 2, x: e.origin.x, y: e.origin.y, xJitter: 12, yJitter: 10,
      angle, spread: 0.35 + e.chaos * 0.9, speed: 180 + e.power * 260, speedJitter: 150,
      life: 0.75 + e.area / 420, lifeJitter: 0.45, size: 3 + e.power * 5, sizeJitter: 4,
      color: this._pick(e.palette), shape: Math.random() < 0.22 ? 'line' : 'circle', gravity: 260,
      drag: 0.985, turbulence: e.chaos * 55, glow: true });
  }

  _emitFire(e) {
    this.particles.emit({ count: 2, x: e.origin.x, y: e.origin.y, xJitter: 18, yJitter: 12,
      angle: e.shape === 'beam' ? e.dir.angle : -Math.PI / 2, spread: e.shape === 'beam' ? 0.4 + e.chaos : 1.2,
      speed: 130 + e.power * 260, speedJitter: 180, life: 0.55 + e.power * 0.7, lifeJitter: 0.4,
      size: 5 + e.power * 9, sizeJitter: 7, color: this._pick(e.palette.slice(0, 3)), shape: 'circle',
      gravity: -80, drag: 0.94, turbulence: 60 + e.chaos * 150, glow: true, additive: false });
    if (Math.random() < 0.32) this.particles.emit({ x: e.origin.x, y: e.origin.y, xJitter: 30, yJitter: 14,
      angle: -Math.PI / 2, spread: 0.8, speed: 55, speedJitter: 80, life: 1.2, size: 9, sizeJitter: 8,
      color: '#60606a', shape: 'smoke', gravity: -35, drag: 0.97, turbulence: 45, alpha: 0.45 });
  }

  _emitWind(e) {
    const offset = (Math.random() - 0.5) * e.area;
    this.particles.emit({ x: e.origin.x - e.dir.y * offset, y: e.origin.y + e.dir.x * offset,
      angle: e.dir.angle, spread: 0.25 + e.chaos * 0.75, speed: 160 + e.power * 320, speedJitter: 120,
      life: 0.65 + e.area / 380, lifeJitter: 0.35, size: 2.2 + e.power * 3, sizeJitter: 3,
      color: this._pick(e.palette), shape: Math.random() < 0.6 ? 'line' : 'leaf', drag: 0.985,
      turbulence: 80 + e.chaos * 120, alpha: 0.65, glow: true });
  }

  _emitEarth(e) {
    this.particles.emit({ x: e.origin.x, y: e.origin.y + 18, xJitter: e.area * 0.4, yJitter: 8,
      angle: -Math.PI / 2, spread: 1.1 + e.chaos, speed: 100 + e.power * 180, speedJitter: 130,
      life: 0.9, lifeJitter: 0.55, size: 4 + e.power * 8, sizeJitter: 7, color: this._pick(e.palette),
      shape: Math.random() < 0.55 ? 'shard' : 'smoke', gravity: 360, drag: 0.965, turbulence: e.chaos * 40 });
  }

  _emitLight(e) {
    this.particles.emit({ count: 2, x: e.origin.x, y: e.origin.y, xJitter: e.area * 0.2, yJitter: e.area * 0.2,
      angle: Math.random() * Math.PI * 2, spread: Math.PI * 2, speed: 45 + e.power * 160, speedJitter: 110,
      life: 0.7 + e.power, lifeJitter: 0.5, size: 3 + e.power * 8, sizeJitter: 6, color: this._pick(e.palette),
      shape: Math.random() < 0.28 ? 'rune' : 'spark', drag: 0.98, turbulence: e.chaos * 35, glow: true, additive: false });
  }

  _emitPlant(e) {
    this.particles.emit({ x: e.origin.x, y: e.origin.y, xJitter: e.area * 0.18, yJitter: 8,
      angle: e.dir.angle || -Math.PI / 2, spread: 0.8, speed: 55 + e.power * 110, speedJitter: 80,
      life: 1.2, lifeJitter: 0.8, size: 4 + e.power * 5, sizeJitter: 4, color: this._pick(e.palette),
      shape: e.element === 'bloom' && Math.random() < 0.35 ? 'flower' : 'leaf', gravity: -45, drag: 0.975, turbulence: 60, glow: false });
  }

  _emitPrism(e) {
    const colors = ['#8fd3ff', '#d9b9ff', '#ffe08a', '#f8f2d0'];
    this.particles.emit({ count: 2, x: e.origin.x, y: e.origin.y, xJitter: 10, yJitter: 10,
      angle: e.dir.angle, spread: 0.22 + e.chaos * 0.45, speed: 180 + e.power * 260, speedJitter: 90,
      life: 0.7 + e.power * 0.45, lifeJitter: 0.35, size: 2.4 + e.power * 4, sizeJitter: 3,
      color: this._pick(colors), shape: Math.random() < 0.55 ? 'line' : 'spark', drag: 0.985,
      turbulence: e.chaos * 45, glow: true, additive: false, alpha: 0.72 });
  }

  _emitBarrier(e) {
    const a = Math.random() * Math.PI * 2;
    const r = e.area * 0.55;
    this.particles.emit({ x: e.origin.x + Math.cos(a) * r, y: e.origin.y + Math.sin(a) * r,
      angle: a + Math.PI / 2, spread: 0.2, speed: 80, speedJitter: 50, life: 0.65, size: 3 + e.power * 4,
      color: this._pick(e.palette), shape: 'rune', drag: 0.97, glow: true, additive: false });
  }

  _emitSteam(e) {
    this.particles.emit({ count: 2, x: e.origin.x, y: e.origin.y, xJitter: e.area * 0.35, yJitter: 18,
      angle: -Math.PI / 2, spread: 1.15, speed: 45 + e.power * 95, speedJitter: 90, life: 1.5, lifeJitter: 1.1,
      size: 14 + e.power * 22, sizeJitter: 16, color: this._pick(e.palette), shape: 'smoke', gravity: -65,
      drag: 0.965, turbulence: 110, alpha: 0.55, glow: false });
  }

  _emitFirestorm(e) {
    const t = e.age * 8 + Math.random() * 0.8;
    const radius = (0.15 + Math.random() * 0.85) * e.area * 0.45;
    const x = e.origin.x + Math.cos(t) * radius;
    const y = e.origin.y + Math.sin(t) * radius * 0.55;
    this.particles.emit({ count: 3, x, y, angle: t + Math.PI / 2, spread: 0.5, speed: 170 + e.power * 280,
      speedJitter: 160, life: 0.7, lifeJitter: 0.55, size: 5 + e.power * 9, sizeJitter: 7,
      color: this._pick(e.palette), shape: Math.random() < 0.35 ? 'spark' : 'circle', gravity: -70,
      drag: 0.94, turbulence: 100 + e.chaos * 120, glow: true, additive: false });
  }

  _emitMud(e) {
    this.particles.emit({ x: e.origin.x, y: e.origin.y + 16, xJitter: e.area * 0.5, yJitter: 12,
      angle: -Math.PI / 2, spread: 1.6, speed: 75 + e.power * 110, speedJitter: 110, life: 1.1,
      lifeJitter: 0.7, size: 5 + e.power * 7, sizeJitter: 7, color: this._pick(e.palette),
      shape: Math.random() < 0.5 ? 'circle' : 'leaf', gravity: 280, drag: 0.95, turbulence: 45 });
  }

  _emitLava(e) {
    this.particles.emit({ x: e.origin.x, y: e.origin.y + 12, xJitter: e.area * 0.35, yJitter: 8,
      angle: -Math.PI / 2, spread: 0.9, speed: 95 + e.power * 160, speedJitter: 100, life: 0.9,
      lifeJitter: 0.55, size: 6 + e.power * 11, sizeJitter: 8, color: this._pick(e.palette),
      shape: Math.random() < 0.55 ? 'circle' : 'shard', gravity: 420, drag: 0.94, turbulence: 40,
      glow: true, additive: false });
  }

  _emitStorm(e) {
    this.particles.emit({ count: 2, x: e.origin.x - e.dir.x * e.area * 0.45, y: e.origin.y - e.area * 0.55,
      xJitter: e.area, yJitter: 10, angle: Math.atan2(1, e.dir.x * 0.8), spread: 0.18,
      speed: 290 + e.power * 260, speedJitter: 110, life: 0.55, lifeJitter: 0.25, size: 2.5,
      sizeJitter: 2, color: this._pick(e.palette), shape: 'line', gravity: 120, drag: 0.99,
      turbulence: 45, glow: true });
  }

  _emitFizzle(e) {
    this.particles.emit({ x: e.origin.x, y: e.origin.y, xJitter: 28, yJitter: 22, angle: -Math.PI / 2,
      spread: Math.PI * 2, speed: 40 + e.power * 100, speedJitter: 90, life: 0.8, lifeJitter: 0.7,
      size: 5 + e.power * 9, sizeJitter: 8, color: this._pick(PALETTES.unknown),
      shape: Math.random() < 0.35 ? 'spark' : 'smoke', gravity: -15, drag: 0.95, turbulence: 130,
      alpha: 0.75, glow: Math.random() < 0.25 });
  }

  _updateStructures(effect, dt) {
    for (const s of effect.structures) {
      s.t += dt;
      if (s.type === 'vine' && s.points.length < 22 && s.t > s.points.length * 0.055) {
        const last = s.points[s.points.length - 1];
        const bend = Math.sin(s.points.length * 1.3) * 0.55;
        const angle = s.dir.angle + bend;
        s.points.push({ x: last.x + Math.cos(angle) * 13, y: last.y + Math.sin(angle) * 13 });
      }
      if (s.type === 'shield') s.ripple = Math.sin(effect.age * 8) * 0.05;
    }
  }

  _draw() {
    const ctx = this.ctx;
    this._drawGameObjects(ctx, this.lastDt);
    this._drawFlashes(ctx);
    for (const effect of this.activeEffects) this._drawStructures(ctx, effect);
    this.particles.draw(ctx);
    this._drawLabels(ctx);
  }

  _drawGameObjects(ctx, dt) {
    for (const object of this.gameObjects) object.draw(ctx, dt);
  }

  _drawFlashes(ctx) {
    for (const f of this.flashes) {
      const t = f.life / f.maxLife;
      const r = f.r * (1.08 - t * 0.1);
      const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      grad.addColorStop(0, this._hexToRgba(f.color, 0.42));
      grad.addColorStop(0.35, 'rgba(255,246,214,0.16)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = t * 0.72;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  _drawStructures(ctx, effect) {
    const lifeT = Math.max(0, Math.min(1, 1 - effect.age / effect.duration));
    for (const s of effect.structures) {
      if (s.type === 'shield') this._drawShield(ctx, s, effect, lifeT);
      if (s.type === 'platform') this._drawPlatform(ctx, s, effect, lifeT);
      if (s.type === 'sphere') this._drawSphere(ctx, s, effect, lifeT);
      if (s.type === 'vortex') this._drawVortex(ctx, s, effect, lifeT);
      if (s.type === 'vine') this._drawVine(ctx, s, effect, lifeT);
    }
  }

  _drawShield(ctx, s, e, lifeT) {
    const r = s.radius * (1 + s.ripple);
    const baseY = s.origin.y + r * 0.26;
    ctx.save();
    ctx.globalAlpha = 0.68 * lifeT;
    ctx.globalCompositeOperation = 'source-over';

    const grad = ctx.createRadialGradient(s.origin.x, s.origin.y - r * 0.25, r * 0.12, s.origin.x, s.origin.y, r * 1.05);
    grad.addColorStop(0, this._hexToRgba(e.palette[2], 0.2));
    grad.addColorStop(0.55, this._hexToRgba(e.palette[0], 0.12));
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(s.origin.x, baseY, r, r * 0.82, 0, Math.PI, Math.PI * 2);
    ctx.lineTo(s.origin.x + r, baseY);
    ctx.lineTo(s.origin.x - r, baseY);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = e.palette[0];
    ctx.lineWidth = 3;
    ctx.shadowBlur = 10;
    ctx.shadowColor = e.palette[0];
    for (let ring = 0; ring < 3; ring++) {
      ctx.globalAlpha = (0.52 - ring * 0.12) * lifeT;
      ctx.beginPath();
      ctx.ellipse(s.origin.x, baseY, r * (1 - ring * 0.12), r * 0.82 * (1 - ring * 0.12), 0, Math.PI, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.45 * lifeT;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(s.origin.x - r, baseY);
    ctx.quadraticCurveTo(s.origin.x, baseY + r * 0.13, s.origin.x + r, baseY);
    ctx.stroke();

    ctx.globalAlpha = 0.23 * lifeT;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(s.origin.x + Math.cos(a) * r * 0.18, baseY + Math.sin(a) * r * 0.12);
      ctx.lineTo(s.origin.x + Math.cos(a) * r * 0.92, baseY + Math.sin(a) * r * 0.76);
      ctx.stroke();
    }

    if (s.cracks) {
      ctx.globalAlpha = 0.5 * lifeT;
      ctx.strokeStyle = '#d8b7d8';
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const a = Math.PI + i * 0.72 + e.age;
        ctx.beginPath();
        ctx.moveTo(s.origin.x + Math.cos(a) * r * 0.35, baseY + Math.sin(a) * r * 0.35);
        ctx.lineTo(s.origin.x + Math.cos(a + 0.1) * r * 0.88, baseY + Math.sin(a + 0.1) * r * 0.72);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  _drawPlatform(ctx, s, e, lifeT) {
    const grow = Math.min(1, e.age * 2.5);
    const h = s.height * grow;
    const y = s.origin.y + 28;
    ctx.save();
    ctx.globalAlpha = lifeT;
    const g = ctx.createLinearGradient(0, y - h, 0, y);
    g.addColorStop(0, e.palette[3] || e.palette[0]);
    g.addColorStop(1, e.palette[1]);
    ctx.fillStyle = g;
    ctx.strokeStyle = '#2f1f16';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.origin.x - s.width / 2, y);
    ctx.lineTo(s.origin.x - s.width / 2 + 18, y - h);
    ctx.lineTo(s.origin.x + s.width / 2 - 18, y - h);
    ctx.lineTo(s.origin.x + s.width / 2, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  _drawSphere(ctx, s, e, lifeT) {
    const pulse = 1 + Math.sin(e.age * 5) * 0.08;
    const r = s.radius * pulse;
    const grad = ctx.createRadialGradient(s.origin.x, s.origin.y, 0, s.origin.x, s.origin.y, r);
    grad.addColorStop(0, 'rgba(255,249,218,0.55)');
    grad.addColorStop(0.32, this._hexToRgba(e.palette[1], 0.58));
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.5 * lifeT;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(s.origin.x, s.origin.y, r, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2 + e.age;
      ctx.strokeStyle = e.palette[2] || e.palette[0];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(s.origin.x, s.origin.y);
      ctx.lineTo(s.origin.x + Math.cos(a) * r * 1.25, s.origin.y + Math.sin(a) * r * 1.25);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawVortex(ctx, s, e, lifeT) {
    ctx.save();
    ctx.globalAlpha = 0.3 * lifeT;
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = e.palette[0];
    ctx.shadowBlur = 9;
    ctx.shadowColor = e.palette[0];
    for (let arm = 0; arm < 4; arm++) {
      ctx.lineWidth = 2 + e.power * 3;
      ctx.beginPath();
      for (let i = 0; i < 42; i++) {
        const t = i / 42;
        const a = s.spin + arm * Math.PI / 2 + e.age * 3 + t * Math.PI * 2.3;
        const r = t * s.radius;
        const x = s.origin.x + Math.cos(a) * r;
        const y = s.origin.y + Math.sin(a) * r * 0.62;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawVine(ctx, s, e, lifeT) {
    if (s.points.length < 2) return;
    ctx.save();
    ctx.globalAlpha = lifeT;
    ctx.strokeStyle = e.palette[1] || e.palette[0];
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.shadowBlur = 8;
    ctx.shadowColor = e.palette[0];
    ctx.beginPath();
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
    ctx.stroke();
    for (let i = 2; i < s.points.length; i += 3) {
      const p = s.points[i];
      if (s.flowers && i % 6 === 0) {
        this._drawFlower(ctx, p.x, p.y, 7 + Math.sin(e.age + i) * 1.5, e.palette[3] || '#f5c6de', e.palette[2] || '#d98ab5');
      } else {
        ctx.fillStyle = i % 6 === 0 && s.blooms ? (e.palette[3] || '#d98ab5') : e.palette[0];
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 8, 4, i, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  _drawLabels(ctx) {
    for (const l of this.labels) {
      const t = l.life / l.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.min(1, t * 1.8);
      ctx.translate(l.x, l.y - (1 - t) * 36);
      ctx.font = 'bold 26px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(42, 20, 9, 0.82)';
      ctx.fillStyle = l.color;
      ctx.shadowBlur = 18;
      ctx.shadowColor = l.color;
      ctx.strokeText(l.text, 0, 0);
      ctx.fillText(l.text, 0, 0);
      ctx.restore();
    }
  }

  _drawFlower(ctx, x, y, radius, petalColor, coreColor) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = petalColor;
    for (let petal = 0; petal < 5; petal++) {
      const a = petal / 5 * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * radius * 0.55, Math.sin(a) * radius * 0.55, radius * 0.48, radius * 0.24, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = coreColor;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _hexToRgba(color, alpha) {
    if (!color || color[0] !== '#') return color;
    const hex = color.slice(1);
    const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
    const value = Number.parseInt(full, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  _pick(palette) {
    return palette[Math.floor(Math.random() * palette.length)];
  }

  clearAll() {
    this.particles.clear();
    this.activeEffects = [];
    this.labels = [];
    this.flashes = [];
  }
}
