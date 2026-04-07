/**
 * app.js
 * Única responsabilidad: coordinación, eventos globales y navegación entre módulos.
 * NO contiene lógica de Firestore directa.
 */

import { showModule, setActiveUser, showToast } from './ui-shared.js';
import { initSettingsPanel, subscribeToConfig, onShoppingCategoriesChange, onTaskMembersChange } from './ui-settings.js';
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

import { createHome, joinHome } from './db-homes.js';

// ─── Estado interno ───────────────────────────────────────────────────────────
let currentUser = '';
let currentHomeId = '';
let allShoppingItems = [];
let allTasks = [];
let shoppingView = localStorage.getItem('shoppingView') || 'recent';
let tasksView = localStorage.getItem('tasksView') || 'recent';
let unsubscribeShopping = null;
let unsubscribeTasks = null;

// ─── Bootstrap ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  currentUser = localStorage.getItem('lrhome_user') || '';
  currentHomeId = localStorage.getItem('lrhome_homeId') || '';

  if (currentUser && currentHomeId) {
    startApp();
  } else {
    showWelcomeScreen();
  }
});

function showWelcomeScreen() {
  const welcome = document.getElementById('welcome-screen');
  const app = document.getElementById('app');
  if (welcome) welcome.hidden = false;
  if (app) app.hidden = true;

  if (currentUser) {
    document.getElementById('welcome-step-1').hidden = true;
    document.getElementById('welcome-step-2').hidden = false;
  }

  // Paso 1: Pedir nombre
  const btnNext = document.getElementById('welcome-btn-next');
  const inputName = document.getElementById('welcome-input');
  
  if (btnNext && inputName) {
    if (currentUser) inputName.value = currentUser;
    btnNext.addEventListener('click', () => {
      const name = inputName.value.trim();
      if (!name || name.length > 30) return showToast('Escribe un nombre válido (máx 30).', 'error');
      
      currentUser = name;
      localStorage.setItem('lrhome_user', name);
      document.getElementById('welcome-step-1').hidden = true;
      document.getElementById('welcome-step-2').hidden = false;
    });
  }

  // Paso 2: Crear o Unirse a Casa
  document.getElementById('welcome-btn-create-view').addEventListener('click', () => {
    document.getElementById('welcome-home-options').hidden = true;
    document.getElementById('welcome-create-form').hidden = false;
  });

  document.getElementById('welcome-btn-join-view').addEventListener('click', () => {
    document.getElementById('welcome-home-options').hidden = true;
    document.getElementById('welcome-join-form').hidden = false;
  });

  document.querySelectorAll('.welcome-btn-back').forEach(b => b.addEventListener('click', () => {
    document.getElementById('welcome-create-form').hidden = true;
    document.getElementById('welcome-join-form').hidden = true;
    document.getElementById('welcome-home-options').hidden = false;
  }));

  const btnCreate = document.getElementById('welcome-btn-create');
  const inputHomeName = document.getElementById('welcome-home-name');
  btnCreate.addEventListener('click', async () => {
    const homeName = inputHomeName.value.trim();
    if (!homeName) return showToast('Nombre de casa inválido.', 'error');
    try {
      const { homeId, code } = await createHome(homeName, currentUser);
      finishWelcome(homeId);
      showToast(`¡Casa creada! Código: ${code}`, 'success');
    } catch (e) { showToast(e.message, 'error'); }
  });

  const btnJoin = document.getElementById('welcome-btn-join');
  const inputHomeCode = document.getElementById('welcome-home-code');
  btnJoin.addEventListener('click', async () => {
    const code = inputHomeCode.value.trim().toUpperCase();
    if (code.length !== 6) return showToast('Código inválido.', 'error');
    try {
      const homeId = await joinHome(code, currentUser);
      finishWelcome(homeId);
    } catch (e) { showToast(e.message, 'error'); }
  });
}

function finishWelcome(homeId) {
  currentHomeId = homeId;
  localStorage.setItem('lrhome_homeId', homeId);
  const homes = JSON.parse(localStorage.getItem('lrhome_homes') || '[]');
  if (!homes.includes(homeId)) {
    homes.push(homeId);
    localStorage.setItem('lrhome_homes', JSON.stringify(homes));
  }
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

  // Cuando las categorías cambien, sync del select
  onShoppingCategoriesChange((cats) => {
    const sel = document.getElementById('shopping-select-cat');
    if (sel) {
      const cur = sel.value;
      sel.innerHTML = cats.map(c => `<option value="${c}"${c===cur?' selected':''}>${c}</option>`).join('');
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
    onViewChange: (view) => {
      shoppingView = view;
      localStorage.setItem('shoppingView', view);
      renderShoppingItems(allShoppingItems, shoppingView);
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
    onViewChange: (view) => {
      tasksView = view;
      localStorage.setItem('tasksView', view);
      renderTasks(allTasks, tasksView);
    },
  });

  // Suscripciones Firestore (ambas activas desde el arranque)
  showShoppingSkeleton();
  showTasksSkeleton();

  unsubscribeShopping = subscribeToShoppingItems((items) => {
    allShoppingItems = items;
    hideShoppingSkeleton();
    renderShoppingItems(items, shoppingView);
    const hasBought = items.some(i => i.status === 'bought');
    toggleShoppingFAB(hasBought);
  });

  unsubscribeTasks = subscribeToTasks((tasks) => {
    allTasks = tasks;
    hideTasksSkeleton();
    renderTasks(tasks, tasksView);
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
