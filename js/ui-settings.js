import { db } from './firebase-config.js';
import {
  doc,
  getDoc,
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
const getMembersConfigRef  = () => doc(db, 'homes', localStorage.getItem('lrhome_homeId'), 'config', 'members');
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

export let shoppingCategories = [
  'Comida', 'Fruta y verdura', 'Lácteos', 'Carnicería', 'Panadería',
  'Limpieza', 'Higiene', 'Bebidas', 'Otros',
];

export let taskMembers = [];
const categoriesListeners = [];
const membersListeners    = [];
let notificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS };

export function onShoppingCategoriesChange(cb) { categoriesListeners.push(cb); }
export function onTaskMembersChange(cb)         { membersListeners.push(cb); }

function notifyCategories() { categoriesListeners.forEach(cb => cb([...shoppingCategories])); }
function notifyMembers()    { membersListeners.forEach(cb => cb([...taskMembers])); }
function normalizeNotificationPrefs(value) {
  return { ...DEFAULT_NOTIFICATION_PREFS, ...(value || {}) };
}

export function subscribeToConfig() {
  onSnapshot(getShoppingConfigRef(), (snap) => {
    if (snap.exists()) {
      const cats = snap.data().categories;
      if (Array.isArray(cats) && cats.length > 0) {
        shoppingCategories = cats;
        notifyCategories();
        _renderCategoryChips();
        _syncShoppingSelect();
      }
    }
  });

  // getMembersConfigRef snapshot removed as requested

  onSnapshot(getHomeRef(), (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      const n = document.getElementById('settings-home-name');
      const c = document.getElementById('settings-home-code');
      const headerName = document.getElementById('header-home-name');
      
      if (n) n.value = data.name || '';
      if (c) c.innerText = data.code || '---';
      if (headerName && data.name) {
        headerName.innerText = ` • ${data.name}`;
      }
      if (Array.isArray(data.members)) {
        taskMembers = data.members;
        notifyMembers();
        _renderMemberChips();
      }
    }
  });

  onSnapshot(getCurrentMemberRef(), (snap) => {
    notificationPrefs = normalizeNotificationPrefs(snap.data()?.notificationPrefs);
    _renderNotificationPrefs();
  });
}

export function initSettingsPanel() {
  _buildPanelHTML();

  const openBtn  = document.getElementById('settings-btn');
  const panel    = document.getElementById('settings-panel');
  const overlay  = document.getElementById('settings-overlay');
  const closeBtn = document.getElementById('settings-close');

  if (!openBtn || !panel) return;

  openBtn.addEventListener('click', openPanel);
  closeBtn?.addEventListener('click', closePanel);
  overlay?.addEventListener('click', closePanel);

  document.addEventListener('keydown', (e) => {
    const p = document.getElementById('settings-panel');
    if (e.key === 'Escape' && p?.classList.contains('settings-panel--open')) closePanel();
  });

  const saveNameBtn = document.getElementById('settings-save-name');
  saveNameBtn?.addEventListener('click', _saveName);
  document.getElementById('settings-name-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') _saveName();
  });

  const btnSaveHome = document.getElementById('settings-save-home');
  btnSaveHome?.addEventListener('click', async () => {
    const val = document.getElementById('settings-home-name')?.value.trim();
    if (!val) return showToast('Nombre inválido', 'error');
    try {
      await updateDoc(getHomeRef(), { name: val });
      showToast('Casa actualizada', 'success');
    } catch (e) { showToast('Error', 'error'); }
  });

  document.getElementById('settings-btn-create-home')?.addEventListener('click', async () => {
    const name = await showCustomPrompt('Nueva casa', 'Nombre de la nueva casa...', 40);
    if(name && name.trim()) {
      try {
        const { homeId } = await createHome(name.trim(), localStorage.getItem('lrhome_user'));
        const homes = JSON.parse(localStorage.getItem('lrhome_homes') || '[]');
        homes.push(homeId);
        localStorage.setItem('lrhome_homes', JSON.stringify(homes));
        localStorage.setItem('lrhome_homeId', homeId);
        window.location.reload();
      } catch(e) { showToast(e.message, 'error'); }
    }
  });

  document.getElementById('settings-btn-join-home')?.addEventListener('click', async () => {
    const code = await showCustomPrompt('Unirse a casa', 'Código de 6 caracteres...', 6);
    if(code && code.trim().length === 6) {
      try {
        const homeId = await joinHome(code.trim().toUpperCase(), localStorage.getItem('lrhome_user'));
        const homes = JSON.parse(localStorage.getItem('lrhome_homes') || '[]');
        if(!homes.includes(homeId)) homes.push(homeId);
        localStorage.setItem('lrhome_homes', JSON.stringify(homes));
        localStorage.setItem('lrhome_homeId', homeId);
        window.location.reload();
      } catch(e) { showToast(e.message, 'error'); }
    } else if (code) {
      showToast('Código inválido.', 'error');
    }
  });

  const addCatBtn   = document.getElementById('settings-add-cat-btn');
  const addCatInput = document.getElementById('settings-add-cat-input');
  addCatBtn?.addEventListener('click', () => _addItem('categories'));
  addCatInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') _addItem('categories'); });

  document.querySelectorAll('[data-notification-pref]').forEach((input) => {
    input.addEventListener('change', async (event) => {
      const prefKey = event.target.dataset.notificationPref;
      const enabled = Boolean(event.target.checked);
      await _saveNotificationPref(prefKey, enabled, event.target);
    });
  });
}

async function openPanel() {
  const panel   = document.getElementById('settings-panel');
  const overlay = document.getElementById('settings-overlay');
  const input   = document.getElementById('settings-name-input');

  if (input) input.value = localStorage.getItem('lrhome_user') || '';

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
      listEl.innerHTML = homes.map(h => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--color-surface-2); padding:8px 12px; border-radius:var(--radius-sm);">
          <strong>${_escapeHTML(h.name)}</strong>
          ${h.id === localStorage.getItem('lrhome_homeId') 
            ? '<span style="font-size:0.8rem; color:var(--color-text-muted);">Activa</span>' 
            : `<button class="btn btn--primary settings-switch-home" data-id="${h.id}" style="padding:4px 12px; font-size:0.75rem; height:auto; min-height:unset;">Cambiar</button>`}
        </div>
      `).join('');
      
      listEl.querySelectorAll('.settings-switch-home').forEach(btn => {
        btn.addEventListener('click', (e) => {
          localStorage.setItem('lrhome_homeId', e.target.dataset.id);
          window.location.reload();
        });
      });
    }
  } catch (e) { console.error('Error load homes', e); }
}

function closePanel() {
  const panel   = document.getElementById('settings-panel');
  const overlay = document.getElementById('settings-overlay');
  panel?.classList.remove('settings-panel--open');
  overlay?.classList.remove('settings-overlay--visible');
}

// ─── Perfil ───────────────────────────────────────────────────────────────────
function _saveName() {
  const input = document.getElementById('settings-name-input');
  const name  = input?.value.trim();
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

// ─── Helpers categorías/áreas ─────────────────────────────────────────────────
async function _saveNotificationPref(prefKey, enabled, inputEl) {
  if (!prefKey || !(prefKey in DEFAULT_NOTIFICATION_PREFS)) return;

  const previousPrefs = { ...notificationPrefs };
  notificationPrefs = {
    ...notificationPrefs,
    [prefKey]: enabled,
  };

  try {
    await setDoc(getCurrentMemberRef(), {
      userName: localStorage.getItem('lrhome_user') || '',
      notificationPrefs,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    notificationPrefs = previousPrefs;
    if (inputEl) inputEl.checked = previousPrefs[prefKey];
    showToast('No se pudo guardar la preferencia.', 'error');
    console.error(error);
  }
}

async function _addItem(field) {
  let isCategories = field === 'categories';
  const inputId = 'settings-add-cat-input';
  const input = document.getElementById(inputId);
  const value = input?.value.trim();
  if (!value) { input?.focus(); return; }

  const list = shoppingCategories;
  const ref = getShoppingConfigRef();
  const updated = [...list, value];

  try {
    await setDoc(ref, { [field]: updated }, { merge: true });
    if (input) input.value = '';
    input?.focus();
  } catch (err) {
    showToast('Error al guardar. Inténtalo de nuevo.', 'error');
    console.error(err);
  }
}

async function _deleteItem(field, value) {
  let isCategories = field === 'categories';
  let isMembers = field === 'members';
  
  if (isMembers) {
    try {
      await updateDoc(getHomeRef(), { members: arrayRemove(value) });
    } catch (err) {
      showToast('Error al eliminar el miembro.', 'error');
      console.error(err);
    }
    return;
  }
  
  const list = shoppingCategories;
  const ref = getShoppingConfigRef();
  const updated = list.filter(v => v !== value);
  if (updated.length === 0) {
    showToast('Debe quedar al menos una opción.', 'error');
    return;
  }
  try {
    await setDoc(ref, { [field]: updated }, { merge: true });
  } catch (err) {
    showToast('Error al guardar. Inténtalo de nuevo.', 'error');
    console.error(err);
  }
}

// ─── Render chips ─────────────────────────────────────────────────────────────
function _renderCategoryChips() {
  const container = document.getElementById('settings-cat-chips');
  if (!container) return;
  container.innerHTML = shoppingCategories.map(c => _chipHTML('categories', c)).join('');
  _bindChipEvents(container, 'categories');
}



function _renderMemberChips() {
  const container = document.getElementById('settings-member-chips');
  if (!container) return;
  container.innerHTML = taskMembers.map(m => _chipHTML('members', m)).join('');
  _bindChipEvents(container, 'members');
}

function _renderNotificationPrefs() {
  const config = [
    { key: 'itemAdded', label: 'Alguien añade un item a la compra' },
    { key: 'itemBought', label: 'Alguien marca items como comprados' },
    { key: 'taskAdded', label: 'Alguien añade una tarea' },
    { key: 'taskDone', label: 'Alguien completa tareas' },
  ];

  config.forEach(({ key, label }) => {
    const input = document.querySelector(`[data-notification-pref="${key}"]`);
    const text = document.getElementById(`settings-notification-label-${key}`);
    if (input) input.checked = Boolean(notificationPrefs[key]);
    if (text) text.textContent = notificationPrefs[key] ? 'Activadas' : 'Silenciadas';
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
  container.querySelectorAll('.settings-chip__remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const { value } = btn.dataset;
      _deleteItem(field, value);
    });
  });
  if (window.lucide) window.lucide.createIcons({ nodes: [container] });
}

// ─── Sync selects de los formularios ─────────────────────────────────────────
function _syncShoppingSelect() {
  const sel = document.getElementById('shopping-select-cat');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = shoppingCategories
    .map(c => `<option value="${c}"${c === current ? ' selected' : ''}>${c}</option>`)
    .join('');
  // Actualiza también filter-bar chips
  _syncShoppingFilterBar();
}

function _syncShoppingFilterBar() {
  const bar = document.getElementById('shopping-filter-bar');
  if (!bar) return;
  // Conserva el chip "Todas" activo si lo estaba
  const activeChip = bar.querySelector('.chip--active');
  const activeVal  = activeChip?.dataset.category || 'Todas';

  bar.innerHTML = `
    <button class="chip${activeVal === 'Todas' ? ' chip--active' : ''}" data-category="Todas">Todas</button>
    ${shoppingCategories.map(c =>
      `<button class="chip${c === activeVal ? ' chip--active' : ''}" data-category="${c}">${c}</button>`
    ).join('')}
  `;
  // Re-enlaza evento de filtrado (delegado desde app.js, no necesita re-bind)
}



// ─── Construcción del HTML del panel ─────────────────────────────────────────
function _buildPanelHTML() {
  // Overlay de fondo — siempre en el DOM, visible via clase
  const overlay = document.createElement('div');
  overlay.id        = 'settings-overlay';
  overlay.className = 'settings-overlay';
  // NO se pone hidden: vive en el DOM invisible via CSS hasta que se activa
  document.body.appendChild(overlay);

  // Panel lateral — siempre en el DOM, fuera de pantalla via transform
  const panel = document.createElement('aside');
  panel.id        = 'settings-panel';
  panel.className = 'settings-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'settings-panel-title');
  // NO se pone hidden: el panel vive siempre renderizado
  // y se mueve fuera de pantalla con transform: translateX(100%)

  panel.innerHTML = `
    <div class="settings-panel__header">
      <h2 class="settings-panel__title" id="settings-panel-title">Ajustes</h2>
      <button class="settings-panel__close" id="settings-close" aria-label="Cerrar ajustes">
        <i data-lucide="x"></i>
      </button>
    </div>

    <div class="settings-panel__body">
      <!-- Bloque 0: Mis casas -->
      <section class="settings-block">
        <h3 class="settings-block__title">
          <i data-lucide="home"></i>
          Mis casas
        </h3>
        <div class="settings-block__content">
          <label class="settings-label" for="settings-home-name">Nombre de la casa actual</label>
          <div class="settings-input-row">
            <input
              type="text"
              id="settings-home-name"
              class="form-input"
              maxlength="40"
            />
            <button class="btn btn--primary settings-save-btn" id="settings-save-home" aria-label="Guardar nombre">
              <i data-lucide="check"></i>
              <span>Guardar</span>
            </button>
          </div>
          
          <p style="margin-top: 10px; font-size: 0.9rem; color: var(--color-text-light);">
            Código para invitar a otros: <strong id="settings-home-code" style="color: var(--color-text);">---</strong>
          </p>

          <div id="settings-homes-list" style="margin-top: 15px; display: flex; flex-direction: column; gap: 8px;"></div>
          
          <div style="display:flex; gap:8px; margin-top: 12px;">
             <button id="settings-btn-create-home" class="btn btn--secondary btn--full" style="padding:8px; font-size:0.8rem; background: var(--color-surface-2); border-radius: var(--radius-sm);">Crear nueva casa</button>
             <button id="settings-btn-join-home" class="btn btn--secondary btn--full" style="padding:8px; font-size:0.8rem; background: var(--color-surface-2); border-radius: var(--radius-sm);">Unirse con código</button>
          </div>
        </div>
      </section>

      <!-- Bloque 1: Tu perfil -->
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
          
          <label class="settings-label" style="margin-top: 16px;">Miembros del hogar</label>
          <div class="settings-chips" id="settings-member-chips"></div>
        </div>
      </section>

      <section class="settings-block">
        <h3 class="settings-block__title">
          <i data-lucide="bell"></i>
          Notificaciones
        </h3>
        <div class="settings-block__content">
          <div style="display:flex; flex-direction:column; gap:12px;">
            ${[
              ['itemAdded', 'Alguien añade un item a la compra'],
              ['itemBought', 'Alguien marca items como comprados'],
              ['taskAdded', 'Alguien añade una tarea'],
              ['taskDone', 'Alguien completa tareas'],
            ].map(([key, label]) => `
              <label style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 12px; border:1px solid var(--color-border); border-radius:var(--radius-sm); background:var(--color-surface-2);">
                <span style="display:flex; flex-direction:column; gap:2px;">
                  <span style="font-size:0.92rem; color:var(--color-text);">${label}</span>
                  <span id="settings-notification-label-${key}" style="font-size:0.78rem; color:var(--color-text-muted);">Activadas</span>
                </span>
                <input
                  type="checkbox"
                  data-notification-pref="${key}"
                  style="width:18px; height:18px; accent-color: var(--color-primary); flex-shrink:0;"
                />
              </label>
            `).join('')}
          </div>
        </div>
      </section>

      <!-- Bloque 2: Categorías de la compra -->
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
