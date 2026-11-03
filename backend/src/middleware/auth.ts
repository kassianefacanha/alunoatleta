import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Student, User, type UserRole } from '../models/index.js';

export interface AuthenticatedRequest extends Request {
  auth?: { userId: string; role: UserRole };
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ error: 'Autenticação necessária.' });
    return;
  }

  try {
    const claims = jwt.verify(token, env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
    if (typeof claims.sub !== 'string' || !['admin', 'teacher', 'student'].includes(String(claims.role))) {
      res.status(401).json({ error: 'Token de acesso inválido.' });
      return;
    }
    req.auth = { userId: claims.sub, role: claims.role as UserRole };
  } catch {
    res.status(401).json({ error: 'Token de acesso inválido ou expirado.' });
    return;
  }

  if (req.auth.role === 'teacher') {
    try {
      const activeTeacher = await User.exists({ _id: req.auth.userId, role: 'teacher', isActive: true });
      if (!activeTeacher) {
        res.status(401).json({ error: 'A conta está inativa ou não existe.' });
        return;
      }
    } catch (error) {
      next(error);
      return;
    }
  }
  next();
}

export function requireRoles(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      res.status(403).json({ error: 'Você não tem permissão para esta ação.' });
      return;
    }
    next();
  };
}

export function requireTeacherPermission(permission: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (req.auth?.role !== 'teacher') {
      next();
      return;
    }
    try {
      const teacher = await User.findById(req.auth.userId).select('teacherPermissions').lean();
      if (!teacher?.teacherPermissions.includes(permission)) {
        res.status(403).json({ error: 'Esta permissão não está habilitada para sua conta.' });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export async function requireApprovedStudent(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  if (req.auth?.role !== 'student') {
    next();
    return;
  }
  const profile = await Student.findOne({ userId: req.auth.userId }).select('enrollmentStatus').lean();
  if (profile?.enrollmentStatus !== 'approved') {
    res.status(403).json({ error: 'Sua inscrição ainda não foi aprovada.' });
    return;
  }
  next();
}
