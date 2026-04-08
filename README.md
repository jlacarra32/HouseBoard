# HouseBoard 🏠

**HouseBoard** es una aplicación web familiar para organizar el hogar de forma compartida en tiempo real. Permite gestionar la **lista de la compra** y las **tareas del hogar** desde cualquier dispositivo, sin instalación ni registro. Basta con compartir la URL para que todos los miembros del hogar vean los cambios al instante.

---

## Stack tecnológico

| Tecnología | Versión / CDN |
|---|---|
| HTML / CSS / JS | ES2022+, Vanilla (sin frameworks) |
| Firebase SDK | `firebase@10.12.2` (CDN gstatic) |
| Lucide Icons | `lucide@latest` (unpkg CDN) |
| Google Fonts (Inter) | Google Fonts CDN |
| Hosting | [Vercel](https://vercel.com) |

---

## Estructura de la app

```
lr-home/
├── index.html              ← Shell única: pantalla de bienvenida + app
├── vercel.json             ← Rewrites SPA + inyección de env vars
├── .gitignore
├── .env.example
├── css/
│   ├── reset.css
│   ├── styles.css          ← Variables, layout global, componentes
│   ├── shopping.css        ← Estilos módulo compra
│   └── tasks.css           ← Estilos módulo tareas
├── js/
│   ├── firebase-config.js  ← Inicialización Firebase
│   ├── db-shopping.js      ← CRUD lista de compra
│   ├── db-tasks.js         ← CRUD tareas del hogar
│   ├── ui-shopping.js      ← Render módulo compra
│   ├── ui-tasks.js         ← Render módulo tareas
│   ├── ui-shared.js        ← Toast, showModule, setActiveUser
│   └── app.js              ← Coordinación y navegación
└── assets/                 ← Reservado para recursos futuros
```

### Módulos de la app

- **Lista de la Compra**: Añade productos con nombre, cantidad y categoría. Filtra por categoría, marca como comprado y limpia la lista con un toque.
- **Tareas del Hogar**: Añade tareas con título, notas y área. Marca como hecha (registra quién la completó) y limpia las completadas.
- **Sincronización en tiempo real**: Dos personas en distintas pestañas ven los cambios instantáneamente gracias a Firestore `onSnapshot`.

---

## Configuración local (paso a paso)

### 1. Clonar el repositorio

```bash
git clone https://github.com/TU_USUARIO/lr-home.git
cd lr-home
```

### 2. Crear el proyecto en Firebase

1. Ve a [console.firebase.google.com](https://console.firebase.google.com) y crea un nuevo proyecto (p.ej. `lr-home`).
2. En el panel izquierdo, ve a **Firestore Database** → **Crear base de datos**.
3. Elige **Iniciar en modo de prueba** (permite lectura/escritura sin autenticación durante 30 días, suficiente para empezar).
4. En **Configuración del proyecto** (ícono de engranaje) → **Tus apps** → **Agregar app web** (`</>`).
5. Copia el objeto `firebaseConfig` que te muestra Firebase.

### 3. Configurar credenciales locales

```bash
# Copia la plantilla de variables de entorno
cp .env.example .env
```

Abre `.env` y rellena cada variable con los valores del paso anterior:

```env
FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXX
FIREBASE_AUTH_DOMAIN=lr-home.firebaseapp.com
FIREBASE_PROJECT_ID=lr-home
FIREBASE_STORAGE_BUCKET=lr-home.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789012
FIREBASE_APP_ID=1:123456789012:web:xxxxxxxxxxxxxxxx
FIREBASE_VAPID_KEY=BKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Para **desarrollo local**, pega temporalmente esos valores directamente en `js/firebase-config.js` en el bloque marcado como `DEV_CONFIG`. **Nunca hagas commit con datos reales.**

> ⚠️ El archivo `.env` está en `.gitignore` y nunca se sube a GitHub.

### 4. Probar en local

**Opción A — Live Server (VS Code):**  
Instala la extensión Live Server → clic derecho sobre `index.html` → *Open with Live Server*.

**Opción B — npx serve:**
```bash
npx serve .
```

Abre `http://localhost:3000` (o el puerto que indique) en el navegador.

---

## Despliegue en Vercel

1. En [vercel.com](https://vercel.com), importa tu repositorio de GitHub.
2. Antes de hacer el primer deploy, ve a **Settings → Environment Variables**.
3. Añade cada variable de entorno (las mismas que en `.env`):

   | Nombre | Valor |
   |---|---|
   | `FIREBASE_API_KEY` | Tu API Key |
   | `FIREBASE_AUTH_DOMAIN` | `tu-proyecto.firebaseapp.com` |
   | `FIREBASE_PROJECT_ID` | `tu-proyecto` |
   | `FIREBASE_STORAGE_BUCKET` | `tu-proyecto.appspot.com` |
   | `FIREBASE_MESSAGING_SENDER_ID` | `123456789012` |
   | `FIREBASE_APP_ID` | `1:xxx:web:xxx` |
   | `FIREBASE_VAPID_KEY` | `BK...` (clave publica Web Push) |

4. Activa las variables para **Production** (y opcionalmente Preview).
5. Haz **Deploy**. Vercel inyecta las variables como `window.__ENV__` en tiempo de build gracias a `vercel.json`.

Para que las notificaciones push web funcionen, activa **Cloud Messaging** en Firebase Console y copia la **clave publica de Web Push** en `FIREBASE_VAPID_KEY`.

> **Nota**: como la app es 100% estática (HTML + JS sin bundler), las variables de entorno deben inyectarse en el HTML mediante el bloque `<script>window.__ENV__ = {...}</script>`. Si ves errores de Firebase en producción, verifica el paso de inyección en `vercel.json` o usa un [Edge Middleware](https://vercel.com/docs/functions/edge-middleware) para inyectarlas dinámicamente.

---

## Añadir un miembro del hogar

No hay registro ni cuentas. Simplemente **comparte la URL** de la app con quien quieras. Al abrir la app, cada persona introduce su nombre y empieza a colaborar. Todos los cambios son visibles en tiempo real para todos los usuarios conectados.

---

## Próximas funcionalidades sugeridas

- 🔔 **Recordatorios**: notificaciones push para tareas con fecha límite.
- 👤 **Roles**: distinguir entre administrador del hogar y miembro regular.
- 📅 **Historial**: log de acciones con fecha y usuario para saber quién hizo qué.
- 🔁 **Tareas recurrentes**: que se regeneren automáticamente cada semana o mes.
- 📊 **Dashboard**: resumen visual de la actividad del hogar.
- 🔐 **Autenticación**: login familiar para mayor privacidad entre hogares distintos.

---

## Licencia

MIT — úsala, modifícala y compártela libremente.
