import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles, requireTeacherPermission, type AuthenticatedRequest } from '../middleware/auth.js';
import { Material, SportsClass, Student } from '../models/index.js';
import { createDownloadUrl, createUploadUrl, inspectObject } from '../services/storage.js';

export const uploadsRouter = Router();

const uploadInput = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.enum(['image/jpeg', 'image/png', 'application/pdf']),
  uploadType: z.enum(['studentPhoto', 'signedFormPdf']),
  fileSize: z.number().int().positive()
});

function extensionAllowed(fileName: string, contentType: string): boolean {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return contentType === 'image/jpeg' ? extension === 'jpg' || extension === 'jpeg'
    : contentType === 'image/png' ? extension === 'png'
      : extension === 'pdf';
}

uploadsRouter.post('/registration-presign', async (req, res, next) => {
  try {
    const input = uploadInput.parse(req.body);
    const expectedType = input.uploadType === 'studentPhoto' ? ['image/jpeg', 'image/png'] : ['application/pdf'];
    const maxSize = input.uploadType === 'studentPhoto' ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
    if (!expectedType.includes(input.contentType) || !extensionAllowed(input.fileName, input.contentType) || input.fileSize > maxSize) {
      res.status(422).json({ error: 'Tipo de arquivo ou extensão não permitidos.' });
      return;
    }
    const registrationId = z.string().uuid().optional().parse(req.body.registrationId) ?? randomUUID();
    const key = `registration/${registrationId}/${input.uploadType}`;
    res.json({ uploadUrl: await createUploadUrl(key, input.contentType, input.fileSize), key, registrationId, expiresIn: 300 });
  } catch (error) {
    next(error);
  }
});

uploadsRouter.post('/presign', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = uploadInput.parse(req.body);
    const expectedType = input.uploadType === 'studentPhoto' ? ['image/jpeg', 'image/png'] : ['application/pdf'];
    const maxSize = input.uploadType === 'studentPhoto' ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
    if (!expectedType.includes(input.contentType) || !extensionAllowed(input.fileName, input.contentType) || input.fileSize > maxSize) {
      res.status(422).json({ error: 'Tipo, extensão ou tamanho de arquivo inválido.' });
      return;
    }
    const student = await Student.findOne({ userId: req.auth?.userId }).select('_id');
    if (!student || req.auth?.role !== 'student') {
      res.status(403).json({ error: 'Somente alunos podem enviar arquivos de perfil.' });
      return;
    }
    if (input.uploadType === 'studentPhoto') {
      res.status(403).json({ error: 'A foto não pode ser alterada após o cadastro.' });
      return;
    }
    const key = `students/${student.id}/form/${randomUUID()}`;
    res.json({ uploadUrl: await createUploadUrl(key, input.contentType, input.fileSize), key, expiresIn: 300 });
  } catch (error) {
    next(error);
  }
});

const materialTypes = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png']
} as const;
const materialMaxSize = 10 * 1024 * 1024;

uploadsRouter.post('/materials/presign', requireAuth, requireRoles('admin', 'teacher'), requireTeacherPermission('materials:write'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = z.object({
      classId: z.string().regex(/^[a-f\d]{24}$/i),
      fileName: z.string().trim().min(1).max(180),
      contentType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
      fileSize: z.number().int().positive().max(materialMaxSize)
    }).parse(req.body);
    const extension = input.fileName.split('.').pop()?.toLowerCase();
    if (!extension || !(materialTypes[input.contentType] as readonly string[]).includes(extension)) {
      res.status(422).json({ error: 'A extensão do arquivo não corresponde ao tipo permitido.' });
      return;
    }
    const sportsClass = await SportsClass.findById(input.classId).select('teacherId');
    if (!sportsClass || (req.auth?.role === 'teacher' && sportsClass.teacherId.toString() !== req.auth.userId)) {
      res.status(403).json({ error: 'Você não pode enviar materiais para esta turma.' });
      return;
    }
    const key = `materials/${sportsClass.id}/${randomUUID()}`;
    res.json({
      uploadUrl: await createUploadUrl(key, input.contentType, input.fileSize),
      key,
      expiresIn: 300
    });
  } catch (error) {
    next(error);
  }
});

uploadsRouter.get('/materials/:materialId/download', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const materialId = z.string().regex(/^[a-f\d]{24}$/i).parse(req.params.materialId);
    const material = await Material.findById(materialId).select('classId fileKey').lean();
    if (!material?.fileKey) {
      res.status(404).json({ error: 'Arquivo do material não encontrado.' });
      return;
    }
    if (req.auth?.role !== 'admin') {
      const sportsClass = await SportsClass.findById(material.classId).select('teacherId studentIds').lean();
      const allowed = sportsClass && (req.auth?.role === 'teacher'
        ? sportsClass.teacherId.toString() === req.auth.userId
        : await Student.exists({
          userId: req.auth?.userId,
          enrollmentStatus: 'approved',
          classIds: material.classId
        }));
      if (!allowed) {
        res.status(403).json({ error: 'Você não pode acessar este material.' });
        return;
      }
    }
    res.json({ downloadUrl: await createDownloadUrl(material.fileKey), expiresIn: 600 });
  } catch (error) {
    next(error);
  }
});

uploadsRouter.post('/confirm', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = z.object({ key: z.string().min(1), uploadType: z.enum(['studentPhoto', 'signedFormPdf']) }).parse(req.body);
    const student = await Student.findOne({ userId: req.auth?.userId });
    if (!student || !input.key.startsWith(`students/${student.id}/`)) {
      res.status(403).json({ error: 'Você não pode confirmar este arquivo.' });
      return;
    }
    const object = await inspectObject(input.key);
    const isPhoto = input.uploadType === 'studentPhoto';
    const validType = isPhoto ? ['image/jpeg', 'image/png'].includes(object.ContentType ?? '') : object.ContentType === 'application/pdf';
    const maxSize = isPhoto ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
    if (!validType || (object.ContentLength ?? 0) > maxSize) {
      res.status(422).json({ error: 'O arquivo enviado excede o limite ou tem tipo inválido.' });
      return;
    }
    if (isPhoto) {
      res.status(403).json({ error: 'A foto não pode ser alterada após o cadastro.' });
      return;
    }
    student.signedFormPdfKey = input.key;
    await student.save();
    res.json({ key: input.key });
  } catch (error) {
    next(error);
  }
});

uploadsRouter.get('/download', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const key = z.string().min(1).parse(req.query.key);
    const student = await Student.findOne({ userId: req.auth?.userId }).select('_id studentPhotoKey signedFormPdfKey classIds');
    const ownFile = student && [student.studentPhotoKey, student.signedFormPdfKey].includes(key);
    if (req.auth?.role === 'student' && !ownFile) {
      res.status(403).json({ error: 'Você não pode acessar este arquivo.' });
      return;
    }
    if (req.auth?.role === 'teacher') {
      const target = await Student.findOne({ $or: [{ studentPhotoKey: key }, { signedFormPdfKey: key }] }).select('classIds modality enrollmentStatus');
      const ownedClasses = await SportsClass.find({ teacherId: req.auth.userId }).select('_id modality').lean();
      const classAccess = target && ownedClasses.some((sportsClass) =>
        target.classIds.some((classId) => classId.equals(sportsClass._id)) ||
        (target.enrollmentStatus === 'pending' && target.modality === sportsClass.modality)
      );
      if (!classAccess) {
        res.status(403).json({ error: 'Você não pode acessar este arquivo.' });
        return;
      }
    }
    if (!ownFile && req.auth?.role !== 'admin' && req.auth?.role !== 'teacher') {
      res.status(403).json({ error: 'Você não pode acessar este arquivo.' });
      return;
    }
    res.json({ downloadUrl: await createDownloadUrl(key), expiresIn: 600 });
  } catch (error) {
    next(error);
  }
});
