/**
 * db-tasks.js
 * Única responsabilidad: operaciones CRUD de tareas del hogar en Firestore.
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

const COLLECTION = 'tasks';

/**
 * Suscripción en tiempo real a todas las tareas del hogar.
 * @param {function} callback - Recibe array de documentos con id incluido.
 * @returns {function} unsubscribe
 */
export function subscribeToTasks(callback) {
  const q = query(
    collection(db, COLLECTION),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    const tasks = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(tasks);
  });
}

/**
 * Añade una tarea al hogar.
 * @param {object} taskData - { title, notes, area, addedBy, assignedTo }
 */
export async function addTask(taskData) {
  const title = (taskData.title || '').trim();
  if (!title || title.length > 120) {
    throw new Error('El título de la tarea es obligatorio (máx. 120 caracteres).');
  }
  const notes = (taskData.notes || '').trim().slice(0, 300);
  await addDoc(collection(db, COLLECTION), {
    title,
    notes,
    area:       taskData.area       || 'Otros',
    addedBy:    taskData.addedBy    || 'Desconocido',
    assignedTo: taskData.assignedTo || null,
    status:     'pending',
    createdAt:  serverTimestamp(),
    doneAt:     null,
    doneBy:     null,
  });
}

/**
 * Alterna el estado de una tarea entre 'pending' y 'done'.
 * @param {string} taskId
 * @param {string} currentStatus - 'pending' | 'done'
 * @param {string} userName - Nombre de quien completa la tarea
 */
export async function toggleTask(taskId, currentStatus, userName) {
  const newStatus = currentStatus === 'pending' ? 'done' : 'pending';
  await updateDoc(doc(db, COLLECTION, taskId), {
    status: newStatus,
    doneAt: newStatus === 'done' ? serverTimestamp() : null,
    doneBy: newStatus === 'done' ? (userName || 'Desconocido') : null,
  });
}

/**
 * Elimina una tarea por su ID.
 * @param {string} taskId
 */
export async function deleteTask(taskId) {
  await deleteDoc(doc(db, COLLECTION, taskId));
}

/**
 * Elimina en WriteBatch todas las tareas con status 'done'.
 */
export async function clearDoneTasks() {
  const q = query(
    collection(db, COLLECTION),
    where('status', '==', 'done')
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return;
  const batch = writeBatch(db);
  snapshot.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}
