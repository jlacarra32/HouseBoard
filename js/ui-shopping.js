/**
 * ui-shopping.js
 * Única responsabilidad: render del módulo Lista de la Compra.
 */

import { showToast } from './ui-shared.js';
import { shoppingCategories } from './ui-settings.js';

/** Inyecta el HTML del módulo en el contenedor #shopping-module */
export function initShoppingUI() {
  const container = document.getElementById('shopping-module');
  if (!container) return;

  container.innerHTML = `
    <!-- Formulario añadir ítem -->
    <div class="card add-form" id="shopping-form-card">
      <form id="shopping-form" novalidate>
        <div class="form-group">
          <input
            type="text"
            id="shopping-input-name"
            class="form-input"
            placeholder="¿Qué falta en casa?"
            maxlength="80"
            autocomplete="off"
            required
          />
        </div>
        <div class="form-row">
          <div class="form-group">
            <input
              type="text"
              id="shopping-input-qty"
              class="form-input"
              placeholder="Cantidad (ej: 2, 500g)"
              maxlength="30"
              autocomplete="off"
            />
          </div>
          <div class="form-group">
            <select id="shopping-select-cat" class="form-select">
              ${shoppingCategories.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
        </div>
        <button type="submit" class="btn btn--primary btn--full btn--pill" id="shopping-submit-btn">
          <i data-lucide="plus" class="btn__icon"></i>
          <span class="btn__text">Añadir a la lista</span>
          <span class="btn__spinner" hidden></span>
        </button>
      </form>
    </div>

    <!-- Controles de vista -->
    <div class="view-toggle" id="shopping-view-toggle">
      <button class="view-btn" data-view="recent">
        <i data-lucide="clock"></i> Reciente
      </button>
      <button class="view-btn" data-view="category">
        <i data-lucide="layout-list"></i> Por categoría
      </button>
    </div>

    <!-- Skeleton de carga -->
    <div id="shopping-skeleton" class="skeleton-list" aria-hidden="true">
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
    </div>

    <!-- Lista de ítems -->
    <div id="shopping-list" hidden></div>

    <!-- FAB limpiar comprados -->
    <button class="fab" id="shopping-fab" hidden aria-label="Limpiar productos comprados">
      <i data-lucide="trash-2" class="fab__icon"></i>
      <span>Limpiar comprados</span>
    </button>
  `;

  // Renderiza iconos Lucide del módulo recién insertado
  if (window.lucide) window.lucide.createIcons({ nodes: [container] });
}

/**
 * Renderiza la lista de ítems según la vista elegida.
 * @param {Array} items - Todos los ítems de Firestore
 * @param {string} view - 'recent' | 'category'
 */
export function renderShoppingItems(items, view = 'recent') {
  const container = document.getElementById('shopping-list');
  if (!container) return;

  const pending = items.filter(i => i.status === 'pending');
  const bought  = items.filter(i => i.status === 'bought');

  if (items.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__emoji">🛒</div>
        <h2 class="empty-state__title">La lista está vacía</h2>
        <p class="empty-state__subtitle">Añade lo que falta en casa</p>
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
            Por comprar <span class="list-section__count">(${pending.length})</span>
          </h3>
          <ul class="item-list" role="list">
            ${pending.map(renderShoppingCard).join('')}
          </ul>
        </section>
      `;
    }
  } else if (view === 'category') {
    if (pending.length > 0) {
      const groups = {};
      pending.forEach(i => {
        const cat = i.category || 'Otros';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(i);
      });
      Object.keys(groups).sort().forEach(cat => {
        html += `
          <section class="list-section">
            <h3 class="list-section__title">${escapeHTML(cat)} <span class="list-section__count">(${groups[cat].length})</span></h3>
            <ul class="item-list" role="list">
              ${groups[cat].map(renderShoppingCard).join('')}
            </ul>
          </section>
        `;
      });
    }
  }

  if (bought.length > 0) {
    html += `
      <section class="list-section list-section--done">
        <h3 class="list-section__title">
          Ya en el carro <span class="list-section__count">(${bought.length})</span>
        </h3>
        <ul class="item-list" role="list">
          ${bought.map(renderShoppingCard).join('')}
        </ul>
      </section>
    `;
  }

  container.innerHTML = html;

  // Renderiza iconos Lucide de los elementos recién insertados
  if (window.lucide) window.lucide.createIcons({ nodes: [container] });
}

function renderShoppingCard(item) {
  const isBought = item.status === 'bought';
  return `
    <li class="item-card ${isBought ? 'item-card--done' : ''}" data-id="${item.id}" role="listitem">
      <button
        class="item-card__check ${isBought ? 'item-card__check--done' : ''}"
        data-action="toggle"
        data-id="${item.id}"
        data-status="${item.status}"
        aria-label="${isBought ? 'Marcar como pendiente' : 'Marcar como comprado'}"
        aria-pressed="${isBought}"
      >
        <i data-lucide="check" class="check-icon"></i>
      </button>
      <div class="item-card__body">
        <span class="item-card__name ${isBought ? 'item-card__name--done' : ''}">${escapeHTML(item.name)}</span>
        ${isBought && item.boughtBy ? `<span style="display:block; font-size: 0.8rem; color: #888;">Comprado por ${escapeHTML(item.boughtBy)}</span>` : ''}
        <div class="item-card__meta">
          ${item.quantity ? `<span class="item-card__qty">${escapeHTML(item.quantity)}</span>` : ''}
          <span class="badge">${escapeHTML(item.category || 'Otros')}</span>
          <span class="item-card__by">por ${escapeHTML(item.addedBy || '')}</span>
        </div>
      </div>
      <button
        class="item-card__delete"
        data-action="delete"
        data-id="${item.id}"
        aria-label="Eliminar ${escapeHTML(item.name)}"
      >
        <i data-lucide="trash-2"></i>
      </button>
    </li>
  `;
}

export function showShoppingSkeleton() {
  const sk = document.getElementById('shopping-skeleton');
  const list = document.getElementById('shopping-list');
  if (sk) sk.hidden = false;
  if (list) list.hidden = true;
}

export function hideShoppingSkeleton() {
  const sk = document.getElementById('shopping-skeleton');
  const list = document.getElementById('shopping-list');
  if (sk) sk.hidden = true;
  if (list) list.hidden = false;
}

export function toggleShoppingFAB(show) {
  const fab = document.getElementById('shopping-fab');
  if (fab) {
    fab.hidden = !show;
  }
}

/**
 * Conecta todos los eventos del módulo de compra.
 * @param {object} handlers - { onAdd, onToggle, onDelete, onClear, onCategoryFilter }
 */
export function bindShoppingEvents(handlers) {
  // Formulario submit
  const form = document.getElementById('shopping-form');
  const submitBtn = document.getElementById('shopping-submit-btn');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('shopping-input-name');
      const qtyInput  = document.getElementById('shopping-input-qty');
      const catSelect = document.getElementById('shopping-select-cat');
      const name = nameInput?.value.trim();
      if (!name) {
        nameInput?.focus();
        showToast('Escribe el nombre del producto.', 'error');
        return;
      }
      // Estado de carga
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.querySelector('.btn__text').hidden = true;
        submitBtn.querySelector('.btn__spinner').hidden = false;
      }
      try {
        await handlers.onAdd({
          name,
          quantity: qtyInput?.value.trim() || '',
          category: catSelect?.value || 'Otros',
        });
        nameInput.value = '';
        if (qtyInput) qtyInput.value = '';
        nameInput.focus();
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.querySelector('.btn__text').hidden = false;
          submitBtn.querySelector('.btn__spinner').hidden = true;
        }
      }
    });
  }

  // Delegación de eventos en la lista (toggle + delete)
  const listEl = document.getElementById('shopping-list');
  if (listEl) {
    listEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id, status } = btn.dataset;
      if (action === 'toggle') handlers.onToggle(id, status);
      if (action === 'delete') handlers.onDelete(id);
    });
  }

  // FAB limpiar comprados
  const fab = document.getElementById('shopping-fab');
  if (fab) {
    fab.addEventListener('click', () => {
      handlers.onClear();
    });
  }

  // Controles de Vista
  const viewToggle = document.getElementById('shopping-view-toggle');
  if (viewToggle) {
    // Inicializar estado visual basado en la variable de localStorage o fallback
    const currentView = localStorage.getItem('shoppingView') || 'recent';
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

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
