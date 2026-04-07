const fs = require('fs');
const path = require('path');

const config = `
/**
 * firebase-config.js
 * Generado automáticamente por Vercel durante el proceso de build
 * basándose en las Variables de Entorno.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "${process.env.FIREBASE_API_KEY || ''}",
  authDomain: "${process.env.FIREBASE_AUTH_DOMAIN || ''}",
  projectId: "${process.env.FIREBASE_PROJECT_ID || ''}",
  storageBucket: "${process.env.FIREBASE_STORAGE_BUCKET || ''}",
  messagingSenderId: "${process.env.FIREBASE_MESSAGING_SENDER_ID || ''}",
  appId: "${process.env.FIREBASE_APP_ID || ''}"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
`;

const jsDir = path.join(__dirname, 'js');
if (!fs.existsSync(jsDir)){
    fs.mkdirSync(jsDir);
}

fs.writeFileSync(path.join(jsDir, 'firebase-config.js'), config.trim());
console.log('firebase-config.js generado exitosamente por el build script.');
