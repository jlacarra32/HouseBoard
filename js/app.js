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
import { initPushNotifications } from './notifications.js';
import { analytics } from './firebase-config.js';
import { logEvent } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js';

// ─── Estado interno ───────────────────────────────────────────────────────────
let currentUser = '';
let currentHomeId = '';
let allShoppingItems = [];
let allTasks = [];
let shoppingView = localStorage.getItem('shoppingView') || 'recent';
let tasksView = localStorage.getItem('tasksView') || 'recent';
let unsubscribeShopping = null;
let unsubscribeTasks = null;

function trackAnalyticsEvent(eventName, params = {}) {
  if (!analytics) return;

  try {
    logEvent(analytics, eventName, params);
  } catch (error) {
    console.warn('Analytics no disponible para este evento:', eventName, error);
  }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  currentUser = localStorage.getItem('lrhome_user') || '';
  currentHomeId = localStorage.getItem('lrhome_homeId') || '';

  // Deep linking: detectar si venimos de una notificación con homeId
  const params = new URLSearchParams(window.location.search);
  const urlHomeId = params.get('homeId');
  if (urlHomeId && urlHomeId !== currentHomeId) {
    const savedHomes = JSON.parse(localStorage.getItem('lrhome_homes') || '[]');
    const hasAccess = savedHomes.some(h => 
      (typeof h === 'string' && h === urlHomeId) || 
      (h && typeof h === 'object' && (h.id === urlHomeId || h.homeId === urlHomeId))
    );
    
    if (hasAccess) {
      currentHomeId = urlHomeId;
      localStorage.setItem('lrhome_homeId', urlHomeId);
      // Limpiar URL para no dejar el query param
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  if (currentUser && currentHomeId) {
    startApp();
  } else {
    showWelcomeScreen();
  }

  // Detección de navegador y aviso de instalación
  checkPWAInstallation();
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
  trackAnalyticsEvent('sign_up', { method: 'home_creation' });
  startApp();
}

function startApp() {
  const app = document.getElementById('app');
  if (app) app.hidden = false;

  setActiveUser(currentUser);
  initPushNotifications(currentHomeId, currentUser);
  trackAnalyticsEvent('login', { content_type: 'app_start' });
  
  // Actualizar nombre de la casa en el header según se solicitó
  try {
    const homeId = localStorage.getItem('lrhome_homeId');
    if (homeId) {
      const homesDb = JSON.parse(localStorage.getItem('lrhome_homes') || '[]');
      const activeHome = homesDb.find(h => h && typeof h === 'object' && (h.id === homeId || h.homeId === homeId));
      if (activeHome && activeHome.name) {
        const headerName = document.getElementById('header-home-name');
        if (headerName) headerName.innerText = ` • ${activeHome.name}`;
      }
    }
  } catch(e) {}

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
        trackAnalyticsEvent('add_to_cart', {
          item_name: data.name,
          item_category: data.category,
        });
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
        if (status === 'pending') {
          trackAnalyticsEvent('purchase', { item_name: item?.name });
        }
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
        trackAnalyticsEvent('add_task', { task_title: data.title });
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
        if (status === 'pending') {
          trackAnalyticsEvent('complete_task', { task_title: task?.title });
        }
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

/**
 * Task 3: Detecta el navegador y muestra instrucciones de instalación PWA si es necesario.
 */
function checkPWAInstallation() {
  if (localStorage.getItem('lrhome_pwa_dismissed')) return;

  const ua = navigator.userAgent;
  let message = "";

  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSamsung = /SamsungBrowser/.test(ua);
  const isChromeAndroid = /Chrome/.test(ua) && /Android/.test(ua) && !isSamsung;
  const isSafariIOS = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|mercury/.test(ua);

  if (isSamsung) {
    message = "Para recibir notificaciones abre HouseBoard en Chrome y añádelo a la pantalla de inicio.";
  } else if (isSafariIOS) {
    message = "Añade HouseBoard a la pantalla de inicio para la mejor experiencia: pulsa compartir → Añadir a pantalla de inicio.";
  } else if (isIOS && !isSafariIOS) {
    message = "Las notificaciones en iPhone requieren Safari. Ábrelo en Safari y añádelo a la pantalla de inicio.";
  } else if (isChromeAndroid) {
    // Si no está ya en modo standalone (instalado)
    if (!window.matchMedia('(display-mode: standalone)').matches) {
      message = "Añade HouseBoard a la pantalla de inicio para la mejor experiencia: menú → Añadir a pantalla de inicio.";
    }
  }

  if (message) {
    showInstallBanner(message);
  }
}

function showInstallBanner(message) {
  const banner = document.createElement('div');
  banner.className = 'install-banner';
  banner.innerHTML = `
    <div class="install-banner__content">
      <p>${message}</p>
      <button class="install-banner__close" aria-label="Cerrar">✕</button>
    </div>
  `;
  document.body.appendChild(banner);

  banner.querySelector('.install-banner__close').addEventListener('click', () => {
    banner.remove();
    localStorage.setItem('lrhome_pwa_dismissed', 'true');
  });
}
