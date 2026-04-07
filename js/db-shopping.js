/**
 * db-shopping.js
 * Única responsabilidad: operaciones CRUD de la lista de compra en Firestore.
 */

import { db } from './firebase-config.js';
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
  getDocs,
  where,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const COLLECTION = 'shoppingItems';

/**
 * Suscripción en tiempo real a todos los ítems de la lista de compra.
 * @param {function} callback - Recibe array de documentos con id incluido.
 * @returns {function} unsubscribe
 */
export function subscribeToShoppingItems(callback) {
  const q = query(
    collection(db, COLLECTION),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(items);
  });
}

/**
 * Añade un ítem a la lista de compra.
 * @param {object} itemData - { name, quantity, category, addedBy }
 */
export async function addShoppingItem(itemData) {
  const name = (itemData.name || '').trim();
  if (!name || name.length > 80) {
    throw new Error('El nombre del producto es obligatorio (máx. 80 caracteres).');
  }
  await addDoc(collection(db, COLLECTION), {
    name,
    quantity:   (itemData.quantity || '').trim(),
    category:   itemData.category || 'Otros',
    addedBy:    itemData.addedBy  || 'Desconocido',
    status:     'pending',
    createdAt:  serverTimestamp(),
    boughtAt:   null,
  });
}

/**
 * Alterna el estado de un ítem entre 'pending' y 'bought'.
 * @param {string} itemId
 * @param {string} currentStatus - 'pending' | 'bought'
 */
export async function toggleShoppingItem(itemId, currentStatus) {
  const newStatus = currentStatus === 'pending' ? 'bought' : 'pending';
  await updateDoc(doc(db, COLLECTION, itemId), {
    status:  newStatus,
    boughtAt: newStatus === 'bought' ? new Date() : null,
    boughtBy: newStatus === 'bought' ? (localStorage.getItem('lrhome_user') || 'Desconocido') : null,
  });
}

/**
 * Elimina un ítem por su ID.
 * @param {string} itemId
 */
export async function deleteShoppingItem(itemId) {
  await deleteDoc(doc(db, COLLECTION, itemId));
}

/**
 * Elimina en WriteBatch todos los ítems con status 'bought'.
 */
export async function clearBoughtItems() {
  const q = query(
    collection(db, COLLECTION),
    where('status', '==', 'bought')
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return;
  const batch = writeBatch(db);
  snapshot.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}
