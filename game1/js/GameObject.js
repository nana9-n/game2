/**
 * GameObject
 * Интерактивные объекты для игрового режима. Объекты живут в координатах sceneCanvas,
 * рисуются каждый кадр и реагируют на SpellDescriptor без знания о UI.
 */
export class GameObject {
  constructor(config = {}) {
    this.id = config.id || `${config.type}-${Math.random().toString(36).slice(2)}`;
    this.type = config.type || 'object';
    this.label = config.label || 'Объект';
    this.x = config.x ?? 260;
    this.y = config.y ?? 220;
    this.radius = config.radius ?? 48;
    this.state = config.state || 'idle';
    this.completed = false;
    this.progress = 0;
    this.requirements = (config.requirements || []).map((req, index) => ({
      id: req.id || `${this.id}-req-${index}`,
      label: req.label || req.id || `Шаг ${index + 1}`,
      elements: req.elements || [],
      shapes: req.shapes || null,
      minPower: req.minPower || 0,
      amount: req.amount || 100,
      progress: req.progress || 0,
      state: req.state || this.state,
      message: req.message || 'Объект откликнулся на заклинание.',
      completeMessage: req.completeMessage || req.message || 'Шаг выполнен.'
    }));
    this.ordered = config.ordered ?? false;
    this.completeState = config.completeState || 'complete';
    this.pulse = 0;
    this.hitFlash = 0;
    this.wrongFlash = 0;
    this.message = '';
  }

  draw(ctx, dt = 0.016) {
    this.pulse += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 1.8);
    this.wrongFlash = Math.max(0, this.wrongFlash - dt * 1.8);
    this._drawBase(ctx, this._accent());
  }

  applySpell(spell) {
    if (this.completed) {
      return { affected: false, message: `${this.label}: уже выполнено.` };
    }

    const req = this._nextRequirement(spell);
    if (!req) {
      this.wrongFlash = 1;
      const expected = this._expectedText();
      return { affected: false, message: `${this.label}: нужно ${expected}.` };
    }

    const gain = this._spellGain(spell, req);
    req.progress = Math.min(req.amount, req.progress + gain);
    this.hitFlash = 1;
    this.state = req.state;
    this._afterRequirementProgress(req, spell);

    if (req.progress >= req.amount) {
      this._afterRequirementComplete(req, spell);
    }

    this.completed = this.isComplete();
    if (this.completed) {
      this.state = this.completeState;
      this.progress = 100;
      return { affected: true, completed: true, message: `${this.label}: ${req.completeMessage}` };
    }

    this.progress = this._totalProgress();
    return { affected: true, completed: false, message: `${this.label}: ${req.message}` };
  }

  isComplete() {
    return this.requirements.length > 0 && this.requirements.every(req => req.progress >= req.amount);
  }

  progressItems() {
    return this.requirements.map(req => ({
      id: req.id,
      label: req.label,
      value: Math.round(Math.min(100, req.progress / req.amount * 100)),
      done: req.progress >= req.amount
    }));
  }

  _nextRequirement(spell) {
    if (this.ordered) {
      const req = this.requirements.find(item => item.progress < item.amount);
      return req && this._matches(req, spell) ? req : null;
    }
    return this.requirements.find(req => req.progress < req.amount && this._matches(req, spell));
  }

  _matches(req, spell) {
    const elementOk = req.elements.includes(spell.element) || (spell.combo && req.elements.includes(spell.combo));
    const shapeOk = !req.shapes || req.shapes.includes(spell.shape);
    // req.minPower может быть undefined у требований, заданных «сырыми»
    // литералами (напр. AncientTreeObject) — иначе сравнение даёт NaN→false
    // и уровень становится непроходимым.
    const powerOk = (spell.power || 0) >= (req.minPower || 0);
    return elementOk && shapeOk && powerOk;
  }

  _spellGain(spell, req) {
    // Одно правильно нарисованное и активированное заклинание полностью
    // выполняет шаг требования — уровень засчитывается с первой верной попытки.
    return req.amount;
  }

  _afterRequirementProgress(req, spell) {}

  _afterRequirementComplete(req, spell) {}

  _totalProgress() {
    if (!this.requirements.length) return this.completed ? 100 : 0;
    const total = this.requirements.reduce((sum, req) => sum + Math.min(1, req.progress / req.amount), 0);
    return Math.round(total / this.requirements.length * 100);
  }

  _expectedText() {
    const req = this.ordered
      ? this.requirements.find(item => item.progress < item.amount)
      : this.requirements.find(item => item.progress < item.amount);
    if (!req) return 'другое воздействие';
    return req.label.toLowerCase();
  }

  _accent() {
    if (this.completed) return '#a6e6a0';
    if (this.hitFlash > 0) return '#ffd27a';
    if (this.wrongFlash > 0) return '#e8896a';
    return '#c9a36a';
  }

  _drawBase(ctx, accent) {
    ctx.save();
    ctx.translate(this.x, this.y);

    // Тень-подставка на земле
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = 'rgba(18, 11, 5, 0.9)';
    ctx.beginPath();
    ctx.ellipse(0, this.radius * 0.82, this.radius * 0.88, this.radius * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();

    // Мягкий тёплый ореол
    const glow = this.completed ? 0.5 : 0.26 + this.hitFlash * 0.42;
    const r = this.radius * (0.95 + Math.sin(this.pulse * 3) * 0.02);
    const grad = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.28);
    grad.addColorStop(0, this._rgba(accent, glow));
    grad.addColorStop(1, this._rgba(accent, 0));
    ctx.globalAlpha = 1;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.28, 0, Math.PI * 2);
    ctx.fill();

    // Контурное кольцо-подиум
    ctx.globalAlpha = 0.45 + this.hitFlash * 0.4;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    // Подпись с обводкой — читается на тёмной сцене
    ctx.globalAlpha = 1;
    ctx.font = '600 13px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(26, 16, 8, 0.85)';
    ctx.fillStyle = '#f3e6c8';
    ctx.strokeText(this.label, 0, this.radius + 22);
    ctx.fillText(this.label, 0, this.radius + 22);
    ctx.restore();
  }

  _rgba(hex, a) {
    if (!hex || hex[0] !== '#') return hex;
    const h = hex.slice(1);
    const f = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const n = Number.parseInt(f, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
}

export class SeedObject extends GameObject {
  constructor(config = {}) {
    super({
      type: 'seed',
      label: 'Семечко',
      state: 'seed',
      completeState: 'bloom',
      ordered: true,
      radius: 46,
      requirements: [
        { id: 'earth', label: 'Земля: посадить', elements: ['earth'], state: 'planted', message: 'семечко укрыто землёй', completeMessage: 'семечко посажено' },
        { id: 'water', label: 'Вода: полить', elements: ['water', 'mist', 'storm'], state: 'sprout', message: 'росток напился воды', completeMessage: 'появился росток' },
        { id: 'light', label: 'Свет: согреть', elements: ['light', 'lightdome', 'prism'], state: 'bloom', message: 'лепестки раскрываются', completeMessage: 'цветок распустился' }
      ],
      ...config
    });
  }

  applySpell(spell) {
    if (spell.element === 'bloom' && !this.completed) {
      for (const req of this.requirements) req.progress = req.amount;
      this.state = this.completeState;
      this.completed = true;
      this.progress = 100;
      this.hitFlash = 1;
      return { affected: true, completed: true, message: `${this.label}: цветение собрало землю, воду и свет в один рост.` };
    }
    return super.applySpell(spell);
  }

  draw(ctx, dt) {
    super.draw(ctx, dt);
    const earth = this.requirements[0].progress / this.requirements[0].amount;
    const water = this.requirements[1].progress / this.requirements[1].amount;
    const light = this.requirements[2].progress / this.requirements[2].amount;
    const growth = Math.min(1, (earth + water + light) / 3);

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = '#3a2a20';
    ctx.beginPath();
    ctx.ellipse(0, 30, 45, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#73d68b';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 24);
    ctx.quadraticCurveTo(-10, 4 - growth * 35, 0, 24 - growth * 80);
    ctx.stroke();

    ctx.fillStyle = earth > 0.05 ? '#73d68b' : '#b0845a';
    ctx.beginPath();
    ctx.ellipse(0, 28 - growth * 5, 14, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    if (water > 0.25) {
      ctx.fillStyle = '#73d68b';
      ctx.beginPath();
      ctx.ellipse(-15, 6 - growth * 45, 16, 7, -0.45, 0, Math.PI * 2);
      ctx.ellipse(14, -2 - growth * 48, 15, 7, 0.55, 0, Math.PI * 2);
      ctx.fill();
    }

    if (light > 0.45 || this.completed) this._drawFlower(ctx, 0, -58, 15 + light * 6);
    ctx.restore();
  }

  _drawFlower(ctx, x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#eeb7d4';
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.42, r * 0.22, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#f2cf75';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.23, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export class CampfireObject extends GameObject {
  constructor(config = {}) {
    super({ type: 'campfire', label: 'Костёр', state: 'cold', completeState: 'lit', radius: 44,
      requirements: [{ id: 'fire', label: 'Огонь: зажечь', elements: ['fire', 'firestorm', 'lava'], state: 'lit', completeMessage: 'костёр загорелся' }], ...config });
  }

  draw(ctx, dt) {
    super.draw(ctx, dt);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.strokeStyle = '#7c5a3e'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-28, 24); ctx.lineTo(24, 6); ctx.moveTo(28, 24); ctx.lineTo(-22, 6); ctx.stroke();
    if (this.completed || this.hitFlash > 0) {
      const flame = 30 + Math.sin(this.pulse * 8) * 4;
      ctx.fillStyle = '#ffad66'; ctx.beginPath(); ctx.ellipse(0, -10, 18, flame, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe28a'; ctx.beginPath(); ctx.ellipse(0, -5, 9, flame * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

export class DryPlantObject extends GameObject {
  constructor(config = {}) {
    super({ type: 'dryPlant', label: 'Сухое растение', state: 'dry', completeState: 'fresh', radius: 44,
      requirements: [{ id: 'water', label: 'Вода: полить', elements: ['water', 'mist', 'storm'], state: 'fresh', completeMessage: 'растение ожило' }], ...config });
  }

  draw(ctx, dt) {
    super.draw(ctx, dt);
    ctx.save(); ctx.translate(this.x, this.y);
    const alive = this.completed || this.hitFlash > 0;
    ctx.strokeStyle = alive ? '#75d18c' : '#94725b'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 28); ctx.lineTo(0, -22); ctx.moveTo(0, -5); ctx.lineTo(-22, -20); ctx.moveTo(0, 2); ctx.lineTo(20, -14); ctx.stroke();
    ctx.fillStyle = alive ? '#75d18c' : '#8a6a55';
    ctx.beginPath(); ctx.ellipse(-24, -20, 12, 6, -0.4, 0, Math.PI * 2); ctx.ellipse(22, -14, 12, 6, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

export class DarkRoomObject extends GameObject {
  constructor(config = {}) {
    super({ type: 'darkRoom', label: 'Пещера', state: 'dark', completeState: 'lit', radius: 58,
      requirements: [{ id: 'light', label: 'Свет: осветить', elements: ['light', 'lightdome', 'prism'], state: 'lit', completeMessage: 'пещера освещена' }], ...config });
  }

  draw(ctx, dt) {
    super.draw(ctx, dt);
    ctx.save(); ctx.translate(this.x, this.y);
    ctx.fillStyle = this.completed ? '#31394a' : '#10131a';
    ctx.beginPath(); ctx.arc(0, 0, 48, Math.PI, 0); ctx.lineTo(48, 34); ctx.lineTo(-48, 34); ctx.closePath(); ctx.fill();
    if (this.completed || this.hitFlash > 0) {
      const g = ctx.createRadialGradient(0, 4, 0, 0, 4, 56);
      g.addColorStop(0, 'rgba(245,213,128,0.8)'); g.addColorStop(1, 'rgba(245,213,128,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 4, 56, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

export class IceBarrierObject extends GameObject {
  constructor(config = {}) {
    super({ type: 'ice', label: 'Лёд', state: 'frozen', completeState: 'melted', radius: 48,
      requirements: [{ id: 'heat', label: 'Огонь: растопить', elements: ['fire', 'firestorm', 'lava'], state: 'melting', amount: 120, completeMessage: 'лёд растаял' }], ...config });
  }

  draw(ctx, dt) {
    super.draw(ctx, dt);
    ctx.save(); ctx.translate(this.x, this.y);
    const melt = this.requirements[0].progress / this.requirements[0].amount;
    ctx.globalAlpha = 1 - melt * 0.55;
    ctx.fillStyle = '#9bd8ff'; ctx.strokeStyle = '#d4efff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -48); ctx.lineTo(34, -12); ctx.lineTo(24, 36); ctx.lineTo(-28, 38); ctx.lineTo(-38, -10); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;
    if (melt > 0.25) { ctx.fillStyle = 'rgba(127,204,255,.35)'; ctx.fillRect(-35, 30, 70, 8); }
    ctx.restore();
  }
}

export class StoneBridgeObject extends GameObject {
  constructor(config = {}) {
    super({ type: 'bridge', label: 'Разлом', state: 'gap', completeState: 'bridge', radius: 62,
      requirements: [{ id: 'platform', label: 'Земля-платформа', elements: ['earth'], shapes: ['platform'], state: 'bridge', amount: 120, completeMessage: 'мост построен' }], ...config });
  }

  draw(ctx, dt) {
    super.draw(ctx, dt);
    ctx.save(); ctx.translate(this.x, this.y);
    ctx.fillStyle = '#11151c'; ctx.fillRect(-70, 8, 140, 42);
    const built = this.requirements[0].progress / this.requirements[0].amount;
    ctx.fillStyle = '#8d8171'; ctx.fillRect(-62, 2, 124 * built, 22);
    ctx.restore();
  }
}

export class FirePatchObject extends GameObject {
  constructor(config = {}) {
    super({ type: 'firePatch', label: config.label || 'Очаг', state: 'burning', completeState: 'out', radius: 38,
      requirements: [{ id: 'water', label: 'Вода: потушить', elements: ['water', 'mist', 'storm'], state: 'steam', amount: 100, completeMessage: 'очаг потушен' }], ...config });
  }

  draw(ctx, dt) {
    super.draw(ctx, dt);
    ctx.save(); ctx.translate(this.x, this.y);
    if (!this.completed) {
      ctx.fillStyle = '#ff8c5a'; ctx.beginPath(); ctx.ellipse(0, 0, 17, 32 + Math.sin(this.pulse * 9) * 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd47a'; ctx.beginPath(); ctx.ellipse(0, 5, 9, 18, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(180,190,200,.35)'; ctx.beginPath(); ctx.ellipse(0, 14, 28, 10, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

export class WindStoneObject extends GameObject {
  constructor(config = {}) {
    super({ type: 'stone', label: 'Камень', state: 'heavy', completeState: 'moved', radius: 46,
      requirements: [{ id: 'move', label: 'Ветер или земля', elements: ['wind', 'earth'], state: 'moved', completeMessage: 'камень убран' }], ...config });
  }

  draw(ctx, dt) {
    super.draw(ctx, dt);
    const shift = this.completed ? 34 : 0;
    ctx.save(); ctx.translate(this.x + shift, this.y);
    ctx.fillStyle = '#777f8d'; ctx.beginPath(); ctx.ellipse(0, 8, 36, 28, -0.12, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.stroke();
    ctx.restore();
  }
}

export class AncientTreeObject extends SeedObject {
  constructor(config = {}) {
    super({ ...config, id: config.id || 'ancient-tree', label: 'Древо', radius: 58 });
    this.requirements = [
      { id: 'earth', label: 'Земля: корни', elements: ['earth'], amount: 100, progress: 0, state: 'planted', message: 'корни нашли почву', completeMessage: 'корни закрепились' },
      { id: 'water', label: 'Вода: соки', elements: ['water', 'mist', 'storm'], amount: 100, progress: 0, state: 'sprout', message: 'ствол наполняется соком', completeMessage: 'дерево напилось' },
      { id: 'light', label: 'Свет: крона', elements: ['light', 'lightdome', 'prism'], amount: 100, progress: 0, state: 'bloom', message: 'крона светится', completeMessage: 'крона раскрылась' },
      { id: 'barrier', label: 'Барьер: защитить', elements: ['barrier', 'lightdome'], amount: 100, progress: 0, state: 'bloom', message: 'ветер больше не ломает ветви', completeMessage: 'дерево защищено' }
    ];
    this.completeState = 'ancient';
  }

  draw(ctx, dt) {
    super.draw(ctx, dt);
    if (!this.completed) return;
    ctx.save(); ctx.translate(this.x, this.y - 58);
    ctx.strokeStyle = 'rgba(143,183,255,.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 82 + Math.sin(this.pulse * 2) * 4, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

export class FogObject extends GameObject {
  constructor(config = {}) {
    super({ type: 'fog', label: 'Туман', state: 'thick', completeState: 'clear', radius: 58,
      requirements: [{ id: 'wind', label: 'Ветер: развеять', elements: ['wind', 'storm', 'firestorm'], state: 'clearing', amount: 100, completeMessage: 'туман рассеялся' }], ...config });
  }

  draw(ctx, dt) {
    super.draw(ctx, dt);
    ctx.save(); ctx.translate(this.x, this.y);
    const dens = this.completed ? 0.12 : 0.6 - this.hitFlash * 0.25;
    ctx.globalAlpha = Math.max(0.08, dens);
    ctx.fillStyle = '#e3e9ec';
    for (let i = 0; i < 5; i++) {
      const a = this.pulse * 0.5 + i * 1.3;
      const px = Math.cos(a) * 20 + (i - 2) * 15;
      const py = Math.sin(a * 0.8) * 9;
      ctx.beginPath(); ctx.ellipse(px, py, 23, 13, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

export class WaterWheelObject extends GameObject {
  constructor(config = {}) {
    super({ type: 'waterWheel', label: 'Мельница', state: 'still', completeState: 'spinning', radius: 50,
      requirements: [{ id: 'flow', label: 'Вода: запустить', elements: ['water', 'storm', 'mist'], state: 'spinning', amount: 100, completeMessage: 'колесо завертелось' }], ...config });
    this.spin = 0;
  }

  draw(ctx, dt) {
    super.draw(ctx, dt);
    if (this.completed) this.spin += dt * 3.2;
    else if (this.hitFlash > 0) this.spin += dt * 1.1;
    ctx.save(); ctx.translate(this.x, this.y);
    ctx.rotate(this.spin);
    ctx.strokeStyle = this.completed ? '#b58a4f' : '#9a7b4f';
    ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 34, Math.sin(a) * 34); ctx.stroke();
      ctx.save();
      ctx.translate(Math.cos(a) * 34, Math.sin(a) * 34); ctx.rotate(a);
      ctx.fillStyle = '#7c5a3a';
      ctx.fillRect(-6, -3, 12, 11);
      ctx.restore();
    }
    ctx.restore();
  }
}

export function createGameObject(config) {
  const map = {
    seed: SeedObject,
    campfire: CampfireObject,
    dryPlant: DryPlantObject,
    darkRoom: DarkRoomObject,
    ice: IceBarrierObject,
    bridge: StoneBridgeObject,
    firePatch: FirePatchObject,
    stone: WindStoneObject,
    fog: FogObject,
    waterWheel: WaterWheelObject,
    ancientTree: AncientTreeObject
  };
  const Ctor = map[config.type] || GameObject;
  return new Ctor(config);
}
