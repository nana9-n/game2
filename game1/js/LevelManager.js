/**
 * LevelManager
 * Хранит карту уровней, создаёт интерактивные объекты и сохраняет прогресс.
 */
import { createGameObject } from './GameObject.js?v=20260601a';

const STORAGE_KEY = 'witch-hat-atelier-level-progress-v1';

export const LEVELS = [
  {
    id: 'campfire',
    title: 'Искра у костра',
    description: 'Зажги холодный костёр.',
    hint: 'Костру нужно тепло. Нарисуй круг активации и знак огня (зигзаг) внутри — направление не важно.',
    reward: 'Открыта работа с огнём.',
    objects: [{ id: 'campfire-1', type: 'campfire', x: 260, y: 215 }]
  },
  {
    id: 'dry-plant',
    title: 'Первый дождь',
    description: 'Оживи засохшее растение.',
    hint: 'Растению не хватает влаги. Круг + знак воды (волна); целься центром круга в растение.',
    reward: 'Открыто восстановление растений.',
    objects: [{ id: 'dry-plant-1', type: 'dryPlant', x: 260, y: 220 }]
  },
  {
    id: 'dark-cave',
    title: 'Свет в пещере',
    description: 'Освети тёмную пещеру.',
    hint: 'Темноту разгоняет свет. Круг + звезда/лучи, а точка фокуса делает свет устойчивее.',
    reward: 'Открыто освещение сцен.',
    objects: [{ id: 'cave-1', type: 'darkRoom', x: 260, y: 215 }]
  },
  {
    id: 'seed',
    title: 'Семечко',
    description: 'Вырасти цветок из семечка.',
    hint: 'Три шага по порядку: земля → вода → свет. Либо единая схема земля + вода + свет для мгновенного цветения.',
    reward: 'Открыта многошаговая цель.',
    objects: [{ id: 'seed-1', type: 'seed', x: 260, y: 240 }]
  },
  {
    id: 'ice-gate',
    title: 'Ледяная преграда',
    description: 'Растопи лёд и открой путь.',
    hint: 'Лёд боится жара — подойдёт огонь, огненный вихрь или магма.',
    reward: 'Открыты реакции с препятствиями.',
    objects: [{ id: 'ice-1', type: 'ice', x: 260, y: 205 }]
  },
  {
    id: 'stone-bridge',
    title: 'Каменный мост',
    description: 'Перекинь мост через разлом.',
    hint: 'Нужна каменная платформа: круг + треугольник земли + стрелка вверх.',
    reward: 'Открыта точная форма заклинаний.',
    objects: [{ id: 'bridge-1', type: 'bridge', x: 260, y: 230 }]
  },
  {
    id: 'wildfire',
    title: 'Три очага',
    description: 'Потуши все очаги пожара.',
    hint: 'Вода тушит по одному очагу; шторм или туман удобнее накрывают сразу группу.',
    reward: 'Открыта работа с несколькими объектами.',
    objects: [
      { id: 'fire-1', type: 'firePatch', label: 'Очаг 1', x: 165, y: 220 },
      { id: 'fire-2', type: 'firePatch', label: 'Очаг 2', x: 260, y: 185 },
      { id: 'fire-3', type: 'firePatch', label: 'Очаг 3', x: 355, y: 230 }
    ]
  },
  {
    id: 'rolling-stone',
    title: 'Валун на тропе',
    description: 'Убери валун с тропы.',
    hint: 'Тяжёлый камень сдвигают порывом ветра или толчком земли.',
    reward: 'Открыта работа с силой потока.',
    objects: [{ id: 'stone-1', type: 'stone', x: 240, y: 220 }]
  },
  {
    id: 'foggy-marsh',
    title: 'Туманное болото',
    description: 'Развей густой туман.',
    hint: 'Туман уносит ветер. Шторм и огненный вихрь тоже создают сильный поток.',
    reward: 'Открыто управление погодой.',
    objects: [{ id: 'fog-1', type: 'fog', x: 260, y: 210 }]
  },
  {
    id: 'water-mill',
    title: 'Водяная мельница',
    description: 'Запусти водяную мельницу.',
    hint: 'Колесо вращает поток воды — лей воду, шторм или пар на колесо.',
    reward: 'Открыта механика потоков.',
    objects: [{ id: 'mill-1', type: 'waterWheel', x: 260, y: 210 }]
  },
  {
    id: 'ancient-tree',
    title: 'Древо мастерской',
    description: 'Вырасти и защити древо мастерской.',
    hint: 'Четыре шага по порядку: земля → вода → свет → барьер.',
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
    const items = this.objects.flatMap(obj => {
      const reqItems = obj.progressItems();
      return reqItems.map((item, index) => ({
        ...item,
        objectId: obj.id,
        objectLabel: obj.label,
        stepIndex: index,
        stepCount: reqItems.length
      }));
    });
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
