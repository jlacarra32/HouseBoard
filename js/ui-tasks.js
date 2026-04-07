/**
 * ui-tasks.js
 * Única responsabilidad: render del módulo Tareas del Hogar.
 */

import { showToast } from './ui-shared.js';
import { taskMembers } from './ui-settings.js';

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
          <input
            type="text"
            id="tasks-input-assigned"
            class="form-input"
            placeholder="Asignado a (opcional)"
            list="tasks-members-list"
            maxlength="30"
            autocomplete="off"
          />
          <datalist id="tasks-members-list">
            ${taskMembers.map(m => `<option value="${_escapeHTMLforAttr(m)}">`).join('')}
          </datalist>
        </div>
        <button type="submit" class="btn btn--primary btn--full btn--pill" id="tasks-submit-btn">
          <i data-lucide="plus" class="btn__icon"></i>
          <span class="btn__text">Añadir tarea</span>
          <span class="btn__spinner" hidden></span>
        </button>
      </form>
    </div>

    <!-- Controles de vista -->
    <div class="view-toggle" id="tasks-view-toggle">
      <button class="view-btn" data-view="recent">
        <i data-lucide="clock"></i> Reciente
      </button>
      <button class="view-btn" data-view="person">
        <i data-lucide="users"></i> Por persona
      </button>
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
 * @param {string} view - 'recent' | 'person'
 */
export function renderTasks(tasks, view = 'recent') {
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

  if (view === 'recent') {
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
  } else if (view === 'person') {
    if (pending.length > 0) {
      const groups = {};
      pending.forEach(t => {
        const person = t.assignedTo || 'Sin asignar';
        if (!groups[person]) groups[person] = [];
        groups[person].push(t);
      });
      const keys = Object.keys(groups).filter(k => k !== 'Sin asignar').sort();
      if (groups['Sin asignar']) keys.push('Sin asignar');
      keys.forEach(person => {
        html += `
          <section class="list-section">
            <h3 class="list-section__title">${escapeHTML(person)} <span class="list-section__count">(${groups[person].length})</span></h3>
            <ul class="item-list" role="list">
              ${groups[person].map(renderTaskCard).join('')}
            </ul>
          </section>
        `;
      });
    }
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
  const assignedInfo = !isDone && task.assignedTo
    ? `<span class="item-card__assigned" style="display:inline-flex; align-items:center; gap:4px; margin-left:8px; color:var(--color-primary); font-weight:600;"><i data-lucide="user" style="width:14px; height:14px;"></i> Para: ${escapeHTML(task.assignedTo)}</span>`
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
        ${isDone && task.doneBy ? `<span style="display:block; font-size: 0.8rem; color: #888;">Hecho por ${escapeHTML(task.doneBy)}</span>` : ''}
        ${notesHtml}
        <div class="item-card__meta">

          <span class="item-card__by">por ${escapeHTML(task.addedBy || '')}</span>
          ${assignedInfo}
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
      const assignedInput = document.getElementById('tasks-input-assigned');
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

          assignedTo: assignedInput?.value.trim() || null,
        });
        titleInput.value = '';
        if (notesInput) notesInput.value = '';
        if (assignedInput) assignedInput.value = '';
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
      handlers.onClear();
    });
  }

  const viewToggle = document.getElementById('tasks-view-toggle');
  if (viewToggle) {
    const currentView = localStorage.getItem('tasksView') || 'recent';
    viewToggle.querySelectorAll('.view-btn').forEach(b => {
      b.classList.toggle('view-btn--active', b.dataset.view === currentView);
    });

    viewToggle.addEventListener('click', (e) => {
      const btn = e.target.closest('.view-btn');
      if (!btn) return;
      viewToggle.querySelectorAll('.view-btn').forEach(c => c.classList.remove('view-btn--active'));
      btn.classList.add('view-btn--active');
      if (handlers.onViewChange) {
        handlers.onViewChange(btn.dataset.view);
      }
    });
  }
}

function _escapeHTMLforAttr(str) {
  if (!str) return '';
  return String(str).replace(/"/g, '&quot;');
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
