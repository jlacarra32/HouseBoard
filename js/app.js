/**
 * app.js
 * Única responsabilidad: coordinación, eventos globales y navegación entre módulos.
 * NO contiene lógica de Firestore directa.
 */

import { showModule, setActiveUser, showToast } from './ui-shared.js';
import { initSettingsPanel, subscribeToConfig, onShoppingCategoriesChange, onTaskAreasChange, onTaskMembersChange } from './ui-settings.js';
import {
  subscribeToShoppingItems,
  addShoppingItem,
  toggleShoppingItem,
  deleteShoppingItem,
  clearBoughtItems,
} from './db-shopping.js';
import {
  subscribeToTasks,
  addTask,
  toggleTask,
  deleteTask,
  clearDoneTasks,
} from './db-tasks.js';
import {
  initShoppingUI,
  renderShoppingItems,
  showShoppingSkeleton,
  hideShoppingSkeleton,
  toggleShoppingFAB,
  bindShoppingEvents,
} from './ui-shopping.js';
import {
  initTasksUI,
  renderTasks,
  showTasksSkeleton,
  hideTasksSkeleton,
  toggleTasksFAB,
  bindTasksEvents,
} from './ui-tasks.js';

// ─── Estado interno ───────────────────────────────────────────────────────────
let currentUser = '';
let allShoppingItems = [];
let allTasks = [];
let activeShoppingCategory = 'Todas';
let activeTaskArea = 'Todas';
let unsubscribeShopping = null;
let unsubscribeTasks = null;

// ─── Bootstrap ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  currentUser = localStorage.getItem('lrhome_user') || '';

  if (currentUser) {
    startApp();
  } else {
    showWelcomeScreen();
  }
});

function showWelcomeScreen() {
  const welcome = document.getElementById('welcome-screen');
  const app     = document.getElementById('app');
  if (welcome) welcome.hidden = false;
  if (app)     app.hidden     = true;

  const btn   = document.getElementById('welcome-btn');
  const input = document.getElementById('welcome-input');
  if (btn && input) {
    btn.addEventListener('click', handleWelcomeSubmit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleWelcomeSubmit();
    });
  }
}

function handleWelcomeSubmit() {
  const input = document.getElementById('welcome-input');
  const name = input?.value.trim();
  if (!name) {
    showToast('Escribe tu nombre para continuar.', 'error');
    input?.focus();
    return;
  }
  if (name.length > 30) {
    showToast('El nombre no puede superar los 30 caracteres.', 'error');
    return;
  }
  currentUser = name;
  localStorage.setItem('lrhome_user', name);
  document.getElementById('welcome-screen').hidden = true;
  startApp();
}

function startApp() {
  const app = document.getElementById('app');
  if (app) app.hidden = false;

  setActiveUser(currentUser);

  // Panel de ajustes (settings)
  initSettingsPanel();
  subscribeToConfig();

  // Cuando las categorías cambien, sync del select + filter bar
  onShoppingCategoriesChange((cats) => {
    const sel = document.getElementById('shopping-select-cat');
    if (sel) {
      const cur = sel.value;
      sel.innerHTML = cats.map(c => `<option value="${c}"${c===cur?' selected':''}>${c}</option>`).join('');
    }
    const bar = document.getElementById('shopping-filter-bar');
    if (bar) {
      const active = bar.querySelector('.chip--active')?.dataset.category || 'Todas';
      bar.innerHTML = `<button class="chip${active==='Todas'?' chip--active':''}" data-category="Todas">Todas</button>`
        + cats.map(c => `<button class="chip${c===active?' chip--active':''}" data-category="${c}">${c}</button>`).join('');
    }
  });

  // Cuando las áreas cambien, sync del select y el filter bar
  onTaskAreasChange((areas) => {
    const sel = document.getElementById('tasks-select-area');
    if (sel) {
      const cur = sel.value;
      sel.innerHTML = areas.map(a => `<option value="${a}"${a===cur?' selected':''}>${a}</option>`).join('');
    }
    const bar = document.getElementById('tasks-filter-bar');
    if (bar) {
      const active = bar.querySelector('.chip--active')?.dataset.area || 'Todas';
      bar.innerHTML = `<button class="chip${active==='Todas'?' chip--active':''}" data-area="Todas">Todas</button>`
        + areas.map(a => `<button class="chip${a===active?' chip--active':''}" data-area="${a}">${a}</button>`).join('');
    }
  });

  // Cuando los miembros cambien, sync del datalist
  onTaskMembersChange((members) => {
    const list = document.getElementById('tasks-members-list');
    if (list) {
      list.innerHTML = members.map(m => `<option value="${m.replace(/"/g, '&quot;')}">`).join('');
    }
  });

  // Inicializa el DOM de cada módulo
  initShoppingUI();
  initTasksUI();

  // Renderiza iconos Lucide globales
  if (window.lucide) window.lucide.createIcons();

  // Muestra el módulo de compra por defecto
  showModule('shopping-module');

  // Conecta eventos de módulos
  bindShoppingEvents({
    onAdd: async (data) => {
      try {
        await addShoppingItem({ ...data, addedBy: currentUser });
        showToast('Producto añadido 🛒', 'success');
      } catch (err) {
        showToast(err.message, 'error');
        throw err;
      }
    },
    onToggle: async (id, status) => {
      try {
        await toggleShoppingItem(id, status);
        const item = allShoppingItems.find(i => i.id === id);
        const msg = status === 'pending'
          ? `"${item?.name || 'Producto'}" marcado como comprado ✓`
          : `"${item?.name || 'Producto'}" de vuelta en la lista`;
        showToast(msg, 'success');
      } catch (err) {
        showToast('Error al actualizar el producto.', 'error');
      }
    },
    onDelete: async (id) => {
      try {
        const item = allShoppingItems.find(i => i.id === id);
        await deleteShoppingItem(id);
        showToast(`"${item?.name || 'Producto'}" eliminado.`, 'success');
      } catch (err) {
        showToast('Error al eliminar el producto.', 'error');
      }
    },
    onClear: async () => {
      try {
        await clearBoughtItems();
        showToast('Comprados eliminados. ¡A por la próxima compra!', 'success');
      } catch (err) {
        showToast('Error al limpiar la lista.', 'error');
      }
    },
    onCategoryFilter: (category) => {
      activeShoppingCategory = category;
      renderShoppingItems(allShoppingItems, activeShoppingCategory);
    },
  });

  bindTasksEvents({
    onAdd: async (data) => {
      try {
        await addTask({ ...data, addedBy: currentUser });
        showToast('Tarea añadida ✓', 'success');
      } catch (err) {
        showToast(err.message, 'error');
        throw err;
      }
    },
    onToggle: async (id, status) => {
      try {
        await toggleTask(id, status, currentUser);
        const task = allTasks.find(t => t.id === id);
        const msg = status === 'pending'
          ? `"${task?.title || 'Tarea'}" completada ✓`
          : `"${task?.title || 'Tarea'}" marcada como pendiente`;
        showToast(msg, 'success');
      } catch (err) {
        showToast('Error al actualizar la tarea.', 'error');
      }
    },
    onDelete: async (id) => {
      try {
        const task = allTasks.find(t => t.id === id);
        await deleteTask(id);
        showToast(`"${task?.title || 'Tarea'}" eliminada.`, 'success');
      } catch (err) {
        showToast('Error al eliminar la tarea.', 'error');
      }
    },
    onClear: async () => {
      try {
        await clearDoneTasks();
        showToast('Completadas eliminadas. ¡Bien hecho!', 'success');
      } catch (err) {
        showToast('Error al limpiar las tareas.', 'error');
      }
    },
    onAreaFilter: (area) => {
      activeTaskArea = area;
      renderTasks(allTasks, activeTaskArea);
    },
  });

  // Suscripciones Firestore (ambas activas desde el arranque)
  showShoppingSkeleton();
  showTasksSkeleton();

  unsubscribeShopping = subscribeToShoppingItems((items) => {
    allShoppingItems = items;
    hideShoppingSkeleton();
    renderShoppingItems(items, activeShoppingCategory);
    const hasBought = items.some(i => i.status === 'bought');
    toggleShoppingFAB(hasBought);
  });

  unsubscribeTasks = subscribeToTasks((tasks) => {
    allTasks = tasks;
    hideTasksSkeleton();
    renderTasks(tasks, activeTaskArea);
    const hasDone = tasks.some(t => t.status === 'done');
    toggleTasksFAB(hasDone);
  });

  // Navegación entre módulos
  document.querySelectorAll('[data-module]').forEach((tab) => {
    tab.addEventListener('click', () => {
      showModule(tab.dataset.module);
    });
  });
}
