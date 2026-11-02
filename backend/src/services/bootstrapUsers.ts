import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { User, type UserRole } from '../models/index.js';

interface DefaultUser {
  email: string;
  password: string;
  role: Extract<UserRole, 'admin' | 'teacher'>;
}

function isDuplicateKeyError(error: unknown): error is { code: number } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

async function ensureDefaultUser({ email, password, role }: DefaultUser): Promise<void> {
  const existing = await User.findOne({ email }).select('role');
  if (existing) {
    if (existing.role !== role) {
      throw new Error(`O e-mail configurado para ${role} já pertence ao papel ${existing.role}.`);
    }
    console.info(`Usuário padrão ${role} já existe.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    await User.create({ email, passwordHash, role });
    console.info(`Usuário padrão ${role} criado.`);
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;

    const concurrentUser = await User.findOne({ email }).select('role');
    if (!concurrentUser || concurrentUser.role !== role) {
      throw new Error(`Não foi possível criar o usuário padrão ${role}: o e-mail já está em uso.`);
    }
  }
}

export async function bootstrapDefaultUsers(): Promise<void> {
  await User.init();

  const users: DefaultUser[] = [
    { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD, role: 'admin' },
    { email: env.TEACHER_EMAIL, password: env.TEACHER_PASSWORD, role: 'teacher' }
  ];

  for (const user of users) {
    await ensureDefaultUser(user);
  }
}
