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
const INVALID_TOKEN_ERRORS = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

async function sendHomeNotification({
  homeId,
  excludeUserName,
  body,
  type,
  resourceId,
}) {
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

  const response = await messaging.sendEachForMulticast({
    tokens: uniqueEntries.map((entry) => entry.token),
    data: {
      title: APP_TITLE,
      body,
      icon: APP_ICON,
      badge: APP_ICON,
      link: APP_LINK,
      type,
      homeId,
      resourceId,
    },
    webpush: {
      fcmOptions: {
        link: APP_LINK,
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

    await sendHomeNotification({
      homeId,
      excludeUserName: shoppingItem.addedBy,
      body: `${author} añadió ${itemName} a la compra.`,
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

    await sendHomeNotification({
      homeId,
      excludeUserName: after.boughtBy,
      body: `${buyer} compró ${itemName}.`,
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

    await sendHomeNotification({
      homeId,
      excludeUserName: task.addedBy,
      body: `${author} añadió la tarea ${taskTitle}.`,
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

    await sendHomeNotification({
      homeId,
      excludeUserName: after.doneBy,
      body: `${doneBy} completó ${taskTitle}.`,
      type: "task-done",
      resourceId: taskId,
    });
  },
);
