/**
 * main.js
 * Точка входа. Инициализирует UIController после загрузки DOM.
 */
import { UIController } from './UIController.js';

window.addEventListener('DOMContentLoaded', () => {
  const app = new UIController();
  // Делаем доступным в консоли для отладки
  window.__atelier = app;
  console.log('%c🎩 Witch Hat Atelier — чертёжная магия загружена.',
    'color:#a48fff; font-weight:bold');
});