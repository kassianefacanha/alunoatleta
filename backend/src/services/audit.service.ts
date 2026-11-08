import { AuditLog } from "../models/index.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

export async function recordAudit(
  request: AuthenticatedRequest,
  action: string,
  resourceType: string,
  resourceId?: string,
  metadata?: Record<string, unknown>,
) {
  if (!request.user?.id) {
    throw new Error("Não é possível gravar auditoria sem um usuário autenticado.");
  }
  await AuditLog.create({
    actorId: request.user.id,
    action,
    resourceType,
    resourceId,
    ip: request.ip,
    metadata,
  });
}
