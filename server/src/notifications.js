import { sendEventEmail } from "./email.js";
import { db } from "./database/db.js";

export function notify(
  userId,
  type,
  title,
  message,
  entityType = null,
  entityId = null,
) {
  if (!Number.isInteger(Number(userId)) || Number(userId) <= 0) return;
  const pref = db
    .prepare(
      "SELECT notifications_enabled AS enabled FROM notification_preferences WHERE user_id=?",
    )
    .get(Number(userId));
  if (!pref || pref.enabled)
    db.prepare(
      "INSERT INTO notifications (user_id,type,title,message,entity_type,entity_id) VALUES (?,?,?,?,?,?)",
    ).run(
      Number(userId),
      type,
      title,
      message,
      entityType,
      entityId == null ? null : Number(entityId),
    );
  void sendEventEmail({
    userId: Number(userId),
    eventType: type,
    subject: title,
    text: message,
    entityType: entityType || "event",
    entityId: entityId ?? 0,
  });
}
export function notifyMany(
  userIds,
  type,
  title,
  message,
  entityType = null,
  entityId = null,
) {
  const insert = db.prepare(
    "INSERT INTO notifications (user_id,type,title,message,entity_type,entity_id) VALUES (?,?,?,?,?,?)",
  );
  const isEnabled = db.prepare(
    "SELECT notifications_enabled AS enabled FROM notification_preferences WHERE user_id=?",
  );
  const transaction = db.transaction((ids) => {
    for (const id of ids)
      if (Number.isInteger(Number(id)) && Number(id) > 0) {
        const pref = isEnabled.get(Number(id));
        if (!pref || pref.enabled)
          insert.run(
            Number(id),
            type,
            title,
            message,
            entityType,
            entityId == null ? null : Number(entityId),
          );
        void sendEventEmail({
          userId: Number(id),
          eventType: type,
          subject: title,
          text: message,
          entityType: entityType || "event",
          entityId: entityId ?? 0,
        });
      }
  });
  transaction([...new Set(userIds.map(Number))]);
}
