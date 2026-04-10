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

const getCollection = () => `homes/${localStorage.getItem('lrhome_homeId')}/shoppingItems`;

export function normalizeShoppingItemName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es-ES');
}

async function findPendingShoppingDuplicate(name) {
  const normalizedName = normalizeShoppingItemName(name);
  if (!normalizedName) return null;

  const q = query(
    collection(db, getCollection()),
    where('status', '==', 'pending')
  );
  const snapshot = await getDocs(q);

  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .find((item) => normalizeShoppingItemName(item.name) === normalizedName) || null;
}

export function subscribeToShoppingItems(callback) {
  const q = query(
    collection(db, getCollection()),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(items);
  });
}

export async function addShoppingItem(itemData) {
  const name = (itemData.name || '').trim();
  if (!name || name.length > 80) throw new Error('El nombre es obligatorio.');

  const duplicateItem = await findPendingShoppingDuplicate(name);
  if (duplicateItem) {
    throw new Error(`"${duplicateItem.name}" ya esta en la lista`);
  }

  await addDoc(collection(db, getCollection()), {
    name,
    quantity:   (itemData.quantity || '').trim(),
    category:   itemData.category || 'Otros',
    addedBy:    itemData.addedBy  || 'Desconocido',
    status:     'pending',
    createdAt:  serverTimestamp(),
    boughtAt:   null,
  });
}

export async function toggleShoppingItem(itemId, currentStatus) {
  const newStatus = currentStatus === 'pending' ? 'bought' : 'pending';
  await updateDoc(doc(db, getCollection(), itemId), {
    status:  newStatus,
    boughtAt: newStatus === 'bought' ? new Date() : null,
    boughtBy: newStatus === 'bought' ? (localStorage.getItem('lrhome_user') || 'Desconocido') : null,
  });
}

export async function deleteShoppingItem(itemId) {
  await deleteDoc(doc(db, getCollection(), itemId));
}

export async function clearBoughtItems() {
  const q = query(collection(db, getCollection()), where('status', '==', 'bought'));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return;
  const batch = writeBatch(db);
  snapshot.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}
