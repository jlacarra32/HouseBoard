/**
 * ui-shared.js
 * Única responsabilidad: componentes de UI reutilizables entre módulos.
 */

/** Muestra un módulo y oculta el otro, actualizando los tabs de navegación. */
export function showModule(moduleId) {
  document.querySelectorAll('.module-section').forEach((section) => {
    section.hidden = section.id !== moduleId;
  });
  document.querySelectorAll('[data-module]').forEach((tab) => {
    const isActive = tab.dataset.module === moduleId;
    tab.classList.toggle('tab--active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
}

/** Actualiza el nombre visible del usuario en el header. */
export function setActiveUser(name) {
  const el = document.getElementById('header-username');
  if (el) el.textContent = name;
}

/** Cola de toasts pendientes para no solapar. */
let toastQueue = [];
let toastTimer = null;

/**
 * Muestra una notificación tipo toast.
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 */
export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  const icon = type === 'success' ? 'check-circle'
             : type === 'error'   ? 'alert-circle'
             : 'info';

  toast.innerHTML = `
    <i data-lucide="${icon}" class="toast__icon"></i>
    <span class="toast__message">${message}</span>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast--visible'));

  // Renderiza el ícono de Lucide recién insertado
  if (window.lucide) window.lucide.createIcons({ nodes: [toast] });

  setTimeout(() => {
    toast.classList.remove('toast--visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 2500);
}
