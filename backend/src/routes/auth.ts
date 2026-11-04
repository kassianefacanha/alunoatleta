import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { Student, User } from '../models/index.js';
import { calculateAge } from '../services/dates.js';
import { releaseEnrollmentSlot, reserveEnrollmentSlot } from '../services/enrollmentCapacity.js';
import { inspectObject } from '../services/storage.js';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.toLowerCase().trim()),
  password: z.string().min(8).max(128),
  fullName: z.string().trim().min(3).max(150),
  age: z.number().int().min(0).max(120),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year!, month! - 1, day!, 12));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
  }, 'Data de nascimento inválida.'),
  sex: z.enum(['Feminino', 'Masculino', 'Outro', 'Prefiro não informar']),
  modality: z.string().trim().min(1).max(80).default('Futsal'),
  school: z.string().trim().min(1).max(160),
  address: z.object({
    neighborhood: z.string().trim().min(1).max(120).default('Alto da Mangueira'),
    city: z.string().trim().min(1).max(120).default('Maracanaú'),
    street: z.string().trim().min(1).max(180),
    number: z.string().trim().min(1).max(20),
    complement: z.string().trim().max(120).optional()
  }),
  guardian: z.object({
    name: z.string().trim().min(3).max(150),
    phone: z.string().regex(/^\(\d{2}\) \d{5}-\d{4}$/)
  }),
  studentPhotoKey: z.string().min(1),
  signedFormPdfKey: z.string().min(1),
  termsAccepted: z.literal(true)
});

const resubmitSchema = registerSchema.omit({
  email: true,
  password: true,
  studentPhotoKey: true,
  termsAccepted: true
}).extend({
  signedFormPdfKey: z.string().optional(),
  termsAccepted: z.literal(true)
});

function issueTokens(userId: string, role: string) {
  const accessToken = jwt.sign({ role }, env.JWT_ACCESS_SECRET, { subject: userId, expiresIn: '15m' });
  const refreshToken = jwt.sign({ role, tokenType: 'refresh' }, env.JWT_REFRESH_SECRET, { subject: userId, expiresIn: '7d' });
  return { accessToken, refreshToken };
}

authRouter.post('/register', async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const birthDate = new Date(`${input.birthDate}T12:00:00.000Z`);
    const age = calculateAge(birthDate);
    if (Math.abs(age - input.age) > 1) {
      res.status(422).json({ error: 'A idade informada não corresponde à data de nascimento.' });
      return;
    }
    if (birthDate.getTime() > Date.now()) {
      res.status(422).json({ error: 'A data de nascimento não pode estar no futuro.' });
      return;
    }
    if (!input.studentPhotoKey.startsWith('registration/') || !input.studentPhotoKey.endsWith('/studentPhoto') ||
        !input.signedFormPdfKey.startsWith('registration/') || !input.signedFormPdfKey.endsWith('/signedFormPdf') ||
        input.studentPhotoKey.split('/')[1] !== input.signedFormPdfKey.split('/')[1]) {
      res.status(422).json({ error: 'Os documentos enviados não pertencem a esta inscrição.' });
      return;
    }

    const [photo, form] = await Promise.all([inspectObject(input.studentPhotoKey), inspectObject(input.signedFormPdfKey)]);
    if (!photo.ContentType || !['image/jpeg', 'image/png'].includes(photo.ContentType) || (photo.ContentLength ?? 0) > 5 * 1024 * 1024) {
      res.status(422).json({ error: 'A foto deve ser JPG ou PNG e ter no máximo 5 MB.' });
      return;
    }
    if (form.ContentType !== 'application/pdf' || (form.ContentLength ?? 0) > 10 * 1024 * 1024) {
      res.status(422).json({ error: 'A ficha deve ser PDF e ter no máximo 10 MB.' });
      return;
    }
    if (await User.exists({ email: input.email })) {
      res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
      return;
    }

    const reservation = await reserveEnrollmentSlot();
    if (!reservation) {
      res.status(409).json({ error: 'O limite de inscrições foi atingido. Entre em contato com a equipe do projeto.' });
      return;
    }

    let createdUserId: string | null = null;
    try {
      const user = await User.create({ email: input.email, passwordHash: await bcrypt.hash(input.password, 12), role: 'student' });
      createdUserId = user.id;
      const student = await Student.create({
        userId: user._id,
        fullName: input.fullName,
        age,
        birthDate,
        sex: input.sex,
        modality: input.modality,
        school: input.school,
        address: input.address,
        guardian: input.guardian,
        studentPhotoKey: input.studentPhotoKey,
        signedFormPdfKey: input.signedFormPdfKey,
        termsAcceptedAt: new Date(),
        termsAcceptedIp: req.ip,
        termsVersion: env.TERMS_VERSION
      });
      res.status(201).json({
        message: 'Inscrição enviada para análise.',
        student: { id: student.id, enrollmentStatus: student.enrollmentStatus }
      });
    } catch (error) {
      if (createdUserId) await User.deleteOne({ _id: createdUserId });
      await releaseEnrollmentSlot();
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const input = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const user = await User.findOne({ email: input.email.toLowerCase().trim() }).select('+passwordHash');
    if (!user || !user.isActive || user.isArchived || !(await bcrypt.compare(input.password, user.passwordHash))) {
      res.status(401).json({ error: 'E-mail ou senha inválidos.' });
      return;
    }
    const tokens = issueTokens(user.id, user.role);
    user.refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
    await user.save();
    const student = user.role === 'student' ? await Student.findOne({ userId: user._id }).select('enrollmentStatus rejectionReason').lean() : null;
    res.json({
      ...tokens,
      user: { id: user.id, email: user.email, role: user.role },
      enrollment: student ? { status: student.enrollmentStatus, rejectionReason: student.rejectionReason } : undefined
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const token = z.string().min(1).parse(req.body.refreshToken);
    let claims: jwt.JwtPayload;
    try {
      claims = jwt.verify(token, env.JWT_REFRESH_SECRET) as jwt.JwtPayload;
    } catch {
      res.status(401).json({ error: 'Refresh token inválido ou expirado.' });
      return;
    }
    if (claims.tokenType !== 'refresh' || typeof claims.sub !== 'string') {
      res.status(401).json({ error: 'Refresh token inválido.' });
      return;
    }
    const user = await User.findById(claims.sub).select('+refreshTokenHash');
    const studentProfile = user?.role === 'student'
      ? await Student.exists({ userId: user._id, isArchived: { $ne: true } })
      : true;
    if (!user || user.role !== claims.role || !user.isActive || user.isArchived || !studentProfile ||
      !user.refreshTokenHash || !(await bcrypt.compare(token, user.refreshTokenHash))) {
      res.status(401).json({ error: 'Refresh token revogado.' });
      return;
    }
    const tokens = issueTokens(user.id, user.role);
    user.refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
    await user.save();
    res.json(tokens);
  } catch (error) {
    next(error);
  }
});

authRouter.post('/logout', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    await User.findByIdAndUpdate(req.auth?.userId, { $unset: { refreshTokenHash: 1 } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = await User.findById(req.auth?.userId).select('email role teacherPermissions').lean();
    if (!user) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }
    const student = user.role === 'student' ? await Student.findOne({ userId: user._id }).lean() : null;
    res.json({
      user: { id: user._id, email: user.email, role: user.role, teacherPermissions: user.teacherPermissions },
      student: student ? {
        id: student._id,
        fullName: student.fullName,
        age: student.age,
        birthDate: student.birthDate,
        sex: student.sex,
        modality: student.modality,
        school: student.school,
        address: student.address,
        guardian: student.guardian,
        studentPhotoKey: student.studentPhotoKey,
        enrollmentStatus: student.enrollmentStatus,
        rejectionReason: student.rejectionReason
      } : undefined
    });
  } catch (error) {
    next(error);
  }
});

authRouter.patch('/resubmit', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (req.auth?.role !== 'student') {
      res.status(403).json({ error: 'Somente alunos podem corrigir inscrições.' });
      return;
    }
    const input = resubmitSchema.parse(req.body);
    const student = await Student.findOne({ userId: req.auth.userId });
    if (!student || student.enrollmentStatus !== 'rejected') {
      res.status(409).json({ error: 'Somente inscrições recusadas podem ser corrigidas.' });
      return;
    }
    const birthDate = new Date(`${input.birthDate}T12:00:00.000Z`);
    const age = calculateAge(birthDate);
    if (birthDate.getTime() > Date.now() || Math.abs(age - input.age) > 1) {
      res.status(422).json({ error: 'Confira a idade e a data de nascimento informadas.' });
      return;
    }
    if (input.signedFormPdfKey) {
      const isRegistrationKey = /^registration\/[0-9a-f-]{36}\/signedFormPdf$/i.test(input.signedFormPdfKey);
      const isOwnStudentKey = input.signedFormPdfKey.startsWith(`students/${student.id}/form/`);
      if (!isRegistrationKey && !isOwnStudentKey) {
        res.status(422).json({ error: 'A ficha enviada não pertence a esta conta.' });
        return;
      }
      const object = await inspectObject(input.signedFormPdfKey);
      if (object.ContentType !== 'application/pdf' || (object.ContentLength ?? 0) > 10 * 1024 * 1024) {
        res.status(422).json({ error: 'A ficha deve ser PDF e ter no máximo 10 MB.' });
        return;
      }
      student.signedFormPdfKey = input.signedFormPdfKey;
    }
    student.fullName = input.fullName;
    student.age = age;
    student.birthDate = birthDate;
    student.sex = input.sex;
    student.modality = input.modality;
    student.school = input.school;
    student.address = input.address;
    student.guardian = input.guardian;
    student.enrollmentStatus = 'pending';
    student.rejectionReason = undefined;
    student.reviewedBy = undefined;
    student.reviewedAt = undefined;
    student.termsAcceptedAt = new Date();
    student.termsAcceptedIp = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    student.termsVersion = env.TERMS_VERSION;
    await student.save();
    res.json({ message: 'Inscrição reenviada para análise.', enrollmentStatus: student.enrollmentStatus });
  } catch (error) {
    next(error);
  }
});
