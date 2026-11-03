import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { z } from 'zod';
import { requireAuth, requireRoles, requireTeacherPermission, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  Assignment, AssignmentSubmission, Attendance, AuditLog, Evaluation, LessonPlan, Material, Notification,
  SocialComment, SocialPost, SportsClass, SportsEvent, Student, User
} from '../models/index.js';
import { inspectObject } from '../services/storage.js';

export const managementRouter = Router();
managementRouter.use(requireAuth);

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

managementRouter.get('/students/me', requireRoles('student'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const [student, user] = await Promise.all([
      Student.findOne({ userId: req.auth?.userId, enrollmentStatus: 'approved' })
        .select('fullName age birthDate sex modality school address guardian enrollmentStatus')
        .lean(),
      User.findById(req.auth?.userId).select('email').lean()
    ]);
    if (!student || !user) {
      res.status(403).json({ error: 'Somente alunos aprovados podem acessar o perfil.' });
      return;
    }
    res.json({ student, email: user.email });
  } catch (error) {
    next(error);
  }
});

managementRouter.patch('/students/me', requireRoles('student'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = z.object({
      fullName: z.string().trim().min(3).max(150),
      school: z.string().trim().min(1).max(160),
      address: z.object({
        neighborhood: z.string().trim().min(1).max(120),
        city: z.string().trim().min(1).max(120),
        street: z.string().trim().min(1).max(180),
        number: z.string().trim().min(1).max(20),
        complement: z.string().trim().max(120).optional()
      }),
      guardian: z.object({
        name: z.string().trim().min(3).max(150),
        phone: z.string().regex(/^\(\d{2}\) \d{5}-\d{4}$/)
      })
    }).parse(req.body);
    const student = await Student.findOneAndUpdate(
      { userId: req.auth?.userId, enrollmentStatus: 'approved' },
      { $set: input },
      { new: true, runValidators: true }
    ).select('fullName school address guardian');
    if (!student) {
      res.status(403).json({ error: 'Somente alunos aprovados podem editar o perfil.' });
      return;
    }
    res.json({ student });
  } catch (error) {
    next(error);
  }
});

managementRouter.get('/students/me/development', requireRoles('student'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const student = await Student.findOne({ userId: req.auth?.userId }).select('_id classIds enrollmentStatus');
    if (!student || student.enrollmentStatus !== 'approved') {
      res.status(403).json({ error: 'Sua inscrição ainda não foi aprovada.' });
      return;
    }
    const [attendance, evaluations, submissions] = await Promise.all([
      Attendance.find({ studentId: student._id }).sort({ date: -1 }).limit(100).populate('classId', 'name').lean(),
      Evaluation.find({ studentId: student._id }).sort({ evaluatedAt: -1 }).limit(100)
        .populate('classId', 'name')
        .populate('teacherId', 'email')
        .lean(),
      AssignmentSubmission.find({ studentId: student._id }).sort({ submittedAt: -1 }).limit(100).populate('assignmentId', 'title dueAt').lean()
    ]);
    res.json({ attendance, evaluations, submissions });
  } catch (error) {
    next(error);
  }
});

managementRouter.get('/classes', requireRoles('admin', 'teacher', 'student'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.auth?.role === 'teacher') filter.teacherId = req.auth.userId;
    if (req.auth?.role === 'student') {
      const student = await Student.findOne({ userId: req.auth.userId });
      if (student?.enrollmentStatus !== 'approved') {
        res.status(403).json({ error: 'Sua inscrição ainda não foi aprovada.' });
        return;
      }
      filter._id = { $in: student.classIds };
    }
    const classes = await SportsClass.find(filter).sort({ name: 1 }).populate('teacherId', 'email').lean();
    res.json({ classes });
  } catch (error) {
    next(error);
  }
});

managementRouter.get('/dashboard/stats', requireRoles('admin', 'teacher', 'student'), async (req: AuthenticatedRequest, res, next) => {
  try {
    if (req.auth?.role === 'admin') {
      const [students, teachers, classes, attendance, submissions, posts, comments, pendingEnrollments] = await Promise.all([
        Student.countDocuments(),
        User.countDocuments({ role: 'teacher', isActive: true }),
        SportsClass.countDocuments({ isActive: true }),
        Attendance.countDocuments(),
        AssignmentSubmission.countDocuments(),
        SocialPost.countDocuments(),
        SocialComment.countDocuments(),
        Student.countDocuments({ enrollmentStatus: 'pending' })
      ]);
      const likes = await SocialPost.aggregate([{ $project: { count: { $size: '$likedBy' } } }, { $group: { _id: null, total: { $sum: '$count' } } }]);
      res.json({
        students, teachers, classes, attendance, assignmentsDelivered: submissions,
        socialEngagement: posts + comments + (likes[0]?.total ?? 0), pendingEnrollments
      });
      return;
    }

    if (req.auth?.role === 'teacher') {
      const sportsClasses = await SportsClass.find({ teacherId: req.auth.userId, isActive: true }).select('_id modality studentIds').lean();
      const classIds = sportsClasses.map((sportsClass) => sportsClass._id);
      const modalities = [...new Set(sportsClasses.map((sportsClass) => sportsClass.modality))];
      const studentIds = [...new Set(sportsClasses.flatMap((sportsClass) => sportsClass.studentIds.map((id) => id.toString())))];
      const assignmentIds = await Assignment.find({ classId: { $in: classIds } }).distinct('_id');
      const [students, attendance, assignments, pendingEnrollments, submissions] = await Promise.all([
        Student.countDocuments({ _id: { $in: studentIds }, enrollmentStatus: 'approved' }),
        Attendance.countDocuments({ classId: { $in: classIds } }),
        Assignment.countDocuments({ classId: { $in: classIds } }),
        Student.countDocuments({ enrollmentStatus: 'pending', modality: { $in: modalities } }),
        AssignmentSubmission.countDocuments({ assignmentId: { $in: assignmentIds } })
      ]);
      res.json({ students, attendance, assignments, pendingEnrollments, assignmentsDelivered: submissions, classes: classIds.length });
      return;
    }

    const student = await Student.findOne({ userId: req.auth?.userId }).select('_id classIds enrollmentStatus');
    if (!student || student.enrollmentStatus !== 'approved') {
      res.status(403).json({ error: 'Sua inscrição ainda não foi aprovada.' });
      return;
    }
    const [attendance, present, evaluations, assignments, submissions, unreadNotifications] = await Promise.all([
      Attendance.countDocuments({ studentId: student._id }),
      Attendance.countDocuments({ studentId: student._id, status: 'present' }),
      Evaluation.countDocuments({ studentId: student._id }),
      Assignment.find({ classId: { $in: student.classIds }, responseType: 'text' }).select('_id dueAt').lean(),
      AssignmentSubmission.find({ studentId: student._id }).select('assignmentId').lean(),
      Notification.countDocuments({ recipientId: req.auth?.userId, readAt: { $exists: false } })
    ]);
    const submittedAssignmentIds = new Set(submissions.map((submission) => submission.assignmentId.toString()));
    const assignmentsToDo = assignments.filter((assignment) =>
      !submittedAssignmentIds.has(assignment._id.toString())
    ).length;
    res.json({
      attendance,
      attendanceRate: attendance ? Math.round((present / attendance) * 100) : 0,
      evaluations,
      assignmentsToDo,
      unreadNotifications
    });
  } catch (error) {
    next(error);
  }
});

managementRouter.get('/students', requireRoles('admin', 'teacher'), requireTeacherPermission('students:read'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const query = z.object({
      name: z.string().optional(),
      status: z.enum(['pending', 'approved', 'rejected']).optional(),
      modality: z.string().optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional()
    }).parse(req.query);
    const filter: Record<string, unknown> = {};
    if (query.name) filter.fullName = { $regex: escapeRegex(query.name), $options: 'i' };
    if (query.status) filter.enrollmentStatus = query.status;
    if (query.modality) filter.modality = query.modality;
    if (query.from || query.to) filter.createdAt = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
    if (req.auth?.role === 'teacher') {
      const classes = await SportsClass.find({ teacherId: req.auth.userId }).select('_id modality').lean();
      const modalities = [...new Set(classes.map((item) => item.modality))];
      filter.$or = [
        { classIds: { $in: classes.map((item) => item._id) } },
        { enrollmentStatus: 'pending', ...(modalities.length ? { modality: { $in: modalities } } : { _id: null }) }
      ];
    }
    const students = await Student.find(filter).sort({ createdAt: -1 }).populate('userId', 'email').lean();
    res.json({ students });
  } catch (error) {
    next(error);
  }
});

managementRouter.patch('/students/:studentId/review', requireRoles('admin', 'teacher'), requireTeacherPermission('students:write'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = z.object({
      status: z.enum(['approved', 'rejected']),
      reason: z.string().trim().max(1000).optional(),
      classId: z.string().optional()
    }).refine((value) => value.status !== 'rejected' || Boolean(value.reason), {
      path: ['reason'], message: 'Informe o motivo da recusa.'
    }).parse(req.body);
    const student = await Student.findById(req.params.studentId);
    if (!student) {
      res.status(404).json({ error: 'Aluno não encontrado.' });
      return;
    }
    if (req.auth?.role === 'teacher' || input.classId) {
      if (!input.classId || !Types.ObjectId.isValid(input.classId)) {
        res.status(422).json({ error: 'Selecione uma turma para analisar a inscrição.' });
        return;
      }
      const sportsClass = await SportsClass.findOne({
        _id: input.classId,
        ...(req.auth?.role === 'teacher' ? { teacherId: req.auth.userId } : {})
      });
      if (!sportsClass || sportsClass.modality !== student.modality) {
        res.status(403).json({ error: 'A turma não atende à modalidade desta inscrição ou você não tem acesso.' });
        return;
      }
      if (input.status === 'approved' && !student.classIds.some((id) => id.equals(sportsClass._id))) {
        student.classIds.push(sportsClass._id);
        sportsClass.studentIds.push(student._id);
      }
      if (input.status === 'approved') await sportsClass.save();
    }
    student.enrollmentStatus = input.status;
    student.rejectionReason = input.status === 'rejected' ? input.reason : undefined;
    student.reviewedBy = new Types.ObjectId(req.auth!.userId);
    student.reviewedAt = new Date();
    await student.save();
    if (input.status === 'approved') {
      await User.updateOne({ _id: student.userId }, { isActive: true });
    }
    await AuditLog.create({
      actorId: req.auth?.userId,
      action: `student.enrollment.${input.status}`,
      resource: 'Student',
      resourceId: student._id,
      metadata: { reason: input.reason, classId: input.classId },
      ip: req.ip
    });
    res.json({ student: { id: student.id, enrollmentStatus: student.enrollmentStatus, rejectionReason: student.rejectionReason } });
  } catch (error) {
    next(error);
  }
});

managementRouter.post('/classes', requireRoles('admin', 'teacher'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = z.object({
      name: z.string().trim().min(1).max(120),
      modality: z.string().trim().min(1).max(80).default('Futsal'),
      teacherId: z.string().optional(),
      location: z.string().trim().max(200).optional()
    }).parse(req.body);
    const teacherId = req.auth?.role === 'admin' ? input.teacherId : req.auth?.userId;
    if (!teacherId) {
      res.status(422).json({ error: 'Informe o professor responsável.' });
      return;
    }
    const teacher = await User.findOne({ _id: teacherId, role: 'teacher' });
    if (!teacher) {
      res.status(422).json({ error: 'O responsável deve ser um usuário professor.' });
      return;
    }
    const sportsClass = await SportsClass.create({ ...input, teacherId });
    await AuditLog.create({ actorId: req.auth?.userId, action: 'class.create', resource: 'SportsClass', resourceId: sportsClass._id, ip: req.ip });
    res.status(201).json({ sportsClass });
  } catch (error) {
    next(error);
  }
});

managementRouter.patch('/classes/:classId', requireRoles('admin', 'teacher'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const classId = z.string().regex(/^[a-f\d]{24}$/i).parse(req.params.classId);
    const input = z.object({
      name: z.string().trim().min(1).max(120),
      modality: z.string().trim().min(1).max(80),
      location: z.string().trim().max(200).optional(),
      teacherId: z.string().regex(/^[a-f\d]{24}$/i).optional()
    }).parse(req.body);
    const sportsClass = await SportsClass.findOne({
      _id: classId,
      ...(req.auth?.role === 'teacher' ? { teacherId: req.auth.userId } : {})
    });
    if (!sportsClass) {
      res.status(404).json({ error: 'Turma não encontrada ou sem acesso.' });
      return;
    }
    if (input.modality !== sportsClass.modality && sportsClass.studentIds.length > 0) {
      res.status(422).json({ error: 'Não é possível alterar a modalidade de uma turma com alunos vinculados.' });
      return;
    }
    if (req.auth?.role === 'admin' && input.teacherId) {
      const teacher = await User.findOne({ _id: input.teacherId, role: 'teacher', isActive: true }).select('_id');
      if (!teacher) {
        res.status(422).json({ error: 'Selecione um professor ativo.' });
        return;
      }
      sportsClass.teacherId = teacher._id;
    }
    const previous = { name: sportsClass.name, modality: sportsClass.modality, location: sportsClass.location, teacherId: sportsClass.teacherId.toString() };
    sportsClass.name = input.name;
    sportsClass.modality = input.modality;
    sportsClass.location = input.location;
    await sportsClass.save();
    await AuditLog.create({
      actorId: req.auth?.userId,
      action: 'class.update',
      resource: 'SportsClass',
      resourceId: sportsClass._id,
      metadata: { previous, updated: input },
      ip: req.ip
    });
    res.json({ sportsClass });
  } catch (error) {
    next(error);
  }
});

managementRouter.put('/teachers/:teacherId/permissions', requireRoles('admin'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = z.object({
      permissions: z.array(z.enum(['students:read', 'students:write', 'attendance:write', 'assignments:read', 'assignments:write', 'materials:write', 'notifications:write', 'events:write', 'evaluations:write', 'social:read', 'social:write', 'exports:read'])).max(20)
    }).parse(req.body);
    const teacher = await User.findOneAndUpdate(
      { _id: req.params.teacherId, role: 'teacher' },
      { teacherPermissions: [...new Set(input.permissions)] },
      { new: true, select: 'email teacherPermissions' }
    ).lean();
    if (!teacher) {
      res.status(404).json({ error: 'Professor não encontrado.' });
      return;
    }
    await AuditLog.create({ actorId: req.auth?.userId, action: 'teacher.permissions.update', resource: 'User', resourceId: teacher._id, ip: req.ip });
    res.json({ teacher });
  } catch (error) {
    next(error);
  }
});

managementRouter.get('/teachers', requireRoles('admin'), async (_req, res, next) => {
  try {
    const teachers = await User.find({ role: 'teacher' }).select('email isActive teacherPermissions createdAt').sort({ email: 1 }).lean();
    res.json({ teachers });
  } catch (error) {
    next(error);
  }
});

managementRouter.post('/teachers', requireRoles('admin'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = z.object({
      email: z.string().email().max(254).transform((value) => value.toLowerCase().trim()),
      password: z.string().min(12).max(128)
    }).parse(req.body);
    if (await User.exists({ email: input.email })) {
      res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
      return;
    }
    const teacher = await User.create({
      email: input.email,
      passwordHash: await bcrypt.hash(input.password, 12),
      role: 'teacher'
    });
    await AuditLog.create({ actorId: req.auth?.userId, action: 'teacher.create', resource: 'User', resourceId: teacher._id, ip: req.ip });
    res.status(201).json({ teacher: { id: teacher.id, email: teacher.email, teacherPermissions: teacher.teacherPermissions } });
  } catch (error) {
    next(error);
  }
});

managementRouter.patch('/teachers/:teacherId/status', requireRoles('admin'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const teacherId = z.string().regex(/^[a-f\d]{24}$/i).parse(req.params.teacherId);
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    const teacher = await User.findOne({ _id: teacherId, role: 'teacher' }).select('+refreshTokenHash');
    if (!teacher) {
      res.status(404).json({ error: 'Professor não encontrado.' });
      return;
    }

    const previousIsActive = teacher.isActive;
    if (previousIsActive !== isActive) {
      teacher.isActive = isActive;
      if (!isActive) teacher.refreshTokenHash = undefined;
      await teacher.save();
      await AuditLog.create({
        actorId: req.auth?.userId,
        action: isActive ? 'teacher.activate' : 'teacher.deactivate',
        resource: 'User',
        resourceId: teacher._id,
        metadata: { previousIsActive, isActive },
        ip: req.ip
      });
    }
    res.json({ teacher: { id: teacher.id, email: teacher.email, isActive: teacher.isActive } });
  } catch (error) {
    next(error);
  }
});

managementRouter.get('/attendance', requireRoles('admin', 'teacher'), requireTeacherPermission('attendance:write'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const query = z.object({
      classId: z.string().regex(/^[a-f\d]{24}$/i),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
        const [year, month, day] = value.split('-').map(Number);
        const date = new Date(Date.UTC(year!, month! - 1, day!));
        return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
      }, 'Data inválida.')
    }).parse(req.query);
    const sportsClass = await SportsClass.findOne({
      _id: query.classId,
      ...(req.auth?.role === 'teacher' ? { teacherId: req.auth.userId } : {})
    }).select('studentIds');
    if (!sportsClass) {
      res.status(404).json({ error: 'Turma não encontrada ou sem acesso.' });
      return;
    }

    const [year, month, day] = query.date.split('-').map(Number);
    const start = new Date(Date.UTC(year!, month! - 1, day!));
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const [students, records] = await Promise.all([
      Student.find({ _id: { $in: sportsClass.studentIds }, enrollmentStatus: 'approved' })
        .select('fullName age')
        .sort({ fullName: 1 })
        .lean(),
      Attendance.find({ classId: sportsClass._id, date: { $gte: start, $lt: end } }).lean()
    ]);
    const attendanceByStudent = new Map(records.map((record) => [record.studentId.toString(), record]));
    res.json({
      date: query.date,
      students: students.map((student) => {
        const attendance = attendanceByStudent.get(student._id.toString());
        return {
          studentId: student._id,
          fullName: student.fullName,
          age: student.age,
          attendance: attendance ? { status: attendance.status, note: attendance.note ?? '' } : null
        };
      })
    });
  } catch (error) {
    next(error);
  }
});

managementRouter.post('/attendance', requireRoles('admin', 'teacher'), requireTeacherPermission('attendance:write'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = z.object({
      classId: z.string().regex(/^[a-f\d]{24}$/i),
      date: z.coerce.date(),
      records: z.array(z.object({
        studentId: z.string().regex(/^[a-f\d]{24}$/i),
        status: z.enum(['present', 'absent', 'excused']),
        note: z.string().max(500).optional()
      })).min(1).refine(
        (records) => new Set(records.map((record) => record.studentId)).size === records.length,
        'Cada aluno pode aparecer apenas uma vez na chamada.'
      )
    }).parse(req.body);
    const sportsClass = await SportsClass.findById(input.classId);
    if (!sportsClass || (req.auth?.role === 'teacher' && sportsClass.teacherId.toString() !== req.auth.userId)) {
      res.status(403).json({ error: 'Você não pode registrar chamada nesta turma.' });
      return;
    }
    const allowedStudents = new Set(sportsClass.studentIds.map((id) => id.toString()));
    if (input.records.some((record) => !allowedStudents.has(record.studentId))) {
      res.status(422).json({ error: 'A chamada contém aluno que não pertence a esta turma.' });
      return;
    }
    const recordedBy = new Types.ObjectId(req.auth!.userId);
    const date = new Date(Date.UTC(input.date.getUTCFullYear(), input.date.getUTCMonth(), input.date.getUTCDate()));
    await Attendance.bulkWrite(input.records.map((record) => ({
      updateOne: {
        filter: { classId: sportsClass._id, studentId: new Types.ObjectId(record.studentId), date },
        update: { $set: { status: record.status, note: record.note, recordedBy } },
        upsert: true
      }
    })));
    res.json({ saved: input.records.length });
  } catch (error) {
    next(error);
  }
});

managementRouter.post('/assignments', requireRoles('admin', 'teacher'), requireTeacherPermission('assignments:write'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = z.object({
      classId: z.string(),
      title: z.string().trim().min(1).max(160),
      description: z.string().trim().min(1).max(5000),
      responseType: z.enum(['text', 'none']).default('text'),
      dueAt: z.coerce.date().optional()
    }).parse(req.body);
    const sportsClass = await SportsClass.findById(input.classId);
    if (!sportsClass || (req.auth?.role === 'teacher' && sportsClass.teacherId.toString() !== req.auth.userId)) {
      res.status(403).json({ error: 'Você não pode criar tarefa nesta turma.' });
      return;
    }
    const assignment = await Assignment.create({ ...input, createdBy: req.auth?.userId });
    res.status(201).json({ assignment });
  } catch (error) {
    next(error);
  }
});

managementRouter.get('/assignments', requireRoles('admin', 'teacher', 'student'), requireTeacherPermission('assignments:read'), async (req: AuthenticatedRequest, res, next) => {
  try {
    let classIds: Types.ObjectId[] | undefined;
    if (req.auth?.role === 'teacher') {
      classIds = await SportsClass.find({ teacherId: req.auth.userId }).distinct('_id');
    } else if (req.auth?.role === 'student') {
      const student = await Student.findOne({ userId: req.auth.userId });
      if (student?.enrollmentStatus !== 'approved') {
        res.status(403).json({ error: 'Sua inscrição ainda não foi aprovada.' });
        return;
      }
      classIds = student.classIds;
    }
    const assignments = await Assignment.find(classIds ? { classId: { $in: classIds } } : {}).sort({ dueAt: 1 }).lean();
    if (req.auth?.role === 'student') {
      const student = await Student.findOne({ userId: req.auth.userId }).select('_id').lean();
      const submissions = student
        ? await AssignmentSubmission.find({
          studentId: student._id,
          assignmentId: { $in: assignments.map((assignment) => assignment._id) }
        }).lean()
        : [];
      const submissionsByAssignment = new Map(submissions.map((submission) => [submission.assignmentId.toString(), submission]));
      res.json({
        assignments: assignments.map((assignment) => ({
          ...assignment,
          mySubmission: submissionsByAssignment.get(assignment._id.toString()) ?? null
        }))
      });
      return;
    }
    res.json({ assignments });
  } catch (error) {
    next(error);
  }
});

managementRouter.get('/assignments/:assignmentId/submissions', requireRoles('admin', 'teacher'), requireTeacherPermission('assignments:read'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const assignmentId = req.params.assignmentId;
    if (!assignmentId || !Types.ObjectId.isValid(assignmentId)) {
      res.status(404).json({ error: 'Tarefa não encontrada.' });
      return;
    }
    const assignment = await Assignment.findById(assignmentId).select('classId');
    if (!assignment) {
      res.status(404).json({ error: 'Tarefa não encontrada.' });
      return;
    }
    if (req.auth?.role === 'teacher') {
      const ownedClass = await SportsClass.exists({ _id: assignment.classId, teacherId: req.auth.userId });
      if (!ownedClass) {
        res.status(403).json({ error: 'Você não pode consultar as entregas desta tarefa.' });
        return;
      }
    }
    const submissions = await AssignmentSubmission.find({ assignmentId: assignment._id })
      .sort({ submittedAt: -1 })
      .populate('studentId', 'fullName')
      .lean();
    res.json({ submissions });
  } catch (error) {
    next(error);
  }
});

managementRouter.post('/assignments/:assignmentId/submissions', requireRoles('student'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = z.object({ response: z.string().trim().min(1).max(5000) }).parse(req.body);
    const student = await Student.findOne({ userId: req.auth?.userId });
    const assignment = await Assignment.findById(req.params.assignmentId);
    if (!student || student.enrollmentStatus !== 'approved' || !assignment ||
        assignment.responseType !== 'text' || !student.classIds.some((id) => id.equals(assignment.classId))) {
      res.status(403).json({ error: 'Esta tarefa não está disponível para você.' });
      return;
    }
    const submission = await AssignmentSubmission.findOneAndUpdate(
      { assignmentId: assignment._id, studentId: student._id },
      { response: input.response, submittedAt: new Date() },
      { new: true, upsert: true, runValidators: true }
    );
    res.status(201).json({ submission });
  } catch (error) {
    next(error);
  }
});

managementRouter.post('/materials', requireRoles('admin', 'teacher'), requireTeacherPermission('materials:write'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = z.object({
      classId: z.string(),
      title: z.string().trim().min(1).max(160),
      body: z.string().max(5000).optional(),
      url: z.string().url().optional(),
      fileKey: z.string().optional(),
      fileName: z.string().trim().min(1).max(180).optional()
    }).refine((value) => Boolean(value.body || value.url || value.fileKey), { message: 'Informe um texto, link ou arquivo.' }).parse(req.body);
    const sportsClass = await SportsClass.findById(input.classId);
    if (!sportsClass || (req.auth?.role === 'teacher' && sportsClass.teacherId.toString() !== req.auth.userId)) {
      res.status(403).json({ error: 'Você não pode publicar material nesta turma.' });
      return;
    }
    if (input.fileKey) {
      const expectedKey = new RegExp(`^materials/${sportsClass.id}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`, 'i');
      if (!expectedKey.test(input.fileKey) || !input.fileName) {
        res.status(422).json({ error: 'O arquivo não corresponde à turma ou falta o nome do arquivo.' });
        return;
      }
      const object = await inspectObject(input.fileKey);
      const extension = input.fileName.split('.').pop()?.toLowerCase();
      const allowedExtensions: Record<string, string[]> = {
        'application/pdf': ['pdf'],
        'image/jpeg': ['jpg', 'jpeg'],
        'image/png': ['png']
      };
      if (!(allowedExtensions[object.ContentType ?? ''] ?? []).includes(extension ?? '') ||
          !object.ContentLength || object.ContentLength > 10 * 1024 * 1024) {
        res.status(422).json({ error: 'O arquivo enviado excede o limite ou tem tipo inválido.' });
        return;
      }
    } else if (input.fileName) {
      res.status(422).json({ error: 'O nome do arquivo foi enviado sem um arquivo.' });
      return;
    }
    const material = await Material.create({ ...input, createdBy: req.auth?.userId });
    res.status(201).json({ material });
  } catch (error) {
    next(error);
  }
});

managementRouter.get('/materials', requireRoles('admin', 'teacher', 'student'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const classId = z.string().optional().parse(req.query.classId);
    let classIds: Types.ObjectId[] | undefined;
    if (req.auth?.role === 'teacher') {
      classIds = (await SportsClass.find({ teacherId: req.auth.userId }).select('_id').lean()).map(({ _id }) => _id);
    } else if (req.auth?.role === 'student') {
      const student = await Student.findOne({ userId: req.auth.userId });
      if (student?.enrollmentStatus !== 'approved') {
        res.status(403).json({ error: 'Sua inscrição ainda não foi aprovada.' });
        return;
      }
      classIds = student.classIds;
    }
    if (classId && classIds && !classIds.some((id) => id.toString() === classId)) {
      res.status(403).json({ error: 'Você não participa desta turma.' });
      return;
    }
    const materialFilter: Record<string, unknown> = {};
    if (classId) materialFilter.classId = classId;
    else if (classIds) materialFilter.classId = { $in: classIds };
    const materials = await Material.find(materialFilter).sort({ createdAt: -1 }).lean();
    res.json({ materials });
  } catch (error) {
    next(error);
  }
});

managementRouter.post('/notifications', requireRoles('admin', 'teacher'), requireTeacherPermission('notifications:write'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = z.object({
      classId: z.string().optional(),
      recipientId: z.string().optional(),
      title: z.string().trim().min(1).max(120),
      message: z.string().trim().min(1).max(2000)
    }).refine((value) => Boolean(value.classId || value.recipientId), { message: 'Informe uma turma ou um destinatário.' }).parse(req.body);
    let recipientIds: unknown[];
    if (input.classId) {
      const sportsClass = await SportsClass.findById(input.classId);
      if (!sportsClass || (req.auth?.role === 'teacher' && sportsClass.teacherId.toString() !== req.auth.userId)) {
        res.status(403).json({ error: 'Você não pode notificar esta turma.' });
        return;
      }
      recipientIds = await Student.find({ _id: { $in: sportsClass.studentIds } }).distinct('userId');
    } else {
      if (req.auth?.role === 'teacher') {
        const [recipient, ownedClasses] = await Promise.all([
          Student.findOne({ userId: input.recipientId }).select('classIds modality enrollmentStatus'),
          SportsClass.find({ teacherId: req.auth.userId }).select('_id modality').lean()
        ]);
        const canNotify = recipient && ownedClasses.some((sportsClass) =>
          recipient.classIds.some((classId) => classId.equals(sportsClass._id)) ||
          (recipient.enrollmentStatus === 'pending' && recipient.modality === sportsClass.modality)
        );
        if (!canNotify) {
          res.status(403).json({ error: 'Você não pode notificar este aluno.' });
          return;
        }
      }
      recipientIds = [input.recipientId];
    }
    const notifications = await Notification.insertMany(recipientIds.map((recipientId) => ({
      recipientId, classId: input.classId, senderId: req.auth?.userId, title: input.title, message: input.message
    })));
    res.status(201).json({ sent: notifications.length });
  } catch (error) {
    next(error);
  }
});

managementRouter.post('/events', requireRoles('admin', 'teacher'), requireTeacherPermission('events:write'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = z.object({
      classId: z.string(),
      title: z.string().trim().min(1).max(160),
      description: z.string().trim().min(1).max(3000),
      startsAt: z.coerce.date(),
      location: z.string().max(300).optional()
    }).parse(req.body);
    const sportsClass = await SportsClass.findById(input.classId);
    if (!sportsClass || (req.auth?.role === 'teacher' && sportsClass.teacherId.toString() !== req.auth.userId)) {
      res.status(403).json({ error: 'Você não pode divulgar evento nesta turma.' });
      return;
    }
    const event = await SportsEvent.create({ ...input, createdBy: req.auth?.userId });
    res.status(201).json({ event });
  } catch (error) {
    next(error);
  }
});

managementRouter.get('/events', requireRoles('admin', 'teacher', 'student'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const query = z.object({ classId: z.string().regex(/^[a-f\d]{24}$/i).optional() }).parse(req.query);
    let classIds: Types.ObjectId[] | undefined;
    if (req.auth?.role === 'teacher') {
      classIds = await SportsClass.find({ teacherId: req.auth.userId }).distinct('_id');
    } else if (req.auth?.role === 'student') {
      const student = await Student.findOne({ userId: req.auth.userId }).select('classIds enrollmentStatus');
      if (student?.enrollmentStatus !== 'approved') {
        res.status(403).json({ error: 'Sua inscrição ainda não foi aprovada.' });
        return;
      }
      classIds = student.classIds;
    }
    if (query.classId && classIds && !classIds.some((id) => id.toString() === query.classId)) {
      res.status(403).json({ error: 'Você não participa desta turma.' });
      return;
    }
    const filter: Record<string, unknown> = {};
    if (query.classId) filter.classId = query.classId;
    else if (classIds) filter.classId = { $in: classIds };
    const events = await SportsEvent.find(filter).sort({ startsAt: 1 }).limit(200).lean();
    res.json({ events });
  } catch (error) {
    next(error);
  }
});

managementRouter.post('/lesson-plans', requireRoles('admin', 'teacher'), requireTeacherPermission('events:write'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = z.object({
      classId: z.string(),
      date: z.coerce.date(),
      objectives: z.string().trim().min(1).max(2000),
      activities: z.string().trim().min(1).max(5000),
      notes: z.string().max(3000).optional()
    }).parse(req.body);
    const sportsClass = await SportsClass.findById(input.classId);
    if (!sportsClass || (req.auth?.role === 'teacher' && sportsClass.teacherId.toString() !== req.auth.userId)) {
      res.status(403).json({ error: 'Você não pode registrar plano nesta turma.' });
      return;
    }
    const lessonPlan = await LessonPlan.create({ ...input, teacherId: req.auth?.userId });
    res.status(201).json({ lessonPlan });
  } catch (error) {
    next(error);
  }
});

managementRouter.get('/lesson-plans', requireRoles('admin', 'teacher', 'student'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const query = z.object({ classId: z.string().regex(/^[a-f\d]{24}$/i).optional() }).parse(req.query);
    let classIds: Types.ObjectId[] | undefined;
    if (req.auth?.role === 'teacher') {
      classIds = await SportsClass.find({ teacherId: req.auth.userId }).distinct('_id');
    } else if (req.auth?.role === 'student') {
      const student = await Student.findOne({ userId: req.auth.userId }).select('classIds enrollmentStatus');
      if (student?.enrollmentStatus !== 'approved') {
        res.status(403).json({ error: 'Sua inscrição ainda não foi aprovada.' });
        return;
      }
      classIds = student.classIds;
    }
    if (query.classId && classIds && !classIds.some((id) => id.toString() === query.classId)) {
      res.status(403).json({ error: 'Você não participa desta turma.' });
      return;
    }
    const filter: Record<string, unknown> = {};
    if (query.classId) filter.classId = query.classId;
    else if (classIds) filter.classId = { $in: classIds };
    const lessonPlans = await LessonPlan.find(filter).sort({ date: -1 }).limit(200).lean();
    res.json({ lessonPlans });
  } catch (error) {
    next(error);
  }
});

managementRouter.post('/evaluations', requireRoles('admin', 'teacher'), requireTeacherPermission('evaluations:write'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = z.object({
      classId: z.string(), studentId: z.string(),
      score: z.number().min(0).max(10),
      feedback: z.string().trim().min(1).max(3000)
    }).parse(req.body);
    const sportsClass = await SportsClass.findById(input.classId);
    const student = await Student.findById(input.studentId).select('enrollmentStatus');
    if (!sportsClass || student?.enrollmentStatus !== 'approved' || !sportsClass.studentIds.some((id) => id.toString() === input.studentId) ||
        (req.auth?.role === 'teacher' && sportsClass.teacherId.toString() !== req.auth.userId)) {
      res.status(403).json({ error: 'Você não pode avaliar este aluno nesta turma.' });
      return;
    }
    const evaluation = await Evaluation.create({ ...input, teacherId: req.auth?.userId });
    res.status(201).json({ evaluation });
  } catch (error) {
    next(error);
  }
});

managementRouter.get('/evaluations', requireRoles('admin', 'teacher', 'student'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const query = z.object({ classId: z.string().regex(/^[a-f\d]{24}$/i).optional() }).parse(req.query);
    let filter: Record<string, unknown> = {};
    if (req.auth?.role === 'teacher') {
      const classIds = await SportsClass.find({ teacherId: req.auth.userId }).distinct('_id');
      if (query.classId && !classIds.some((id) => id.toString() === query.classId)) {
        res.status(403).json({ error: 'Você não participa desta turma.' });
        return;
      }
      filter.classId = query.classId ? query.classId : { $in: classIds };
    } else if (req.auth?.role === 'student') {
      const student = await Student.findOne({ userId: req.auth.userId }).select('_id classIds enrollmentStatus');
      if (student?.enrollmentStatus !== 'approved') {
        res.status(403).json({ error: 'Sua inscrição ainda não foi aprovada.' });
        return;
      }
      if (query.classId && !student.classIds.some((id) => id.toString() === query.classId)) {
        res.status(403).json({ error: 'Você não participa desta turma.' });
        return;
      }
      filter = {
        studentId: student._id,
        ...(query.classId ? { classId: query.classId } : {})
      };
    } else if (query.classId) {
      filter.classId = query.classId;
    }
    const evaluations = await Evaluation.find(filter).sort({ evaluatedAt: -1 }).limit(200)
      .populate('studentId', 'fullName')
      .populate('classId', 'name modality')
      .populate('teacherId', 'email')
      .lean();
    res.json({ evaluations });
  } catch (error) {
    next(error);
  }
});

managementRouter.post('/social/posts', requireRoles('admin', 'teacher', 'student'), requireTeacherPermission('social:write'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = z.object({
      classId: z.string(),
      text: z.string().trim().min(1).max(2000),
      link: z.string().url().optional()
    }).parse(req.body);
    const sportsClass = await SportsClass.findById(input.classId);
    if (!sportsClass) {
      res.status(404).json({ error: 'Turma não encontrada.' });
      return;
    }
    if (req.auth?.role === 'teacher' && sportsClass.teacherId.toString() !== req.auth.userId) {
      res.status(403).json({ error: 'Você não participa desta turma.' });
      return;
    }
    if (req.auth?.role === 'student') {
      const student = await Student.findOne({ userId: req.auth.userId });
      if (student?.enrollmentStatus !== 'approved' || !student.classIds.some((id) => id.equals(sportsClass._id))) {
        res.status(403).json({ error: 'Você não participa desta turma.' });
        return;
      }
    }
    const post = await SocialPost.create({ ...input, authorId: req.auth?.userId });
    res.status(201).json({ post });
  } catch (error) {
    next(error);
  }
});

managementRouter.post('/social/posts/:postId/comments', requireRoles('admin', 'teacher', 'student'), requireTeacherPermission('social:write'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = z.object({ text: z.string().trim().min(1).max(1000) }).parse(req.body);
    const postId = req.params.postId;
    if (!postId || !Types.ObjectId.isValid(postId)) {
      res.status(404).json({ error: 'Publicação não encontrada.' });
      return;
    }
    const post = await SocialPost.findById(postId);
    if (!post) {
      res.status(404).json({ error: 'Publicação não encontrada.' });
      return;
    }
    if (req.auth?.role === 'student') {
      const student = await Student.findOne({ userId: req.auth.userId });
      if (student?.enrollmentStatus !== 'approved' || !student.classIds.some((id) => id.equals(post.classId))) {
        res.status(403).json({ error: 'Você não participa desta turma.' });
        return;
      }
    } else if (req.auth?.role === 'teacher' && !await SportsClass.exists({ _id: post.classId, teacherId: req.auth.userId })) {
      res.status(403).json({ error: 'Você não participa desta turma.' });
      return;
    }
    const comment = await SocialComment.create({ ...input, postId: post._id, authorId: req.auth?.userId });
    res.status(201).json({ comment });
  } catch (error) {
    next(error);
  }
});

managementRouter.post('/social/posts/:postId/like', requireRoles('admin', 'teacher', 'student'), requireTeacherPermission('social:write'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const postId = req.params.postId;
    if (!postId || !Types.ObjectId.isValid(postId)) {
      res.status(404).json({ error: 'Publicação não encontrada.' });
      return;
    }
    const post = await SocialPost.findById(postId);
    if (!post) {
      res.status(404).json({ error: 'Publicação não encontrada.' });
      return;
    }
    if (req.auth?.role === 'student') {
      const student = await Student.findOne({ userId: req.auth.userId });
      if (student?.enrollmentStatus !== 'approved' || !student.classIds.some((id) => id.equals(post.classId))) {
        res.status(403).json({ error: 'Você não participa desta turma.' });
        return;
      }
    } else if (req.auth?.role === 'teacher' && !await SportsClass.exists({ _id: post.classId, teacherId: req.auth.userId })) {
      res.status(403).json({ error: 'Você não participa desta turma.' });
      return;
    }
    const hasLiked = post.likedBy.some((id) => id.toString() === req.auth?.userId);
    await SocialPost.updateOne({ _id: post._id }, hasLiked
      ? { $pull: { likedBy: req.auth?.userId } }
      : { $addToSet: { likedBy: req.auth?.userId } });
    res.json({ liked: !hasLiked });
  } catch (error) {
    next(error);
  }
});

managementRouter.get('/social/posts', requireRoles('admin', 'teacher', 'student'), requireTeacherPermission('social:read'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const classId = z.string().regex(/^[a-f\d]{24}$/i).parse(req.query.classId);
    if (req.auth?.role === 'teacher') {
      const ownsClass = await SportsClass.exists({ _id: classId, teacherId: req.auth.userId });
      if (!ownsClass) {
        res.status(403).json({ error: 'Você não participa desta turma.' });
        return;
      }
    } else if (req.auth?.role === 'student') {
      const student = await Student.findOne({ userId: req.auth.userId });
      if (student?.enrollmentStatus !== 'approved' || !student.classIds.some((id) => id.toString() === classId)) {
        res.status(403).json({ error: 'Você não participa desta turma.' });
        return;
      }
    }
    const posts = await SocialPost.find({ classId }).sort({ createdAt: -1 }).limit(100).populate('authorId', 'email role').lean();
    const comments = posts.length
      ? await SocialComment.find({ postId: { $in: posts.map((post) => post._id) } })
        .sort({ createdAt: -1 })
        .limit(5000)
        .populate('authorId', 'email role')
        .lean()
      : [];
    const commentsByPost = new Map<string, typeof comments>();
    for (const comment of comments) {
      const postKey = comment.postId.toString();
      const postComments = commentsByPost.get(postKey) ?? [];
      if (postComments.length < 50) postComments.push(comment);
      commentsByPost.set(postKey, postComments);
    }
    res.json({
      posts: posts.map((post) => ({
        ...post,
        comments: (commentsByPost.get(post._id.toString()) ?? []).reverse(),
        likedBy: post.likedBy.map((userId) => userId.toString())
      }))
    });
  } catch (error) {
    next(error);
  }
});

managementRouter.get('/notifications', requireRoles('admin', 'teacher', 'student'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const notifications = await Notification.find({ recipientId: req.auth?.userId }).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ notifications });
  } catch (error) {
    next(error);
  }
});

managementRouter.patch('/notifications/:notificationId/read', requireRoles('admin', 'teacher', 'student'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.notificationId, recipientId: req.auth?.userId },
      { readAt: new Date() },
      { new: true }
    );
    if (!notification) {
      res.status(404).json({ error: 'Notificação não encontrada.' });
      return;
    }
    res.json({ notification });
  } catch (error) {
    next(error);
  }
});

managementRouter.get('/audit-logs', requireRoles('admin'), async (req, res, next) => {
  try {
    const query = z.object({
      action: z.string().trim().min(1).max(120).optional(),
      resource: z.enum(['Student', 'User', 'SportsClass']).optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional()
    }).refine((value) => !value.from || !value.to || value.from <= value.to, {
      message: 'A data inicial deve ser anterior à data final.'
    }).parse(req.query);
    const filter: Record<string, unknown> = {};
    if (query.action) filter.action = query.action;
    if (query.resource) filter.resource = query.resource;
    if (query.from || query.to) {
      filter.createdAt = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {})
      };
    }
    const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(200).populate('actorId', 'email').lean();
    res.json({ logs });
  } catch (error) {
    next(error);
  }
});
