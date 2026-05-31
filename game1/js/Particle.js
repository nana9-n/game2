/**
 * Particle.js
 * Современная система частиц для магических эффектов: пул объектов,
 * глобальные силы, турбулентность, свечение и разные формы частиц.
 */
export class Particle {
  constructor() {
    this.active = false;
  }

  reset(config) {
    this.active = true;
    this.x = config.x || 0;
    this.y = config.y || 0;
    this.prevX = this.x;
    this.prevY = this.y;
    this.vx = config.vx || 0;
    this.vy = config.vy || 0;
    this.ax = config.ax || 0;
    this.ay = config.ay || 0;
    this.life = config.life || 1;
    this.maxLife = this.life;
    this.size = config.size || 4;
    this.endSize = config.endSize ?? 0;
    this.color = config.color || '#fff';
    this.alpha = config.alpha ?? 1;
    this.gravity = config.gravity || 0;
    this.drag = config.drag ?? 0.985;
    this.turbulence = config.turbulence || 0;
    this.shape = config.shape || 'circle';
    this.glow = config.glow ?? false;
    this.additive = config.additive ?? this.glow;
    this.rotation = config.rotation ?? Math.random() * Math.PI * 2;
    this.rotationSpeed = config.rotationSpeed ?? (Math.random() - 0.5) * 4;
    this.length = config.length || this.size * 4;
    this.seed = Math.random() * 1000;
    return this;
  }

  update(dt, forces = {}) {
    if (!this.active) return false;

    this.prevX = this.x;
    this.prevY = this.y;

    const age = 1 - this.life / this.maxLife;
    const wobble = this.turbulence * Math.sin(this.seed + age * Math.PI * 8);
    const wind = forces.wind || { x: 0, y: 0 };

    this.vx += (this.ax + wind.x + wobble) * dt;
    this.vy += (this.ay + wind.y + this.gravity + wobble * 0.35) * dt;

    const drag = Math.pow(this.drag, dt * 60);
    this.vx *= drag;
    this.vy *= drag;

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rotation += this.rotationSpeed * dt;
    this.life -= dt;

    if (this.life <= 0) this.active = false;
    return this.active;
  }

  draw(ctx) {
    if (!this.active) return;

    const t = Math.max(0, this.life / this.maxLife);
    const fade = this._easeOut(t);
    const size = Math.max(0.1, this.endSize + (this.size - this.endSize) * fade);
    const alpha = this.alpha * Math.min(1, fade * 1.35);

    ctx.save();
    ctx.globalAlpha *= alpha;
    if (this.additive) ctx.globalCompositeOperation = 'lighter';
    if (this.glow) {
      ctx.shadowBlur = size * 3.5;
      ctx.shadowColor = this.color;
    }

    ctx.fillStyle = this.color;
    ctx.strokeStyle = this.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (this.shape) {
      case 'spark':
        this._drawSpark(ctx, size);
        break;
      case 'line':
        this._drawLine(ctx, size);
        break;
      case 'smoke':
        this._drawSmoke(ctx, size, fade);
        break;
      case 'leaf':
        this._drawLeaf(ctx, size);
        break;
      case 'flower':
        this._drawFlower(ctx, size);
        break;
      case 'shard':
        this._drawShard(ctx, size);
        break;
      case 'rune':
        this._drawRune(ctx, size);
        break;
      default:
        ctx.beginPath();
        ctx.arc(this.x, this.y, size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
  }

  _drawSpark(ctx, size) {
    const angle = Math.atan2(this.vy, this.vx);
    const len = Math.max(this.length, size * 5);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(angle);
    ctx.lineWidth = Math.max(1, size * 0.45);
    ctx.beginPath();
    ctx.moveTo(-len * 0.25, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();
    ctx.restore();
  }

  _drawLine(ctx, size) {
    ctx.lineWidth = Math.max(1, size * 0.5);
    ctx.beginPath();
    ctx.moveTo(this.prevX, this.prevY);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();
  }

  _drawSmoke(ctx, size, fade) {
    const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, size * 2.2);
    grad.addColorStop(0, this.color);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha *= 0.45 + 0.25 * fade;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.x, this.y, size * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawLeaf(ctx, size) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 1.7, size * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawFlower(ctx, size) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * size, Math.sin(a) * size, size * 0.75, size * 0.38, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#f1c66a';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawShard(ctx, size) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.beginPath();
    ctx.moveTo(0, -size * 1.8);
    ctx.lineTo(size * 1.25, size);
    ctx.lineTo(-size * 1.1, size * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _drawRune(ctx, size) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.lineWidth = Math.max(1, size * 0.25);
    ctx.beginPath();
    ctx.arc(0, 0, size * 1.2, 0, Math.PI * 2);
    ctx.moveTo(-size, 0);
    ctx.lineTo(size, 0);
    ctx.moveTo(0, -size);
    ctx.lineTo(0, size);
    ctx.stroke();
    ctx.restore();
  }

  _easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }
}

export class ParticleSystem {
  constructor(maxParticles = 1000) {
    this.maxParticles = maxParticles;
    this.particles = [];
    this.pool = [];
    this.wind = { x: 0, y: 0 };
    this.gravity = 0;
  }

  setForces({ wind, gravity } = {}) {
    if (wind) this.wind = wind;
    if (typeof gravity === 'number') this.gravity = gravity;
  }

  emit(config = {}) {
    const count = Math.max(1, Math.floor(config.count || 1));
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) {
        const old = this.particles.shift();
        old.active = false;
        this.pool.push(old);
      }

      const angle = (config.angle ?? Math.random() * Math.PI * 2) +
        (Math.random() - 0.5) * (config.spread ?? Math.PI * 2);
      const speed = this._range(config.speed ?? 0, config.speedJitter ?? 0);
      const particle = this.pool.pop() || new Particle();
      particle.reset({
        ...config,
        vx: (config.vx || 0) + Math.cos(angle) * speed,
        vy: (config.vy || 0) + Math.sin(angle) * speed,
        x: this._range(config.x || 0, config.xJitter || 0),
        y: this._range(config.y || 0, config.yJitter || 0),
        life: this._range(config.life || 1, config.lifeJitter || 0),
        size: this._range(config.size || 4, config.sizeJitter || 0),
        gravity: (config.gravity || 0) + this.gravity
      });
      this.particles.push(particle);
    }
  }

  update(dt) {
    const forces = { wind: this.wind };
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      if (!particle.update(dt, forces)) {
        this.particles.splice(i, 1);
        this.pool.push(particle);
      }
    }
  }

  draw(ctx) {
    for (const particle of this.particles) particle.draw(ctx);
  }

  count() {
    return this.particles.length;
  }

  clear() {
    for (const particle of this.particles) {
      particle.active = false;
      this.pool.push(particle);
    }
    this.particles.length = 0;
  }

  _range(value, jitter) {
    return value + (Math.random() - 0.5) * jitter;
  }
}
