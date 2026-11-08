import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/environment.js";

const tokenSchema = z.object({
  sub: z.string().min(1),
  role: z.enum(["ADM", "PROFESSOR", "ALUNO"]),
});

export interface AuthenticatedRequest extends Request {
  user?: { id: string; role: "ADM" | "PROFESSOR" | "ALUNO" };
}

export function requireAuth(request: AuthenticatedRequest, response: Response, next: NextFunction) {
  const header = request.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    response.status(401).json({ message: "Entre na sua conta para continuar." });
    return;
  }
  try {
    const decoded = jwt.verify(header.slice(7), env.JWT_SECRET);
    const parsed = tokenSchema.safeParse(decoded);
    if (!parsed.success) {
      response.status(401).json({ message: "Sua sessão expirou. Entre novamente." });
      return;
    }
    request.user = { id: parsed.data.sub, role: parsed.data.role };
    next();
  } catch {
    response.status(401).json({ message: "Sua sessão expirou. Entre novamente." });
  }
}

export function allowRoles(...roles: Array<"ADM" | "PROFESSOR" | "ALUNO">) {
  return (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    if (!request.user || !roles.includes(request.user.role)) {
      response.status(403).json({ message: "Você não tem permissão para acessar este recurso." });
      return;
    }
    next();
  };
}
