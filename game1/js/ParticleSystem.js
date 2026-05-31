/**
 * ParticleSystem
 * Универсальная система частиц для всех визуальных эффектов.
 * Частицы имеют позицию, скорость, жизнь, цвет, размер, гравитацию.
 */
export class Particle {
  constructor(opts) {
    this.x = opts.x; this.y = opts.y;
    this.vx = opts.vx || 0; this.vy = opts.vy || 0;
    this.life = opts.life; this.maxLife = opts.life;
    this.size = opts.size || 3;
    this.color = opts.color || '#fff';
    this.gravity = opts.gravity || 0;
    this.friction = opts.friction ?? 0.99;
    this.shrink = opts.shrink ?? true;
    this.glow = opts.glow ?? true;
    this.shape = opts.shape || 'circle'; // circle | square | spark
    this.rot = Math.random() * Math.PI;
    this.rotSpeed = (Math.random() - 0.5) * 0.2;
  }

  update(dt) {
    this.vy += this.gravity * dt;
    this.vx *= this.friction;
    this.vy *= this.friction;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.rotSpeed;
    this.life -= dt;
    return this.life > 0;
  }

  draw(ctx) {
    const t = Math.max(0, this.life / this.maxLife);
    const sz = this.shrink ? this.size * t : this.size;
    ctx.globalAlpha = t;
    if (this.glow) { ctx.shadowBlur = sz * 2; ctx.shadowColor = this.color; }
    ctx.fillStyle = this.color;

    if (this.shape === 'square') {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);
      ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    } else if (this.shape === 'spark') {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(Math.atan2(this.vy, this.vx));
      ctx.fillRect(0, -sz / 4, sz * 2, sz / 2);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(this.x, this.y, sz, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
}

export class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  emit(opts) {
    this.particles.push(new Particle(opts));
  }

  update(dt) {
    this.particles = this.particles.filter(p => p.update(dt));
  }

  draw(ctx) {
    for (const p of this.particles) p.draw(ctx);
  }

  count() { return this.particles.length; }
  clear() { this.particles = []; }
}