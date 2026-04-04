/**
 * ui-tasks.js
 * Única responsabilidad: render del módulo Tareas del Hogar.
 */

import { showToast } from './ui-shared.js';

const AREAS = [
  'Cocina', 'Salón', 'Dormitorios', 'Baño',
  'Exterior', 'Compras', 'Gestiones', 'Otros',
];

/** Inyecta el HTML del módulo en el contenedor #tasks-module */
export function initTasksUI() {
  const container = document.getElementById('tasks-module');
  if (!container) return;

  container.innerHTML = `
    <!-- Formulario añadir tarea -->
    <div class="card add-form" id="tasks-form-card">
      <form id="tasks-form" novalidate>
        <div class="form-group">
          <input
            type="text"
            id="tasks-input-title"
            class="form-input"
            placeholder="¿Qué hay que hacer?"
            maxlength="120"
            autocomplete="off"
            required
          />
        </div>
        <div class="form-group">
          <input
            type="text"
            id="tasks-input-notes"
            class="form-input"
            placeholder="Notas o detalles (opcional)"
            maxlength="300"
            autocomplete="off"
          />
        </div>
        <div class="form-group">
          <select id="tasks-select-area" class="form-select">
            ${AREAS.map(a => `<option value="${a}">${a}</option>`).join('')}
          </select>
        </div>
        <button type="submit" class="btn btn--primary btn--full btn--pill" id="tasks-submit-btn">
          <i data-lucide="plus" class="btn__icon"></i>
          <span class="btn__text">Añadir tarea</span>
          <span class="btn__spinner" hidden></span>
        </button>
      </form>
    </div>

    <!-- Skeleton de carga -->
    <div id="tasks-skeleton" class="skeleton-list" aria-hidden="true">
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
    </div>

    <!-- Lista de tareas -->
    <div id="tasks-list" hidden></div>

    <!-- FAB limpiar completadas -->
    <button class="fab" id="tasks-fab" hidden aria-label="Limpiar tareas completadas">
      <i data-lucide="trash-2" class="fab__icon"></i>
      <span>Limpiar completadas</span>
    </button>
  `;

  if (window.lucide) window.lucide.createIcons({ nodes: [container] });
}

/**
 * Renderiza la lista de tareas.
 * @param {Array} tasks - Todos los ítems de Firestore
 */
export function renderTasks(tasks) {
  const container = document.getElementById('tasks-list');
  if (!container) return;

  const pending = tasks.filter(t => t.status === 'pending');
  const done    = tasks.filter(t => t.status === 'done');

  if (tasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__emoji">✅</div>
        <h2 class="empty-state__title">Sin tareas pendientes</h2>
        <p class="empty-state__subtitle">El hogar está al día</p>
      </div>
    `;
    return;
  }

  let html = '';

  if (pending.length > 0) {
    html += `
      <section class="list-section">
        <h3 class="list-section__title">
          Pendientes <span class="list-section__count">(${pending.length})</span>
        </h3>
        <ul class="item-list" role="list">
          ${pending.map(renderTaskCard).join('')}
        </ul>
      </section>
    `;
  }

  if (done.length > 0) {
    html += `
      <section class="list-section list-section--done">
        <h3 class="list-section__title">
          Completadas <span class="list-section__count">(${done.length})</span>
        </h3>
        <ul class="item-list" role="list">
          ${done.map(renderTaskCard).join('')}
        </ul>
      </section>
    `;
  }

  container.innerHTML = html;
  if (window.lucide) window.lucide.createIcons({ nodes: [container] });
}

function renderTaskCard(task) {
  const isDone = task.status === 'done';
  const doneInfo = isDone && task.doneBy
    ? `<span class="item-card__done-by">✓ hecha por ${escapeHTML(task.doneBy)}</span>`
    : '';
  const notesHtml = task.notes
    ? `<span class="item-card__notes">${escapeHTML(task.notes)}</span>`
    : '';

  return `
    <li class="item-card ${isDone ? 'item-card--done' : ''}" data-id="${task.id}" role="listitem">
      <button
        class="item-card__check ${isDone ? 'item-card__check--done' : ''}"
        data-action="toggle"
        data-id="${task.id}"
        data-status="${task.status}"
        aria-label="${isDone ? 'Marcar como pendiente' : 'Marcar como hecha'}"
        aria-pressed="${isDone}"
      >
        <i data-lucide="check" class="check-icon"></i>
      </button>
      <div class="item-card__body">
        <span class="item-card__name ${isDone ? 'item-card__name--done' : ''}">${escapeHTML(task.title)}</span>
        ${notesHtml}
        <div class="item-card__meta">
          <span class="badge">${escapeHTML(task.area || 'Otros')}</span>
          <span class="item-card__by">por ${escapeHTML(task.addedBy || '')}</span>
          ${doneInfo}
        </div>
      </div>
      <button
        class="item-card__delete"
        data-action="delete"
        data-id="${task.id}"
        aria-label="Eliminar tarea ${escapeHTML(task.title)}"
      >
        <i data-lucide="trash-2"></i>
      </button>
    </li>
  `;
}

export function showTasksSkeleton() {
  const sk = document.getElementById('tasks-skeleton');
  const list = document.getElementById('tasks-list');
  if (sk) sk.hidden = false;
  if (list) list.hidden = true;
}

export function hideTasksSkeleton() {
  const sk = document.getElementById('tasks-skeleton');
  const list = document.getElementById('tasks-list');
  if (sk) sk.hidden = true;
  if (list) list.hidden = false;
}

export function toggleTasksFAB(show) {
  const fab = document.getElementById('tasks-fab');
  if (fab) fab.hidden = !show;
}

/**
 * Conecta todos los eventos del módulo de tareas.
 * @param {object} handlers - { onAdd, onToggle, onDelete, onClear }
 */
export function bindTasksEvents(handlers) {
  const form = document.getElementById('tasks-form');
  const submitBtn = document.getElementById('tasks-submit-btn');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const titleInput = document.getElementById('tasks-input-title');
      const notesInput = document.getElementById('tasks-input-notes');
      const areaSelect = document.getElementById('tasks-select-area');
      const title = titleInput?.value.trim();
      if (!title) {
        titleInput?.focus();
        showToast('Escribe el título de la tarea.', 'error');
        return;
      }
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.querySelector('.btn__text').hidden = true;
        submitBtn.querySelector('.btn__spinner').hidden = false;
      }
      try {
        await handlers.onAdd({
          title,
          notes: notesInput?.value.trim() || '',
          area:  areaSelect?.value || 'Otros',
        });
        titleInput.value = '';
        if (notesInput) notesInput.value = '';
        titleInput.focus();
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.querySelector('.btn__text').hidden = false;
          submitBtn.querySelector('.btn__spinner').hidden = true;
        }
      }
    });
  }

  const listEl = document.getElementById('tasks-list');
  if (listEl) {
    listEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id, status } = btn.dataset;
      if (action === 'toggle') handlers.onToggle(id, status);
      if (action === 'delete') handlers.onDelete(id);
    });
  }

  const fab = document.getElementById('tasks-fab');
  if (fab) {
    fab.addEventListener('click', () => {
      if (confirm('¿Eliminar todas las tareas completadas?')) {
        handlers.onClear();
      }
    });
  }
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
