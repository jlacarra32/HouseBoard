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

const getCollection = () => `homes/${localStorage.getItem('lrhome_homeId')}/tasks`;

export function subscribeToTasks(callback) {
  const q = query(
    collection(db, getCollection()),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    const tasks = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(tasks);
  });
}

export async function addTask(taskData) {
  const title = (taskData.title || '').trim();
  if (!title || title.length > 120) throw new Error('El título es obligatorio.');
  const notes = (taskData.notes || '').trim().slice(0, 300);
  await addDoc(collection(db, getCollection()), {
    title,
    notes,
    addedBy:    taskData.addedBy    || 'Desconocido',
    assignedTo: taskData.assignedTo || null,
    status:     'pending',
    createdAt:  serverTimestamp(),
    doneAt:     null,
    doneBy:     null,
  });
}

export async function toggleTask(taskId, currentStatus, userName) {
  const newStatus = currentStatus === 'pending' ? 'done' : 'pending';
  await updateDoc(doc(db, getCollection(), taskId), {
    status: newStatus,
    doneAt: newStatus === 'done' ? new Date() : null,
    doneBy: newStatus === 'done' ? (localStorage.getItem('lrhome_user') || userName || 'Desconocido') : null,
  });
}

export async function deleteTask(taskId) {
  await deleteDoc(doc(db, getCollection(), taskId));
}

export async function clearDoneTasks() {
  const q = query(collection(db, getCollection()), where('status', '==', 'done'));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return;
  const batch = writeBatch(db);
  snapshot.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}
