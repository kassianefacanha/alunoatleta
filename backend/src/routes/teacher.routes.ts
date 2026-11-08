import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { allowRoles, requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import {
  Attendance,
  Class,
  Evaluation,
  Event,
  LessonPlan,
  Material,
  Modality,
  Notification,
  Task,
  TaskResponse,
  User,
} from "../models/index.js";
import { recordAudit } from "../services/audit.service.js";
import { initializeEnrollmentCounter } from "../services/enrollment.service.js";

const router = Router();
const classSchema = z.object({
  name: z.string().trim().min(2).max(100),
  modality: z.string().trim().min(2).max(60),
  enrollmentLimit: z.number().int().min(1).max(10000),
  registrationStartsAt: z.string().datetime(),
  registrationEndsAt: z.string().datetime(),
  requirements: z.array(z.string().trim().min(2).max(240)).max(20).default([]),
}).refine(
  (value) => new Date(value.registrationStartsAt) < new Date(value.registrationEndsAt),
  { path: ["registrationEndsAt"], message: "O encerramento deve ocorrer após a abertura das inscrições." },
);
const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Identificador inválido.");
const workModels = {
  tasks: Task,
  materials: Material,
  "lesson-plans": LessonPlan,
  events: Event,
  evaluations: Evaluation,
  notifications: Notification,
} satisfies Record<string, typeof Task>;
const workSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(5000).default(""),
  content: z.string().trim().max(12000).default(""),
  type: z.string().trim().max(40).default(""),
  classId: objectIdSchema,
  date: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  studentId: objectIdSchema.optional(),
  grade: z.number().min(0).max(10).optional(),
  feedback: z.string().trim().max(5000).optional(),
  allowPlatformResponse: z.boolean().default(false),
});

async function getTeacherClassIds(teacherId: string) {
  return Class.distinct("_id", { teacherIds: teacherId, isTestData: { $ne: true } });
}

async function teacherOwnsClass(classId: string, teacherId: string) {
  return Class.exists({ _id: classId, teacherIds: teacherId, isTestData: { $ne: true } });
}

router.use(requireAuth, allowRoles("PROFESSOR"));

router.get("/dashboard", async (request: AuthenticatedRequest, response, next) => {
  try {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const classIds = await getTeacherClassIds(request.user!.id);
    const [classes, studentCount, pendingRegistrationCount, pendingStudents, attendance, upcomingEvents, tasks, pendingTasks] = await Promise.all([
      Class.find({ _id: { $in: classIds } }).select("name modality").sort({ name: 1 }).lean(),
      User.countDocuments({ role: "ALUNO", classIds: { $in: classIds }, status: "aprovado", deletedAt: null, isTestData: { $ne: true } }),
      User.countDocuments({ role: "ALUNO", classIds: { $in: classIds }, status: "pendente", deletedAt: null, isTestData: { $ne: true } }),
      User.find({ role: "ALUNO", classIds: { $in: classIds }, status: "pendente", deletedAt: null, isTestData: { $ne: true } })
        .select("fullName email age modality status classIds createdAt")
        .sort({ createdAt: -1 })
        .limit(6)
        .lean(),
      Attendance.aggregate([
        { $match: { classId: { $in: classIds }, date: { $gte: monthStart, $lte: now }, isTestData: { $ne: true } } },
        { $group: { _id: "$classId", records: { $sum: 1 }, present: { $sum: { $cond: ["$present", 1, 0] } } } },
      ]),
      Event.find({ classId: { $in: classIds }, date: { $gte: now }, isTestData: { $ne: true } })
        .select("title description date classId")
        .populate({ path: "classId", select: "name" })
        .sort({ date: 1 })
        .limit(5)
        .lean(),
      Task.find({ classId: { $in: classIds }, createdBy: request.user!.id, isTestData: { $ne: true } })
        .select("title dueDate classId")
        .populate({ path: "classId", select: "name" })
        .sort({ dueDate: 1 })
        .limit(5)
        .lean(),
      TaskResponse.countDocuments({
        classId: { $in: classIds },
        taskId: { $in: await Task.find({ classId: { $in: classIds }, createdBy: request.user!.id }).distinct("_id") },
        grade: { $exists: false },
        isTestData: { $ne: true },
      }),
    ]);
    const attendanceRecords = attendance.reduce((sum: number, row: { records: number }) => sum + row.records, 0);
    const attendancePresent = attendance.reduce((sum: number, row: { present: number }) => sum + row.present, 0);
    const attendanceByClass = classes.map((sportsClass) => {
      const row = attendance.find((entry: { _id: mongoose.Types.ObjectId; records: number; present: number }) =>
        String(entry._id) === String(sportsClass._id));
      return {
        id: sportsClass._id,
        name: sportsClass.name,
        rate: row?.records ? Math.round((row.present / row.records) * 100) : null,
        records: row?.records ?? 0,
      };
    });
    await recordAudit(request, "teacher_dashboard_view", "Dashboard");
    response.json({
      stats: {
        students: studentCount,
        pendingRegistrations: pendingRegistrationCount,
        attendanceRecords,
        attendanceRate: attendanceRecords ? Math.round((attendancePresent / attendanceRecords) * 100) : null,
        tasksToReview: pendingTasks,
        classes: classes.length,
      },
      classes,
      attendanceByClass,
      pendingStudents,
      upcomingEvents,
      upcomingTasks: tasks,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/profile", async (request: AuthenticatedRequest, response, next) => {
  try {
    const user = await User.findOne({ _id: request.user!.id, role: "PROFESSOR", deletedAt: null })
      .select("fullName email classIds")
      .populate({ path: "classIds", select: "name modality" })
      .lean();
    if (!user) {
      response.status(404).json({ message: "Professor não encontrado." });
      return;
    }
    response.json(user);
  } catch (error) {
    next(error);
  }
});

router.patch("/profile", async (request: AuthenticatedRequest, response, next) => {
  try {
    const parsed = z.object({
      fullName: z.string().trim().min(3).max(140),
      email: z.string().trim().email().max(254),
    }).safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: parsed.error.issues[0]?.message ?? "Confira os dados do perfil." });
      return;
    }
    const duplicate = await User.exists({
      _id: { $ne: request.user!.id },
      email: parsed.data.email.toLowerCase(),
      deletedAt: null,
    });
    if (duplicate) {
      response.status(409).json({ message: "Este e-mail já está sendo usado por outra conta." });
      return;
    }
    const user = await User.findOneAndUpdate(
      { _id: request.user!.id, role: "PROFESSOR", deletedAt: null },
      { $set: { fullName: parsed.data.fullName, email: parsed.data.email.toLowerCase() } },
      { new: true, runValidators: true },
    ).select("fullName email");
    if (!user) {
      response.status(404).json({ message: "Professor não encontrado." });
      return;
    }
    await recordAudit(request, "teacher_profile_update", "User", user.id);
    response.json(user);
  } catch (error) {
    next(error);
  }
});

router.get("/classes", async (request: AuthenticatedRequest, response, next) => {
  try {
    const classes = await Class.find({ teacherIds: request.user!.id, isTestData: { $ne: true } })
      .sort({ name: 1 })
      .limit(200)
      .lean();
    response.json(classes);
  } catch (error) {
    next(error);
  }
});

router.get("/class-students", async (request: AuthenticatedRequest, response, next) => {
  try {
    const classId = objectIdSchema.safeParse(request.query.classId);
    if (!classId.success || !await teacherOwnsClass(classId.data, request.user!.id)) {
      response.status(400).json({ message: "Selecione uma turma válida." });
      return;
    }
    const students = await User.find({
      role: "ALUNO",
      classIds: classId.data,
      status: "aprovado",
      deletedAt: null,
      isTestData: { $ne: true },
    })
      .select("fullName email status")
      .sort({ fullName: 1 })
      .limit(200)
      .lean();
    response.json(students);
  } catch (error) {
    next(error);
  }
});

router.post("/classes", async (request: AuthenticatedRequest, response, next) => {
  try {
    const parsed = classSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: parsed.error.issues[0]?.message ?? "Confira os dados da turma." });
      return;
    }
    if (!await Modality.exists({ name: parsed.data.modality })) {
      response.status(400).json({ message: "Selecione uma modalidade cadastrada." });
      return;
    }
    const sportsClass = await Class.create({
      ...parsed.data,
      registrationStartsAt: new Date(parsed.data.registrationStartsAt),
      registrationEndsAt: new Date(parsed.data.registrationEndsAt),
      teacherIds: [new mongoose.Types.ObjectId(request.user!.id)],
      enrolledCount: 0,
      enrollmentCounterInitialized: true,
      isTestData: false,
    });
    await User.updateOne({ _id: request.user!.id }, { $addToSet: { classIds: sportsClass._id } });
    await recordAudit(request, "teacher_class_create", "Class", sportsClass.id);
    response.status(201).json(sportsClass);
  } catch (error) {
    next(error);
  }
});

router.patch("/classes/:id", async (request: AuthenticatedRequest, response, next) => {
  try {
    const id = objectIdSchema.safeParse(request.params.id);
    if (!id.success) {
      response.status(400).json({ message: "Identificador de turma inválido." });
      return;
    }
    const parsed = classSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: parsed.error.issues[0]?.message ?? "Confira os dados da turma." });
      return;
    }
    if (!await Modality.exists({ name: parsed.data.modality })) {
      response.status(400).json({ message: "Selecione uma modalidade cadastrada." });
      return;
    }
    await initializeEnrollmentCounter(id.data);
    const sportsClass = await Class.findOneAndUpdate(
      {
        _id: id.data,
        teacherIds: request.user!.id,
        isTestData: { $ne: true },
        $expr: { $lte: ["$enrolledCount", parsed.data.enrollmentLimit] },
      },
      {
        $set: {
          name: parsed.data.name,
          modality: parsed.data.modality,
          enrollmentLimit: parsed.data.enrollmentLimit,
          registrationStartsAt: new Date(parsed.data.registrationStartsAt),
          registrationEndsAt: new Date(parsed.data.registrationEndsAt),
          requirements: parsed.data.requirements,
        },
        $unset: {
          requiresNeighborhoodSchool: 1,
          minimumAge: 1,
          maximumAge: 1,
          otherEligibilityRequirements: 1,
        },
      },
      { new: true, runValidators: true },
    );
    if (!sportsClass) {
      if (await Class.exists({ _id: id.data, teacherIds: request.user!.id, isTestData: { $ne: true } })) {
        response.status(409).json({ message: "O limite de vagas não pode ficar abaixo das inscrições pendentes e dos alunos aprovados." });
      } else {
        response.status(404).json({ message: "Turma não encontrada ou sem acesso autorizado." });
      }
      return;
    }
    await recordAudit(request, "teacher_class_requirements_update", "Class", sportsClass.id);
    response.json(sportsClass);
  } catch (error) {
    next(error);
  }
});

router.get("/attendance", async (request: AuthenticatedRequest, response, next) => {
  try {
    const classId = objectIdSchema.safeParse(request.query.classId);
    const date = z.string().date().safeParse(request.query.date);
    if (!classId.success || !date.success || !await teacherOwnsClass(classId.data, request.user!.id)) {
      response.status(400).json({ message: "Selecione uma turma válida e uma data." });
      return;
    }
    const start = new Date(`${date.data}T00:00:00.000Z`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const [students, records] = await Promise.all([
      User.find({
        role: "ALUNO",
        classIds: classId.data,
        status: "aprovado",
        deletedAt: null,
        isTestData: { $ne: true },
      }).select("fullName email").sort({ fullName: 1 }).lean(),
      Attendance.find({ classId: classId.data, date: { $gte: start, $lt: end }, isTestData: { $ne: true } })
        .select("studentId present")
        .lean(),
    ]);
    const attendance = new Map(records.map((record) => [String(record.studentId), record.present]));
    response.json({
      date: date.data,
      students: students.map((student) => ({
        id: student._id,
        fullName: student.fullName,
        email: student.email,
        present: attendance.get(String(student._id)) ?? false,
        marked: attendance.has(String(student._id)),
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/attendance", async (request: AuthenticatedRequest, response, next) => {
  try {
    const parsed = z.object({
      classId: objectIdSchema,
      date: z.string().date(),
      records: z.array(z.object({ studentId: objectIdSchema, present: z.boolean() })).min(1).max(200),
    }).safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: parsed.error.issues[0]?.message ?? "Confira a lista de presença." });
      return;
    }
    const { classId, date, records } = parsed.data;
    if (!await teacherOwnsClass(classId, request.user!.id)) {
      response.status(403).json({ message: "Você não tem acesso a esta turma." });
      return;
    }
    if (new Set(records.map(({ studentId }) => studentId)).size !== records.length) {
      response.status(400).json({ message: "A lista contém alunos duplicados." });
      return;
    }
    const enrolledCount = await User.countDocuments({
      _id: { $in: records.map(({ studentId }) => studentId) },
      role: "ALUNO",
      classIds: classId,
      status: "aprovado",
      deletedAt: null,
      isTestData: { $ne: true },
    });
    if (enrolledCount !== records.length) {
      response.status(400).json({ message: "A lista inclui alunos que não pertencem a esta turma." });
      return;
    }
    const dateValue = new Date(`${date}T00:00:00.000Z`);
    await Attendance.bulkWrite(records.map(({ studentId, present }) => ({
      updateOne: {
        filter: { studentId, date: dateValue },
        update: {
          $set: {
            classId,
            studentId,
            date: dateValue,
            present,
            registeredBy: request.user!.id,
            isTestData: false,
          },
        },
        upsert: true,
      },
    })));
    await recordAudit(request, "teacher_attendance_save", "Attendance", undefined, { classId, date, count: records.length });
    response.json({ saved: records.length });
  } catch (error) {
    next(error);
  }
});

router.get("/attendance/history", async (request: AuthenticatedRequest, response, next) => {
  try {
    const classId = objectIdSchema.safeParse(request.query.classId);
    if (!classId.success || !await teacherOwnsClass(classId.data, request.user!.id)) {
      response.status(400).json({ message: "Selecione uma turma válida." });
      return;
    }
    const rows = await Attendance.aggregate([
      { $match: { classId: new mongoose.Types.ObjectId(classId.data), isTestData: { $ne: true } } },
      { $group: { _id: "$date", total: { $sum: 1 }, present: { $sum: { $cond: ["$present", 1, 0] } } } },
      { $sort: { _id: -1 } },
      { $limit: 60 },
    ]);
    response.json(rows.map((row: { _id: Date; total: number; present: number }) => ({
      date: row._id,
      total: row.total,
      present: row.present,
      rate: row.total ? Math.round((row.present / row.total) * 100) : 0,
    })));
  } catch (error) {
    next(error);
  }
});

router.get("/work/:resource", async (request: AuthenticatedRequest, response, next) => {
  try {
    const resource = z.enum(["tasks", "materials", "lesson-plans", "events", "evaluations", "notifications"]).safeParse(request.params.resource);
    if (!resource.success) {
      response.status(404).json({ message: "Área não encontrada." });
      return;
    }
    const classIds = await getTeacherClassIds(request.user!.id);
    const classId = z.string().optional().parse(request.query.classId);
    if (classId && (!mongoose.isValidObjectId(classId) || !classIds.some((id) => String(id) === classId))) {
      response.status(403).json({ message: "Você não tem acesso a esta turma." });
      return;
    }
    const filter: Record<string, unknown> = {
      classId: classId ?? { $in: classIds },
      isTestData: { $ne: true },
    };
    if (resource.data === "tasks") filter.createdBy = request.user!.id;
    if (resource.data === "notifications") filter.createdBy = request.user!.id;
    const records = await workModels[resource.data]
      .find(filter)
      .populate({ path: "classId", select: "name modality" })
      .populate({ path: "studentId", select: "fullName email" })
      .sort({ date: -1, dueDate: -1, createdAt: -1 })
      .limit(250)
      .lean();
    response.json(records);
  } catch (error) {
    next(error);
  }
});

router.post("/work/:resource", async (request: AuthenticatedRequest, response, next) => {
  try {
    const resource = z.enum(["tasks", "materials", "lesson-plans", "events", "evaluations"]).safeParse(request.params.resource);
    const parsed = workSchema.safeParse(request.body);
    if (!resource.success || !parsed.success) {
      response.status(400).json({ message: parsed.success ? "Área inválida." : parsed.error.issues[0]?.message ?? "Confira os dados." });
      return;
    }
    if (!await teacherOwnsClass(parsed.data.classId, request.user!.id)) {
      response.status(403).json({ message: "Você não tem acesso a esta turma." });
      return;
    }
    if ((resource.data === "evaluations") && !parsed.data.studentId) {
      response.status(400).json({ message: "Selecione o aluno que será avaliado." });
      return;
    }
    if (parsed.data.studentId) {
      const studentEnrolled = await User.exists({
        _id: parsed.data.studentId,
        role: "ALUNO",
        classIds: parsed.data.classId,
        status: "aprovado",
        deletedAt: null,
        isTestData: { $ne: true },
      });
      if (!studentEnrolled) {
        response.status(400).json({ message: "O aluno selecionado não pertence a esta turma." });
        return;
      }
    }
    const model = workModels[resource.data];
    const record = await model.create({
      title: parsed.data.title,
      description: parsed.data.description,
      content: parsed.data.content,
      type: parsed.data.type,
      classId: parsed.data.classId,
      ...(parsed.data.date && { date: new Date(parsed.data.date) }),
      ...(parsed.data.dueDate && { dueDate: new Date(parsed.data.dueDate) }),
      ...(parsed.data.studentId && { studentId: parsed.data.studentId }),
      ...(parsed.data.grade !== undefined && { grade: parsed.data.grade }),
      ...(parsed.data.feedback !== undefined && { feedback: parsed.data.feedback }),
      ...(resource.data === "tasks" && { data: { allowResponse: parsed.data.allowPlatformResponse } }),
      createdBy: request.user!.id,
      isTestData: false,
    });
    await recordAudit(request, `teacher_${resource.data}_create`, resource.data, record.id);
    response.status(201).json(record);
  } catch (error) {
    next(error);
  }
});

router.patch("/work/:resource/:id", async (request: AuthenticatedRequest, response, next) => {
  try {
    const resource = z.enum(["tasks", "materials", "lesson-plans", "events", "evaluations"]).safeParse(request.params.resource);
    const id = objectIdSchema.safeParse(request.params.id);
    const parsed = workSchema.safeParse(request.body);
    if (!resource.success || !id.success || !parsed.success) {
      response.status(400).json({ message: parsed.success ? "Identificador ou área inválida." : parsed.error.issues[0]?.message ?? "Confira os dados." });
      return;
    }
    if (!await teacherOwnsClass(parsed.data.classId, request.user!.id)) {
      response.status(403).json({ message: "Você não tem acesso a esta turma." });
      return;
    }
    const model = workModels[resource.data];
    const record = await model.findOneAndUpdate(
      { _id: id.data, createdBy: request.user!.id, classId: { $in: await getTeacherClassIds(request.user!.id) } },
      {
        $set: {
          title: parsed.data.title,
          description: parsed.data.description,
          content: parsed.data.content,
          type: parsed.data.type,
          classId: parsed.data.classId,
          date: parsed.data.date ? new Date(parsed.data.date) : undefined,
          dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
          studentId: parsed.data.studentId,
          grade: parsed.data.grade,
          feedback: parsed.data.feedback,
          ...(resource.data === "tasks" && { data: { allowResponse: parsed.data.allowPlatformResponse } }),
        },
      },
      { new: true, runValidators: true },
    );
    if (!record) {
      response.status(404).json({ message: "Registro não encontrado ou sem acesso autorizado." });
      return;
    }
    await recordAudit(request, `teacher_${resource.data}_update`, resource.data, record.id);
    response.json(record);
  } catch (error) {
    next(error);
  }
});

router.delete("/work/:resource/:id", async (request: AuthenticatedRequest, response, next) => {
  try {
    const resource = z.enum(["tasks", "materials", "lesson-plans", "events", "evaluations"]).safeParse(request.params.resource);
    const id = objectIdSchema.safeParse(request.params.id);
    if (!resource.success || !id.success) {
      response.status(400).json({ message: "Identificador ou área inválida." });
      return;
    }
    const record = await workModels[resource.data].findOneAndDelete({
      _id: id.data,
      createdBy: request.user!.id,
      classId: { $in: await getTeacherClassIds(request.user!.id) },
    });
    if (!record) {
      response.status(404).json({ message: "Registro não encontrado ou sem acesso autorizado." });
      return;
    }
    await recordAudit(request, `teacher_${resource.data}_delete`, resource.data, record.id);
    response.json({ message: "Registro removido." });
  } catch (error) {
    next(error);
  }
});

router.post("/notifications", async (request: AuthenticatedRequest, response, next) => {
  try {
    const parsed = z.object({
      title: z.string().trim().min(2).max(200),
      description: z.string().trim().min(1).max(5000),
      classId: objectIdSchema,
      studentIds: z.array(objectIdSchema).max(200).default([]),
    }).safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: parsed.error.issues[0]?.message ?? "Confira os dados da notificação." });
      return;
    }
    const { classId, studentIds } = parsed.data;
    if (!await teacherOwnsClass(classId, request.user!.id)) {
      response.status(403).json({ message: "Você não tem acesso a esta turma." });
      return;
    }
    const students = await User.find({
      role: "ALUNO",
      classIds: classId,
      status: "aprovado",
      deletedAt: null,
      isTestData: { $ne: true },
      ...(studentIds.length ? { _id: { $in: studentIds } } : {}),
    }).select("_id");
    if (studentIds.length && students.length !== new Set(studentIds).size) {
      response.status(400).json({ message: "Um ou mais alunos não pertencem a esta turma." });
      return;
    }
    if (!students.length) {
      response.status(400).json({ message: "Não há alunos aprovados para receber a notificação." });
      return;
    }
    const records = await Notification.insertMany(students.map((student) => ({
      title: parsed.data.title,
      description: parsed.data.description,
      classId,
      studentId: student._id,
      createdBy: request.user!.id,
      isTestData: false,
      data: { read: false },
    })));
    await recordAudit(request, "teacher_notification_create", "Notification", undefined, { classId, recipients: records.length });
    response.status(201).json({ sent: records.length });
  } catch (error) {
    next(error);
  }
});

router.get("/task-responses", async (request: AuthenticatedRequest, response, next) => {
  try {
    const classIds = await getTeacherClassIds(request.user!.id);
    const taskIds = await Task.find({
      classId: { $in: classIds },
      createdBy: request.user!.id,
      isTestData: { $ne: true },
    }).distinct("_id");
    const responses = await TaskResponse.find({
      taskId: { $in: taskIds },
      classId: { $in: classIds },
      isTestData: { $ne: true },
    })
      .populate({ path: "taskId", select: "title dueDate" })
      .populate({ path: "studentId", select: "fullName email" })
      .populate({ path: "classId", select: "name" })
      .sort({ createdAt: -1 })
      .limit(300)
      .lean();
    response.json(responses);
  } catch (error) {
    next(error);
  }
});

router.patch("/task-responses/:id/grade", async (request: AuthenticatedRequest, response, next) => {
  try {
    const id = objectIdSchema.safeParse(request.params.id);
    const parsed = z.object({
      grade: z.number().min(0).max(10),
      feedback: z.string().trim().max(5000).default(""),
    }).safeParse(request.body);
    if (!id.success || !parsed.success) {
      response.status(400).json({ message: parsed.success ? "Identificador inválido." : parsed.error.issues[0]?.message ?? "Confira a nota." });
      return;
    }
    const taskIds = await Task.find({
      classId: { $in: await getTeacherClassIds(request.user!.id) },
      createdBy: request.user!.id,
    }).distinct("_id");
    const taskResponse = await TaskResponse.findOneAndUpdate(
      { _id: id.data, taskId: { $in: taskIds }, isTestData: { $ne: true } },
      { $set: { grade: parsed.data.grade, feedback: parsed.data.feedback } },
      { new: true, runValidators: true },
    );
    if (!taskResponse) {
      response.status(404).json({ message: "Resposta não encontrada ou sem acesso autorizado." });
      return;
    }
    await recordAudit(request, "teacher_task_response_grade", "TaskResponse", taskResponse.id, parsed.data);
    response.json(taskResponse);
  } catch (error) {
    next(error);
  }
});

router.get("/reports", async (request: AuthenticatedRequest, response, next) => {
  try {
    const classIds = await getTeacherClassIds(request.user!.id);
    const from = z.string().date().optional().parse(request.query.from);
    const to = z.string().date().optional().parse(request.query.to);
    if (from && to && from > to) {
      response.status(400).json({ message: "A data inicial deve ser anterior à data final." });
      return;
    }
    const date: Record<string, Date> = {
      ...(from && { $gte: new Date(`${from}T00:00:00.000Z`) }),
      ...(to && { $lt: new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000) }),
    };
    const dateFilter = Object.keys(date).length ? { date } : {};
    const dueDateFilter = Object.keys(date).length ? { dueDate: date } : {};
    const createdAtFilter = Object.keys(date).length ? { createdAt: date } : {};
    const [attendance, evaluations, tasks, responses] = await Promise.all([
      Attendance.find({ classId: { $in: classIds }, isTestData: { $ne: true }, ...dateFilter })
        .populate({ path: "studentId", select: "fullName" })
        .populate({ path: "classId", select: "name" })
        .sort({ date: -1 }).limit(5000).lean(),
      Evaluation.find({ classId: { $in: classIds }, createdBy: request.user!.id, isTestData: { $ne: true }, ...dateFilter })
        .populate({ path: "studentId", select: "fullName" })
        .populate({ path: "classId", select: "name" })
        .sort({ date: -1 }).limit(5000).lean(),
      Task.find({ classId: { $in: classIds }, createdBy: request.user!.id, isTestData: { $ne: true }, ...dueDateFilter })
        .populate({ path: "classId", select: "name" })
        .sort({ dueDate: -1 }).limit(5000).lean(),
      TaskResponse.find({
        classId: { $in: classIds },
        taskId: { $in: await Task.find({ classId: { $in: classIds }, createdBy: request.user!.id }).distinct("_id") },
        isTestData: { $ne: true },
        ...createdAtFilter,
      })
        .populate({ path: "studentId", select: "fullName" })
        .populate({ path: "taskId", select: "title" })
        .populate({ path: "classId", select: "name" })
        .sort({ createdAt: -1 }).limit(5000).lean(),
    ]);
    response.json({ attendance, evaluations, tasks, responses });
  } catch (error) {
    next(error);
  }
});

export const teacherRouter = router;
