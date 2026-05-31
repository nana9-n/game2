/**
 * LevelManager
 * Хранит карту уровней, создаёт интерактивные объекты и сохраняет прогресс.
 */
import { createGameObject } from './GameObject.js';

const STORAGE_KEY = 'witch-hat-atelier-level-progress-v1';

export const LEVELS = [
  {
    id: 'campfire',
    title: 'Искра у костра',
    description: 'Зажги холодный костёр огненным знаком.',
    hint: 'Нарисуй круг + зигзаг огня. Направление не важно.',
    reward: 'Открыта работа с огнём.',
    objects: [{ id: 'campfire-1', type: 'campfire', x: 260, y: 215 }]
  },
  {
    id: 'dry-plant',
    title: 'Первый дождь',
    description: 'Оживи засохшее растение водой.',
    hint: 'Круг + волна воды. Чем ближе центр круга к растению, тем лучше.',
    reward: 'Открыто восстановление растений.',
    objects: [{ id: 'dry-plant-1', type: 'dryPlant', x: 260, y: 220 }]
  },
  {
    id: 'dark-cave',
    title: 'Свет в пещере',
    description: 'Освети тёмную пещеру световым знаком.',
    hint: 'Круг + звезда/лучи + точка фокуса помогут создать устойчивый свет.',
    reward: 'Открыто освещение сцен.',
    objects: [{ id: 'cave-1', type: 'darkRoom', x: 260, y: 215 }]
  },
  {
    id: 'seed',
    title: 'Семечко',
    description: 'Вырастить цветок: посадить, полить и дать свет.',
    hint: 'Последовательность: земля → вода → свет; либо единая схема земля + вода + свет для цветения.',
    reward: 'Открыта многошаговая цель.',
    objects: [{ id: 'seed-1', type: 'seed', x: 260, y: 240 }]
  },
  {
    id: 'ice-gate',
    title: 'Ледяная преграда',
    description: 'Растопи лёд, чтобы открыть путь.',
    hint: 'Подойдёт огонь, огненный вихрь или магма.',
    reward: 'Открыты реакции с препятствиями.',
    objects: [{ id: 'ice-1', type: 'ice', x: 260, y: 205 }]
  },
  {
    id: 'stone-bridge',
    title: 'Каменный мост',
    description: 'Построй платформу через разлом.',
    hint: 'Нужна земля со стрелкой вверх: круг + треугольник + стрелка вверх.',
    reward: 'Открыта точная форма заклинаний.',
    objects: [{ id: 'bridge-1', type: 'bridge', x: 260, y: 230 }]
  },
  {
    id: 'wildfire',
    title: 'Три очага',
    description: 'Потуши все очаги пожара.',
    hint: 'Вода работает по одному очагу, шторм и туман удобны для группы.',
    reward: 'Открыта работа с несколькими объектами.',
    objects: [
      { id: 'fire-1', type: 'firePatch', label: 'Очаг 1', x: 165, y: 220 },
      { id: 'fire-2', type: 'firePatch', label: 'Очаг 2', x: 260, y: 185 },
      { id: 'fire-3', type: 'firePatch', label: 'Очаг 3', x: 355, y: 230 }
    ]
  },
  {
    id: 'ancient-tree',
    title: 'Древо мастерской',
    description: 'Финальная загадка: вырасти древо и защити его барьером.',
    hint: 'Последовательность: земля → вода → свет → барьер. Комбинируй аккуратно.',
    reward: 'Финал: мастер чертёжной магии.',
    objects: [{ id: 'ancient-tree-1', type: 'ancientTree', x: 260, y: 250 }]
  }
];

export class LevelManager {
  constructor() {
    this.levels = LEVELS;
    this.index = 0;
    this.objects = [];
    this.completed = this._loadProgress();
  }

  loadSavedOrFirst() {
    const firstOpen = Math.min(this.completed.length, this.levels.length - 1);
    return this.loadLevel(firstOpen);
  }

  loadLevel(index = 0) {
    this.index = Math.max(0, Math.min(index, this.levels.length - 1));
    const level = this.currentLevel();
    this.objects = level.objects.map(config => createGameObject(config));
    return level;
  }

  currentLevel() {
    return this.levels[this.index];
  }

  checkWin() {
    return this.objects.length > 0 && this.objects.every(obj => obj.isComplete());
  }

  completeCurrent() {
    const level = this.currentLevel();
    if (!this.completed.includes(level.id)) {
      this.completed.push(level.id);
      this._saveProgress();
    }
  }

  nextLevel() {
    if (this.isLastLevel()) return this.currentLevel();
    return this.loadLevel(this.index + 1);
  }

  isLastLevel() {
    return this.index >= this.levels.length - 1;
  }

  reset() {
    return this.loadLevel(this.index);
  }

  getProgress() {
    const items = this.objects.flatMap(obj => obj.progressItems().map(item => ({
      ...item,
      objectId: obj.id,
      objectLabel: obj.label
    })));
    const total = items.length
      ? Math.round(items.reduce((sum, item) => sum + item.value, 0) / items.length)
      : 0;
    return { total, items };
  }

  isUnlocked(index) {
    return index === 0 || this.completed.includes(this.levels[index - 1]?.id);
  }

  isCompleted(index) {
    return this.completed.includes(this.levels[index]?.id);
  }

  _loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(id => this.levels.some(level => level.id === id)) : [];
    } catch {
      return [];
    }
  }

  _saveProgress() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.completed)); }
    catch {}
  }
}
