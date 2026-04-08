const admin = require("firebase-admin");
const { logger } = require("firebase-functions");
const { setGlobalOptions } = require("firebase-functions/v2");
const {
  onDocumentCreated,
  onDocumentUpdated,
} = require("firebase-functions/v2/firestore");

admin.initializeApp();

setGlobalOptions({ region: 'europe-southwest1', maxInstances: 10 });

const db = admin.firestore();
const messaging = admin.messaging();
const APP_TITLE = "HouseBoard";
const APP_LINK = "/";
const APP_ICON = "/assets/icon.png";
const NOTIFICATION_DEBOUNCE_MS = 20_000;
const NOTIFICATION_LOCK_MS = 60_000;
const INVALID_TOKEN_ERRORS = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getPendingNotificationRef(homeId, type, userName) {
  const safeUserName = encodeURIComponent(userName || "anonymous");
  return db.doc(`homes/${homeId}/notificationDebounce/${type}__${safeUserName}`);
}

function buildGroupedNotificationBody(type, actorName, pendingEntries) {
  const actor = actorName || "Alguien";
  const count = pendingEntries.length;

  if (type === "shopping-created") {
    if (count <= 1) {
      const itemName = pendingEntries[0]?.label || "un producto";
      return `${actor} añadió ${itemName} a la compra.`;
    }

    return `${actor} añadió ${count} productos a la compra.`;
  }

  if (type === "task-created") {
    if (count <= 1) {
      const taskTitle = pendingEntries[0]?.label || "una tarea";
      return `${actor} añadió la tarea ${taskTitle}.`;
    }

    return `${actor} añadió ${count} tareas.`;
  }

  if (type === "shopping-bought") {
    if (count <= 1) {
      const itemName = pendingEntries[0]?.label || "un producto";
      return `${actor} compró ${itemName}.`;
    }

    return `${actor} compró ${count} productos.`;
  }

  if (type === "task-done") {
    if (count <= 1) {
      const taskTitle = pendingEntries[0]?.label || "una tarea";
      return `${actor} completó ${taskTitle}.`;
    }

    return `${actor} completó ${count} tareas.`;
  }

  return `${actor} realizó una actualización.`;
}

async function queueGroupedNotification({
  homeId,
  excludeUserName,
  actorName,
  entryLabel,
  resourceId,
  type,
}) {
  const queueRef = getPendingNotificationRef(homeId, type, excludeUserName || actorName);
  const queuedAt = admin.firestore.Timestamp.now();

  await db.runTransaction(async (transaction) => {
    const queueSnapshot = await transaction.get(queueRef);
    const queueData = queueSnapshot.exists ? queueSnapshot.data() : {};
    const pendingEntries = Array.isArray(queueData.pendingEntries)
      ? [...queueData.pendingEntries]
      : [];

    pendingEntries.push({
      label: entryLabel,
      resourceId: resourceId || "",
      queuedAt,
    });

    transaction.set(
      queueRef,
      {
        homeId,
        type,
        actorName: actorName || "Alguien",
        excludeUserName: excludeUserName || "",
        pendingEntries,
        pendingCount: pendingEntries.length,
        createdAt: queueData.createdAt || queuedAt,
        lastQueuedAt: queuedAt,
        updatedAt: queuedAt,
      },
      { merge: true },
    );
  });

  await wait(NOTIFICATION_DEBOUNCE_MS);
  await flushGroupedNotification(queueRef);
}

async function flushGroupedNotification(queueRef) {
  const lockId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const now = Date.now();

  const claim = await db.runTransaction(async (transaction) => {
    const queueSnapshot = await transaction.get(queueRef);

    if (!queueSnapshot.exists) {
      return { shouldSend: false, reason: "missing" };
    }

    const queueData = queueSnapshot.data();
    const pendingEntries = Array.isArray(queueData.pendingEntries)
      ? queueData.pendingEntries
      : [];

    if (pendingEntries.length === 0) {
      return { shouldSend: false, reason: "empty" };
    }

    const lastQueuedAtMs = queueData.lastQueuedAt?.toMillis?.() || 0;
    const processingLockUntilMs = queueData.processingLockUntil?.toMillis?.() || 0;

    if (now - lastQueuedAtMs < NOTIFICATION_DEBOUNCE_MS) {
      return { shouldSend: false, reason: "debounce-window-open" };
    }

    if (processingLockUntilMs > now) {
      return { shouldSend: false, reason: "locked" };
    }

    transaction.update(queueRef, {
      processingLockId: lockId,
      processingLockUntil: admin.firestore.Timestamp.fromMillis(now + NOTIFICATION_LOCK_MS),
      processingStartedAt: admin.firestore.Timestamp.fromMillis(now),
    });

    return {
      shouldSend: true,
      queueData,
      pendingEntries,
      lockId,
    };
  });

  if (!claim.shouldSend) {
    logger.info("Skipping grouped notification flush", {
      path: queueRef.path,
      reason: claim.reason,
    });
    return;
  }

  const body = buildGroupedNotificationBody(
    claim.queueData.type,
    claim.queueData.actorName,
    claim.pendingEntries,
  );
  const resourceId = claim.pendingEntries.length === 1
    ? (claim.pendingEntries[0]?.resourceId || "")
    : "";

  try {
    await sendHomeNotification({
      homeId: claim.queueData.homeId,
      excludeUserName: claim.queueData.excludeUserName,
      body,
      type: claim.queueData.type,
      resourceId,
    });

    await db.runTransaction(async (transaction) => {
      const queueSnapshot = await transaction.get(queueRef);

      if (!queueSnapshot.exists) return;

      const queueData = queueSnapshot.data();
      if (queueData.processingLockId !== claim.lockId) return;

      transaction.delete(queueRef);
    });
  } catch (error) {
    logger.error("Error sending grouped notification", {
      path: queueRef.path,
      error,
    });

    await db.runTransaction(async (transaction) => {
      const queueSnapshot = await transaction.get(queueRef);

      if (!queueSnapshot.exists) return;

      const queueData = queueSnapshot.data();
      if (queueData.processingLockId !== claim.lockId) return;

      transaction.update(queueRef, {
        processingLockId: admin.firestore.FieldValue.delete(),
        processingLockUntil: admin.firestore.FieldValue.delete(),
        processingStartedAt: admin.firestore.FieldValue.delete(),
      });
    });

    throw error;
  }
}

async function sendHomeNotification({
  homeId,
  excludeUserName,
  body,
  type,
  resourceId,
}) {
  // Obtener el nombre de la casa si es posible
  let homeName = "HouseBoard";
  try {
    const homeDoc = await db.doc(`homes/${homeId}`).get();
    if (homeDoc.exists) {
      homeName = homeDoc.get("name") || "HouseBoard";
    }
  } catch (err) {
    logger.error("Error fetching home name", { homeId, err });
  }

  const membersSnapshot = await db.collection(`homes/${homeId}/members`).get();
  const tokenEntries = membersSnapshot.docs
    .filter((memberDoc) => memberDoc.id !== excludeUserName)
    .map((memberDoc) => ({
      ref: memberDoc.ref,
      userName: memberDoc.id,
      token: memberDoc.get("fcmToken"),
    }))
    .filter((entry) => typeof entry.token === "string" && entry.token.trim());

  if (tokenEntries.length === 0) {
    logger.info("No push recipients for home event", { homeId, type, resourceId });
    return;
  }

  const uniqueEntries = [];
  const seenTokens = new Set();
  for (const entry of tokenEntries) {
    const token = entry.token.trim();
    if (seenTokens.has(token)) continue;
    seenTokens.add(token);
    uniqueEntries.push({ ...entry, token });
  }

  const notificationTitle = `${homeName} · HouseBoard`;
  const notificationLink = `${APP_LINK}?homeId=${homeId}`;

  const response = await messaging.sendEachForMulticast({
    tokens: uniqueEntries.map((entry) => entry.token),
    data: {
      title: notificationTitle,
      body,
      icon: APP_ICON,
      badge: APP_ICON,
      link: notificationLink,
      type,
      homeId,
      resourceId,
    },
    webpush: {
      fcmOptions: {
        link: notificationLink,
      },
    },
  });

  if (response.failureCount === 0) {
    logger.info("Push notifications sent", {
      homeId,
      type,
      resourceId,
      count: response.successCount,
    });
    return;
  }

  const batch = db.batch();
  let hasBatchWrites = false;

  response.responses.forEach((result, index) => {
    if (!result.error) return;

    const entry = uniqueEntries[index];
    logger.error("Push delivery failed", {
      homeId,
      type,
      resourceId,
      userName: entry.userName,
      code: result.error.code,
      message: result.error.message,
    });

    if (INVALID_TOKEN_ERRORS.has(result.error.code)) {
      batch.set(entry.ref, { fcmToken: admin.firestore.FieldValue.delete() }, { merge: true });
      hasBatchWrites = true;
    }
  });

  if (hasBatchWrites) {
    await batch.commit();
  }
}

exports.notifyShoppingItemCreated = onDocumentCreated(
  "homes/{homeId}/shoppingItems/{itemId}",
  async (event) => {
    const shoppingItem = event.data?.data();
    const homeId = event.params.homeId;
    const itemId = event.params.itemId;

    if (!shoppingItem || !homeId || !itemId) return;

    const author = shoppingItem.addedBy || "Alguien";
    const itemName = shoppingItem.name || "un producto";

    await queueGroupedNotification({
      homeId,
      excludeUserName: shoppingItem.addedBy,
      actorName: author,
      entryLabel: itemName,
      type: "shopping-created",
      resourceId: itemId,
    });
  },
);

exports.notifyShoppingItemBought = onDocumentUpdated(
  "homes/{homeId}/shoppingItems/{itemId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const homeId = event.params.homeId;
    const itemId = event.params.itemId;

    if (!before || !after || !homeId || !itemId) return;
    if (before.status === after.status || after.status !== "bought") return;

    const buyer = after.boughtBy || "Alguien";
    const itemName = after.name || "un producto";

    await queueGroupedNotification({
      homeId,
      excludeUserName: after.boughtBy,
      actorName: buyer,
      entryLabel: itemName,
      type: "shopping-bought",
      resourceId: itemId,
    });
  },
);

exports.notifyTaskCreated = onDocumentCreated(
  "homes/{homeId}/tasks/{taskId}",
  async (event) => {
    const task = event.data?.data();
    const homeId = event.params.homeId;
    const taskId = event.params.taskId;

    if (!task || !homeId || !taskId) return;

    const author = task.addedBy || "Alguien";
    const taskTitle = task.title || "una tarea";

    await queueGroupedNotification({
      homeId,
      excludeUserName: task.addedBy,
      actorName: author,
      entryLabel: taskTitle,
      type: "task-created",
      resourceId: taskId,
    });
  },
);

exports.notifyTaskDone = onDocumentUpdated(
  "homes/{homeId}/tasks/{taskId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const homeId = event.params.homeId;
    const taskId = event.params.taskId;

    if (!before || !after || !homeId || !taskId) return;
    if (before.status === after.status || after.status !== "done") return;

    const doneBy = after.doneBy || "Alguien";
    const taskTitle = after.title || "una tarea";

    await queueGroupedNotification({
      homeId,
      excludeUserName: after.doneBy,
      actorName: doneBy,
      entryLabel: taskTitle,
      type: "task-done",
      resourceId: taskId,
    });
  },
);
