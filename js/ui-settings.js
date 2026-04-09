import { db } from './firebase-config.js';
import {
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  arrayRemove,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { setActiveUser, showToast, showCustomPrompt } from './ui-shared.js';
import { getHomesForUser, createHome, joinHome } from './db-homes.js';

const getHomeRef = () => doc(db, 'homes', localStorage.getItem('lrhome_homeId'));
const getShoppingConfigRef = () => doc(db, 'homes', localStorage.getItem('lrhome_homeId'), 'config', 'shopping');
const getCurrentMemberRef = () => doc(
  db,
  'homes',
  localStorage.getItem('lrhome_homeId'),
  'members',
  localStorage.getItem('lrhome_user'),
);

const DEFAULT_NOTIFICATION_PREFS = {
  itemAdded: true,
  itemBought: true,
  taskAdded: true,
  taskDone: true,
};

const NOTIFICATION_PREF_OPTIONS = [
  { key: 'itemAdded', label: 'Alguien añade un item a la compra', captionOn: 'Activadas', captionOff: 'Silenciadas' },
  { key: 'itemBought', label: 'Alguien marca items como comprados', captionOn: 'Activadas', captionOff: 'Silenciadas' },
  { key: 'taskAdded', label: 'Alguien añade una tarea', captionOn: 'Activadas', captionOff: 'Silenciadas' },
  { key: 'taskDone', label: 'Alguien completa tareas', captionOn: 'Activadas', captionOff: 'Silenciadas' },
];

export let shoppingCategories = [
  'Comida', 'Fruta y verdura', 'Lácteos', 'Carnicería', 'Panadería',
  'Limpieza', 'Higiene', 'Bebidas', 'Otros',
];

export let taskMembers = [];
const categoriesListeners = [];
const membersListeners = [];
let notificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS };
let currentSettingsView = 'main';

export function onShoppingCategoriesChange(cb) { categoriesListeners.push(cb); }
export function onTaskMembersChange(cb) { membersListeners.push(cb); }

function notifyCategories() { categoriesListeners.forEach((cb) => cb([...shoppingCategories])); }
function notifyMembers() { membersListeners.forEach((cb) => cb([...taskMembers])); }

function normalizeNotificationPrefs(value) {
  return { ...DEFAULT_NOTIFICATION_PREFS, ...(value || {}) };
}

function setSettingsView(view) {
  currentSettingsView = view;

  document.querySelectorAll('[data-settings-view]').forEach((node) => {
    node.hidden = node.dataset.settingsView !== view;
  });

  const title = document.getElementById('settings-panel-title');
  const backButton = document.getElementById('settings-back');

  if (title) {
    if (view === 'notifications') {
      title.textContent = 'Notificaciones';
    } else if (view === 'categories') {
      title.textContent = 'Categorías';
    } else {
      title.textContent = 'Ajustes';
    }
  }

  if (backButton) {
    backButton.hidden = view === 'main';
  }
}

export function subscribeToConfig() {
  onSnapshot(getShoppingConfigRef(), (snap) => {
    if (!snap.exists()) return;

    const categories = snap.data().categories;
    if (Array.isArray(categories) && categories.length > 0) {
      shoppingCategories = categories;
      notifyCategories();
      _renderCategoryChips();
      _syncShoppingSelect();
    }
  });

  onSnapshot(getHomeRef(), (snap) => {
    if (!snap.exists()) return;

    const data = snap.data();
    const nameInput = document.getElementById('settings-home-name');
    const codeEl = document.getElementById('settings-home-code');
    const headerName = document.getElementById('header-home-name');

    if (nameInput) nameInput.value = data.name || '';
    if (codeEl) codeEl.innerText = data.code || '---';
    if (headerName && data.name) {
      headerName.innerText = ` • ${data.name}`;
    }

    if (Array.isArray(data.members)) {
      taskMembers = data.members;
      notifyMembers();
      _renderMemberChips();
    }
  });

  onSnapshot(getCurrentMemberRef(), (snap) => {
    notificationPrefs = normalizeNotificationPrefs(snap.data()?.notificationPrefs);
    _renderNotificationPrefs();
  });
}

export function initSettingsPanel() {
  _buildPanelHTML();

  const openBtn = document.getElementById('settings-btn');
  const panel = document.getElementById('settings-panel');
  const overlay = document.getElementById('settings-overlay');
  const closeBtn = document.getElementById('settings-close');
  const backBtn = document.getElementById('settings-back');

  if (!openBtn || !panel) return;

  openBtn.addEventListener('click', openPanel);
  closeBtn?.addEventListener('click', closePanel);
  overlay?.addEventListener('click', closePanel);
  backBtn?.addEventListener('click', () => setSettingsView('main'));

  document.addEventListener('keydown', (e) => {
    const settingsPanel = document.getElementById('settings-panel');
    if (e.key !== 'Escape' || !settingsPanel?.classList.contains('settings-panel--open')) return;

    if (currentSettingsView !== 'main') {
      setSettingsView('main');
      return;
    }

    closePanel();
  });

  document.getElementById('settings-nav-notifications')?.addEventListener('click', () => {
    setSettingsView('notifications');
  });
  document.getElementById('settings-nav-categories')?.addEventListener('click', () => {
    setSettingsView('categories');
  });

  const saveNameBtn = document.getElementById('settings-save-name');
  saveNameBtn?.addEventListener('click', _saveName);
  document.getElementById('settings-name-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') _saveName();
  });

  const saveHomeBtn = document.getElementById('settings-save-home');
  saveHomeBtn?.addEventListener('click', async () => {
    const value = document.getElementById('settings-home-name')?.value.trim();
    if (!value) return showToast('Nombre inválido', 'error');

    try {
      await updateDoc(getHomeRef(), { name: value });
      showToast('Casa actualizada', 'success');
    } catch (error) {
      showToast('Error', 'error');
    }
  });

  document.getElementById('settings-btn-create-home')?.addEventListener('click', async () => {
    const name = await showCustomPrompt('Nueva casa', 'Nombre de la nueva casa...', 40);
    if (!name || !name.trim()) return;

    try {
      const { homeId } = await createHome(name.trim(), localStorage.getItem('lrhome_user'));
      const homes = JSON.parse(localStorage.getItem('lrhome_homes') || '[]');
      homes.push(homeId);
      localStorage.setItem('lrhome_homes', JSON.stringify(homes));
      localStorage.setItem('lrhome_homeId', homeId);
      window.location.reload();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  document.getElementById('settings-btn-join-home')?.addEventListener('click', async () => {
    const code = await showCustomPrompt('Unirse a casa', 'Código de 6 caracteres...', 6);

    if (!code) return;
    if (code.trim().length !== 6) {
      showToast('Código inválido.', 'error');
      return;
    }

    try {
      const homeId = await joinHome(code.trim().toUpperCase(), localStorage.getItem('lrhome_user'));
      const homes = JSON.parse(localStorage.getItem('lrhome_homes') || '[]');
      if (!homes.includes(homeId)) homes.push(homeId);
      localStorage.setItem('lrhome_homes', JSON.stringify(homes));
      localStorage.setItem('lrhome_homeId', homeId);
      window.location.reload();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  const addCatBtn = document.getElementById('settings-add-cat-btn');
  const addCatInput = document.getElementById('settings-add-cat-input');
  addCatBtn?.addEventListener('click', () => _addItem('categories'));
  addCatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') _addItem('categories');
  });

  document.querySelectorAll('[data-notification-pref]').forEach((input) => {
    input.addEventListener('change', async (event) => {
      const prefKey = event.target.dataset.notificationPref;
      const enabled = Boolean(event.target.checked);
      await _saveNotificationPref(prefKey, enabled, event.target);
    });
  });
}

async function openPanel() {
  const panel = document.getElementById('settings-panel');
  const overlay = document.getElementById('settings-overlay');
  const input = document.getElementById('settings-name-input');

  if (input) input.value = localStorage.getItem('lrhome_user') || '';

  setSettingsView('main');
  _renderCategoryChips();
  _renderMemberChips();
  _renderNotificationPrefs();

  if (window.lucide) window.lucide.createIcons({ nodes: [panel] });

  overlay?.classList.add('settings-overlay--visible');
  panel?.classList.add('settings-panel--open');

  const listEl = document.getElementById('settings-homes-list');
  try {
    const homes = await getHomesForUser(localStorage.getItem('lrhome_user'));
    if (homes && listEl) {
      listEl.innerHTML = homes.map((home) => `
        <div class="settings-home-row">
          <strong>${_escapeHTML(home.name)}</strong>
          ${home.id === localStorage.getItem('lrhome_homeId')
            ? '<span class="settings-home-row__status">Activa</span>'
            : `<button class="btn btn--primary settings-switch-home" data-id="${home.id}" style="padding:4px 12px; font-size:0.75rem; height:auto; min-height:unset;">Cambiar</button>`}
        </div>
      `).join('');

      listEl.querySelectorAll('.settings-switch-home').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          localStorage.setItem('lrhome_homeId', event.target.dataset.id);
          window.location.reload();
        });
      });
    }
  } catch (error) {
    console.error('Error load homes', error);
  }
}

function closePanel() {
  const panel = document.getElementById('settings-panel');
  const overlay = document.getElementById('settings-overlay');
  setSettingsView('main');
  panel?.classList.remove('settings-panel--open');
  overlay?.classList.remove('settings-overlay--visible');
}

function _saveName() {
  const input = document.getElementById('settings-name-input');
  const name = input?.value.trim();

  if (!name) {
    showToast('El nombre no puede estar vacío.', 'error');
    input?.focus();
    return;
  }

  if (name.length > 30) {
    showToast('El nombre no puede superar los 30 caracteres.', 'error');
    return;
  }

  localStorage.setItem('lrhome_user', name);
  setActiveUser(name);
  showToast(`Nombre actualizado a "${name}" ✓`, 'success');
}

async function _saveNotificationPref(prefKey, enabled, inputEl) {
  if (!prefKey || !(prefKey in DEFAULT_NOTIFICATION_PREFS)) return;

  const previousPrefs = { ...notificationPrefs };
  notificationPrefs = {
    ...notificationPrefs,
    [prefKey]: enabled,
  };

  _renderNotificationPrefs();

  try {
    await setDoc(getCurrentMemberRef(), {
      userName: localStorage.getItem('lrhome_user') || '',
      notificationPrefs,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    notificationPrefs = previousPrefs;
    if (inputEl) inputEl.checked = previousPrefs[prefKey];
    _renderNotificationPrefs();
    showToast('No se pudo guardar la preferencia.', 'error');
    console.error(error);
  }
}

async function _addItem(field) {
  const input = document.getElementById('settings-add-cat-input');
  const value = input?.value.trim();
  if (!value) {
    input?.focus();
    return;
  }

  const updated = [...shoppingCategories, value];

  try {
    await setDoc(getShoppingConfigRef(), { [field]: updated }, { merge: true });
    if (input) input.value = '';
    input?.focus();
  } catch (error) {
    showToast('Error al guardar. Inténtalo de nuevo.', 'error');
    console.error(error);
  }
}

async function _deleteItem(field, value) {
  if (field === 'members') {
    try {
      await updateDoc(getHomeRef(), { members: arrayRemove(value) });
    } catch (error) {
      showToast('Error al eliminar el miembro.', 'error');
      console.error(error);
    }
    return;
  }

  const updated = shoppingCategories.filter((entry) => entry !== value);
  if (updated.length === 0) {
    showToast('Debe quedar al menos una opción.', 'error');
    return;
  }

  try {
    await setDoc(getShoppingConfigRef(), { [field]: updated }, { merge: true });
  } catch (error) {
    showToast('Error al guardar. Inténtalo de nuevo.', 'error');
    console.error(error);
  }
}

function _renderCategoryChips() {
  const container = document.getElementById('settings-cat-chips');
  if (!container) return;

  container.innerHTML = shoppingCategories.map((category) => _chipHTML('categories', category)).join('');
  _bindChipEvents(container, 'categories');
}

function _renderMemberChips() {
  const container = document.getElementById('settings-member-chips');
  if (!container) return;

  container.innerHTML = taskMembers.map((member) => _chipHTML('members', member)).join('');
  _bindChipEvents(container, 'members');
}

function _renderNotificationPrefs() {
  NOTIFICATION_PREF_OPTIONS.forEach(({ key, captionOn, captionOff }) => {
    const input = document.querySelector(`[data-notification-pref="${key}"]`);
    const status = document.getElementById(`settings-notification-label-${key}`);
    const enabled = Boolean(notificationPrefs[key]);

    if (input) input.checked = enabled;
    if (status) status.textContent = enabled ? captionOn : captionOff;
  });
}

function _chipHTML(field, value) {
  return `
    <span class="settings-chip">
      ${_escapeHTML(value)}
      <button
        class="settings-chip__remove"
        data-field="${field}"
        data-value="${_escapeHTML(value)}"
        aria-label="Eliminar ${_escapeHTML(value)}"
        title="Eliminar"
      >
        <i data-lucide="x"></i>
      </button>
    </span>
  `;
}

function _bindChipEvents(container, field) {
  container.querySelectorAll('.settings-chip__remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      const { value } = btn.dataset;
      _deleteItem(field, value);
    });
  });

  if (window.lucide) window.lucide.createIcons({ nodes: [container] });
}

function _syncShoppingSelect() {
  const select = document.getElementById('shopping-select-cat');
  if (!select) return;

  const current = select.value;
  select.innerHTML = shoppingCategories
    .map((category) => `<option value="${category}"${category === current ? ' selected' : ''}>${category}</option>`)
    .join('');

  _syncShoppingFilterBar();
}

function _syncShoppingFilterBar() {
  const bar = document.getElementById('shopping-filter-bar');
  if (!bar) return;

  const activeChip = bar.querySelector('.chip--active');
  const activeValue = activeChip?.dataset.category || 'Todas';

  bar.innerHTML = `
    <button class="chip${activeValue === 'Todas' ? ' chip--active' : ''}" data-category="Todas">Todas</button>
    ${shoppingCategories.map((category) =>
      `<button class="chip${category === activeValue ? ' chip--active' : ''}" data-category="${category}">${category}</button>`
    ).join('')}
  `;
}

function _buildPanelHTML() {
  const overlay = document.createElement('div');
  overlay.id = 'settings-overlay';
  overlay.className = 'settings-overlay';
  document.body.appendChild(overlay);

  const panel = document.createElement('aside');
  panel.id = 'settings-panel';
  panel.className = 'settings-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'settings-panel-title');

  panel.innerHTML = `
    <div class="settings-panel__header">
      <div class="settings-panel__header-main">
        <button class="settings-panel__back" id="settings-back" aria-label="Volver" hidden>
          <i data-lucide="arrow-left"></i>
        </button>
        <h2 class="settings-panel__title" id="settings-panel-title">Ajustes</h2>
      </div>
      <button class="settings-panel__close" id="settings-close" aria-label="Cerrar ajustes">
        <i data-lucide="x"></i>
      </button>
    </div>

    <div class="settings-panel__body">
      <div class="settings-panel__view" data-settings-view="main">
        <section class="settings-block">
          <h3 class="settings-block__title">
            <i data-lucide="home"></i>
            Mis casas
          </h3>
          <div class="settings-block__content">
            <label class="settings-label" for="settings-home-name">Nombre de la casa actual</label>
            <div class="settings-input-row">
              <input type="text" id="settings-home-name" class="form-input" maxlength="40" />
              <button class="btn btn--primary settings-save-btn" id="settings-save-home" aria-label="Guardar nombre">
                <i data-lucide="check"></i>
                <span>Guardar</span>
              </button>
            </div>

            <p class="settings-home-code">
              Código para invitar a otros:
              <strong id="settings-home-code">---</strong>
            </p>

            <div id="settings-homes-list" class="settings-home-list"></div>

            <div class="settings-home-actions">
              <button id="settings-btn-create-home" class="btn btn--secondary btn--full settings-secondary-btn">Crear nueva casa</button>
              <button id="settings-btn-join-home" class="btn btn--secondary btn--full settings-secondary-btn">Unirse con código</button>
            </div>
          </div>
        </section>

        <section class="settings-block">
          <h3 class="settings-block__title">
            <i data-lucide="user"></i>
            Tu perfil
          </h3>
          <div class="settings-block__content">
            <label class="settings-label" for="settings-name-input">Nombre de usuario</label>
            <div class="settings-input-row">
              <input
                type="text"
                id="settings-name-input"
                class="form-input"
                placeholder="Tu nombre…"
                maxlength="30"
                autocomplete="given-name"
              />
              <button class="btn btn--primary settings-save-btn" id="settings-save-name" aria-label="Guardar nombre">
                <i data-lucide="check"></i>
                <span>Guardar</span>
              </button>
            </div>

            <label class="settings-label settings-label--spaced">Miembros del hogar</label>
            <div class="settings-chips" id="settings-member-chips"></div>
          </div>
        </section>

        <section class="settings-block">
          <div class="settings-nav-list">
            <button class="settings-nav-row" id="settings-nav-notifications" type="button">
              <span class="settings-nav-row__copy">
                <span class="settings-nav-row__title">Notificaciones</span>
                <span class="settings-nav-row__subtitle">Preferencias por tipo de aviso</span>
              </span>
              <i data-lucide="chevron-right" class="settings-nav-row__arrow"></i>
            </button>
            <button class="settings-nav-row" id="settings-nav-categories" type="button">
              <span class="settings-nav-row__copy">
                <span class="settings-nav-row__title">Categorías de la compra</span>
                <span class="settings-nav-row__subtitle">Editar y ordenar tus categorías</span>
              </span>
              <i data-lucide="chevron-right" class="settings-nav-row__arrow"></i>
            </button>
          </div>
        </section>
      </div>

      <div class="settings-panel__view" data-settings-view="notifications" hidden>
        <section class="settings-block">
          <h3 class="settings-block__title">
            <i data-lucide="bell"></i>
            Notificaciones
          </h3>
          <div class="settings-block__content">
            <div class="settings-switch-list">
              ${NOTIFICATION_PREF_OPTIONS.map(({ key, label, captionOn }) => `
                <label class="settings-switch-row">
                  <span class="settings-switch-row__copy">
                    <span class="settings-switch-row__title">${label}</span>
                    <span class="settings-switch-row__status" id="settings-notification-label-${key}">${captionOn}</span>
                  </span>
                  <span class="settings-switch">
                    <input type="checkbox" class="settings-switch__input" data-notification-pref="${key}" />
                    <span class="settings-switch__track">
                      <span class="settings-switch__thumb"></span>
                    </span>
                  </span>
                </label>
              `).join('')}
            </div>
          </div>
        </section>
      </div>

      <div class="settings-panel__view" data-settings-view="categories" hidden>
        <section class="settings-block">
          <h3 class="settings-block__title">
            <i data-lucide="shopping-cart"></i>
            Categorías de la compra
          </h3>
          <div class="settings-block__content">
            <div class="settings-chips" id="settings-cat-chips"></div>
            <div class="settings-input-row settings-input-row--mt">
              <input
                type="text"
                id="settings-add-cat-input"
                class="form-input"
                placeholder="Nueva categoría…"
                maxlength="40"
                autocomplete="off"
              />
              <button class="btn btn--primary settings-add-btn" id="settings-add-cat-btn" aria-label="Añadir categoría">
                <i data-lucide="plus"></i>
                <span>Añadir</span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;

  document.body.appendChild(panel);
}

function _escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
