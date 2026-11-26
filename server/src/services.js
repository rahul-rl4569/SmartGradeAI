import { randomBytes } from "node:crypto";

export function createEnrollmentCode() {
  return randomBytes(5).toString("hex").toUpperCase();
}

export function writeAudit(
  db,
  actorId,
  action,
  entityType,
  entityId,
  metadata = null,
) {
  db.prepare(
    "INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json) VALUES (?, ?, ?, ?, ?)",
  ).run(
    actorId ?? null,
    action,
    entityType ?? null,
    entityId == null ? null : String(entityId),
    metadata ? JSON.stringify(metadata) : null,
  );
}

export function parsePositiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
