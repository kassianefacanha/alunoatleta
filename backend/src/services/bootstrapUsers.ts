import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { SportsClass, Student, User, type UserRole } from '../models/index.js';

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
  await Student.init();

  const users: DefaultUser[] = [
    { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD, role: 'admin' },
    { email: env.TEACHER_EMAIL, password: env.TEACHER_PASSWORD, role: 'teacher' }
  ];

  for (const user of users) {
    await ensureDefaultUser(user);
  }

  if (env.TEST_STUDENT_EMAIL && env.TEST_STUDENT_PASSWORD) {
    await ensureTestStudent(env.TEST_STUDENT_EMAIL, env.TEST_STUDENT_PASSWORD);
  }
}

function calculateAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  if (today.getMonth() < birthDate.getMonth() ||
      (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())) age -= 1;
  return age;
}

async function ensureTestStudent(email: string, password: string): Promise<void> {
  let user = await User.findOne({ email }).select('role');
  if (user) {
    if (user.role !== 'student') {
      throw new Error('O e-mail configurado para TEST_STUDENT_EMAIL já pertence a outro perfil.');
    }
    const profile = await Student.findOne({ userId: user._id }).select('enrollmentStatus');
    if (!profile || profile.enrollmentStatus !== 'approved') {
      throw new Error('A conta de teste existente não tem um perfil aprovado; revise-a antes de iniciar.');
    }
    console.info('Perfil de aluno de teste já existe.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const createdUser = await User.create({ email, passwordHash, role: 'student', isActive: true });
  let createdStudentId: string | undefined;
  try {
    const sportsClass = await SportsClass.findOne({ isActive: true }).sort({ name: 1 }).select('_id modality');
    const birthDate = new Date('2010-06-15T12:00:00.000Z');
    const student = await Student.create({
      userId: createdUser._id,
      fullName: 'Aluno de Teste',
      birthDate,
      age: calculateAge(birthDate),
      sex: 'Prefiro não informar',
      modality: sportsClass?.modality ?? 'Futsal',
      school: 'Escola de Teste',
      address: {
        neighborhood: 'Alto da Mangueira',
        city: 'Maracanaú',
        street: 'Rua de Teste',
        number: '100'
      },
      guardian: { name: 'Responsável de Teste', phone: '(85) 90000-0000' },
      studentPhotoKey: 'test-data/student-photo',
      signedFormPdfKey: 'test-data/signed-form.pdf',
      enrollmentStatus: 'approved',
      termsAcceptedAt: new Date(),
      termsAcceptedIp: '127.0.0.1',
      termsVersion: env.TERMS_VERSION,
      classIds: sportsClass ? [sportsClass._id] : []
    });
    createdStudentId = student.id;
    if (sportsClass) {
      await SportsClass.updateOne({ _id: sportsClass._id }, { $addToSet: { studentIds: student._id } });
    }
    console.info('Perfil de aluno de teste criado.');
  } catch (error) {
    if (createdStudentId) {
      await SportsClass.updateMany({ studentIds: createdStudentId }, { $pull: { studentIds: createdStudentId } });
      await Student.deleteOne({ _id: createdStudentId });
    }
    await User.deleteOne({ _id: createdUser._id });
    if (!isDuplicateKeyError(error)) throw error;

    const concurrentUser = await User.findOne({ email }).select('role');
    const concurrentProfile = concurrentUser?.role === 'student'
      ? await Student.findOne({ userId: concurrentUser._id }).select('enrollmentStatus')
      : null;
    if (concurrentProfile?.enrollmentStatus !== 'approved') {
      throw new Error('Não foi possível criar o perfil de aluno de teste: o e-mail já está em uso.');
    }
  }
}
