/**
 * ui-settings.js
 * Panel de ajustes: perfil de usuario, categorías de compra y áreas de tareas.
 * Lee y escribe en Firestore colección `config`, documentos `shopping` y `tasks`.
 */

import { db } from './firebase-config.js';
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { setActiveUser, showToast } from './ui-shared.js';

// ─── Referencias Firestore ────────────────────────────────────────────────────
const shoppingConfigRef = doc(db, 'config', 'shopping');
const tasksConfigRef    = doc(db, 'config', 'tasks');

// ─── Estado local de categorías/áreas ────────────────────────────────────────
/** Categorías de compra actuales (array de strings) */
export let shoppingCategories = [
  'Fruta y Verdura', 'Lácteos', 'Carnicería', 'Panadería',
  'Congelados', 'Limpieza', 'Higiene', 'Bebidas', 'Otros',
];

/** Áreas de tareas actuales (array de strings) */
export let taskAreas = [
  'Cocina', 'Salón', 'Dormitorios', 'Baño',
  'Exterior', 'Compras', 'Gestiones', 'Otros',
];

/** Callbacks registrados para notificar cambios a otros módulos */
const categoriesListeners = [];
const areasListeners      = [];

export function onShoppingCategoriesChange(cb) { categoriesListeners.push(cb); }
export function onTaskAreasChange(cb)           { areasListeners.push(cb); }

function notifyCategories() { categoriesListeners.forEach(cb => cb([...shoppingCategories])); }
function notifyAreas()      { areasListeners.forEach(cb => cb([...taskAreas])); }

// ─── Suscripción en tiempo real a configuración ───────────────────────────────
export function subscribeToConfig() {
  onSnapshot(shoppingConfigRef, (snap) => {
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

  onSnapshot(tasksConfigRef, (snap) => {
    if (snap.exists()) {
      const areas = snap.data().areas;
      if (Array.isArray(areas) && areas.length > 0) {
        taskAreas = areas;
        notifyAreas();
        _renderAreaChips();
        _syncTasksSelect();
      }
    }
  });
}

// ─── Inicialización del panel ─────────────────────────────────────────────────
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
    if (e.key === 'Escape' && !panel.hidden) closePanel();
  });

  // Perfil: guardar nombre
  const saveNameBtn = document.getElementById('settings-save-name');
  saveNameBtn?.addEventListener('click', _saveName);
  document.getElementById('settings-name-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') _saveName();
  });

  // Categorías: añadir
  const addCatBtn   = document.getElementById('settings-add-cat-btn');
  const addCatInput = document.getElementById('settings-add-cat-input');
  addCatBtn?.addEventListener('click', () => _addItem('categories'));
  addCatInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') _addItem('categories'); });

  // Áreas: añadir
  const addAreaBtn   = document.getElementById('settings-add-area-btn');
  const addAreaInput = document.getElementById('settings-add-area-input');
  addAreaBtn?.addEventListener('click', () => _addItem('areas'));
  addAreaInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') _addItem('areas'); });
}

function openPanel() {
  const panel   = document.getElementById('settings-panel');
  const overlay = document.getElementById('settings-overlay');
  const input   = document.getElementById('settings-name-input');

  if (panel)   panel.hidden   = false;
  if (overlay) overlay.hidden = false;

  // Precarga nombre actual
  if (input) input.value = localStorage.getItem('lrhome_user') || '';

  // Renderiza chips con datos actuales
  _renderCategoryChips();
  _renderAreaChips();

  // Renderiza iconos Lucide del panel
  if (window.lucide) window.lucide.createIcons({ nodes: [panel] });

  requestAnimationFrame(() => panel?.classList.add('settings-panel--open'));
}

function closePanel() {
  const panel   = document.getElementById('settings-panel');
  const overlay = document.getElementById('settings-overlay');
  panel?.classList.remove('settings-panel--open');
  setTimeout(() => {
    if (panel)   panel.hidden   = true;
    if (overlay) overlay.hidden = true;
  }, 280);
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
async function _addItem(field) {
  const isCategories = field === 'categories';
  const inputId  = isCategories ? 'settings-add-cat-input'  : 'settings-add-area-input';
  const input    = document.getElementById(inputId);
  const value    = input?.value.trim();
  if (!value) { input?.focus(); return; }

  const list    = isCategories ? shoppingCategories : taskAreas;
  const ref     = isCategories ? shoppingConfigRef  : tasksConfigRef;
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
  const isCategories = field === 'categories';
  const list    = isCategories ? shoppingCategories : taskAreas;
  const ref     = isCategories ? shoppingConfigRef  : tasksConfigRef;
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

function _renderAreaChips() {
  const container = document.getElementById('settings-area-chips');
  if (!container) return;
  container.innerHTML = taskAreas.map(a => _chipHTML('areas', a)).join('');
  _bindChipEvents(container, 'areas');
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

function _syncTasksSelect() {
  const sel = document.getElementById('tasks-select-area');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = taskAreas
    .map(a => `<option value="${a}"${a === current ? ' selected' : ''}>${a}</option>`)
    .join('');
}

// ─── Construcción del HTML del panel ─────────────────────────────────────────
function _buildPanelHTML() {
  // Overlay de fondo
  const overlay = document.createElement('div');
  overlay.id      = 'settings-overlay';
  overlay.className = 'settings-overlay';
  overlay.hidden  = true;
  document.body.appendChild(overlay);

  // Panel lateral
  const panel = document.createElement('aside');
  panel.id        = 'settings-panel';
  panel.className = 'settings-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'settings-panel-title');
  panel.hidden    = true;

  panel.innerHTML = `
    <div class="settings-panel__header">
      <h2 class="settings-panel__title" id="settings-panel-title">Ajustes</h2>
      <button class="settings-panel__close" id="settings-close" aria-label="Cerrar ajustes">
        <i data-lucide="x"></i>
      </button>
    </div>

    <div class="settings-panel__body">

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

      <!-- Bloque 3: Áreas de tareas -->
      <section class="settings-block">
        <h3 class="settings-block__title">
          <i data-lucide="check-square"></i>
          Áreas de tareas
        </h3>
        <div class="settings-block__content">
          <div class="settings-chips" id="settings-area-chips"></div>
          <div class="settings-input-row settings-input-row--mt">
            <input
              type="text"
              id="settings-add-area-input"
              class="form-input"
              placeholder="Nueva área…"
              maxlength="40"
              autocomplete="off"
            />
            <button class="btn btn--primary settings-add-btn" id="settings-add-area-btn" aria-label="Añadir área">
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
