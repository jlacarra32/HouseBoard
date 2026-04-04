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

/**
 * Conecta el modal de edición de nombre de usuario.
 * @param {function} onNameChange - Callback(newName) llamado al guardar.
 */
export function bindUserEdit(onNameChange) {
  const openBtn  = document.getElementById('edit-name-btn');
  const modal    = document.getElementById('edit-name-modal');
  const input    = document.getElementById('edit-name-input');
  const saveBtn  = document.getElementById('edit-name-save');
  const closeBtn = document.getElementById('edit-name-close');

  if (!openBtn || !modal) return;

  function openModal() {
    input.value = localStorage.getItem('lrhome_user') || '';
    modal.hidden = false;
    // Renderiza iconos Lucide del modal
    if (window.lucide) window.lucide.createIcons({ nodes: [modal] });
    requestAnimationFrame(() => input.focus());
  }

  function closeModal() {
    modal.hidden = true;
  }

  function save() {
    const name = input.value.trim();
    if (!name) {
      input.focus();
      showToast('El nombre no puede estar vacío.', 'error');
      return;
    }
    if (name.length > 30) {
      showToast('El nombre no puede superar los 30 caracteres.', 'error');
      return;
    }
    localStorage.setItem('lrhome_user', name);
    setActiveUser(name);
    if (onNameChange) onNameChange(name);
    closeModal();
    showToast(`Nombre cambiado a "${name}" ✓`, 'success');
  }

  openBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  saveBtn.addEventListener('click', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') closeModal();
  });

  // Cerrar al pulsar fuera del card
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
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
