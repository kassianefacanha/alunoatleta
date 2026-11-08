import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { allowRoles, requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import {
  Attendance,
  Class,
  Evaluation,
  Event,
  LGPDRequest,
  LessonPlan,
  Material,
  Notification,
  Task,
  TaskResponse,
  User,
} from "../models/index.js";
import { recordAudit } from "../services/audit.service.js";
import { getStudentDataExport } from "../services/student-data-export.service.js";
import { getTestDataFilter } from "../services/testDataScope.js";

const router = Router();
const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Identificador inválido.");

router.use(requireAuth, allowRoles("ALUNO"));

function taskAllowsResponse(data: unknown) {
  return typeof data === "object" && data !== null && "allowResponse" in data && data.allowResponse === true;
}

router.get("/dashboard", async (request: AuthenticatedRequest, response, next) => {
  try {
    const dataScope = getTestDataFilter(request.user!.isTestData);
    const [student] = await User.find({
      _id: request.user!.id,
      role: "ALUNO",
      status: "aprovado",
      deletedAt: null,
      ...dataScope,
    })
      .limit(1)
      .select("fullName email age birthDate gender modality school address guardian classIds termsAcceptedAt termsVersion isTestData")
      .lean();
    if (!student) {
      response.status(404).json({ message: "Conta de aluno ativa não encontrada." });
      return;
    }

    const classIds = student.classIds ?? [];
    const classIdFilter = { $in: classIds };
    const [classes, tasks, materials, lessonPlans, events, evaluations, attendance, notifications] = await Promise.all([
      Class.find({ _id: classIdFilter, ...dataScope })
        .select("name modality")
        .sort({ name: 1 })
        .lean(),
      Task.find({ classId: classIdFilter, ...dataScope })
        .select("title description content classId dueDate createdAt data")
        .populate({ path: "classId", select: "name modality" })
        .sort({ dueDate: 1, createdAt: -1 })
        .limit(250)
        .lean(),
      Material.find({ classId: classIdFilter, ...dataScope })
        .select("title description content type classId createdAt")
        .populate({ path: "classId", select: "name modality" })
        .sort({ createdAt: -1 })
        .limit(250)
        .lean(),
      LessonPlan.find({ classId: classIdFilter, ...dataScope })
        .select("title description content date classId createdAt")
        .populate({ path: "classId", select: "name modality" })
        .sort({ date: -1, createdAt: -1 })
        .limit(250)
        .lean(),
      Event.find({ classId: classIdFilter, ...dataScope })
        .select("title description date classId createdAt")
        .populate({ path: "classId", select: "name modality" })
        .sort({ date: 1, createdAt: -1 })
        .limit(250)
        .lean(),
      Evaluation.find({
        classId: classIdFilter,
        studentId: student._id,
        ...dataScope,
      })
        .select("title description date grade feedback classId createdAt")
        .populate({ path: "classId", select: "name modality" })
        .sort({ date: -1, createdAt: -1 })
        .limit(250)
        .lean(),
      Attendance.find({
        classId: classIdFilter,
        studentId: student._id,
        ...dataScope,
      })
        .select("date present classId")
        .populate({ path: "classId", select: "name modality" })
        .sort({ date: -1 })
        .limit(1000)
        .lean(),
      Notification.find({
        studentId: student._id,
        classId: classIdFilter,
        ...dataScope,
      })
        .select("title description classId data createdAt")
        .populate({ path: "classId", select: "name modality" })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
    ]);

    const responses = tasks.length
      ? await TaskResponse.find({
        taskId: { $in: tasks.map((task) => task._id) },
        studentId: student._id,
        classId: classIdFilter,
        ...dataScope,
      })
        .select("taskId content grade feedback createdAt")
        .sort({ createdAt: -1 })
        .lean()
      : [];
    const lgpdRequests = await LGPDRequest.find({
      userId: student._id,
      ...dataScope,
    })
      .select("type description status responseNote createdAt updatedAt reviewedAt")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    const responseByTask = new Map<string, (typeof responses)[number]>();
    for (const taskResponse of responses) {
      const taskId = String(taskResponse.taskId);
      if (!responseByTask.has(taskId)) responseByTask.set(taskId, taskResponse);
    }

    response.json({
      student: {
        _id: student._id,
        fullName: student.fullName,
        email: student.email,
        age: student.age,
        birthDate: student.birthDate,
        gender: student.gender,
        modality: student.modality,
        school: student.school,
        address: student.address,
        guardian: student.guardian,
        termsAcceptedAt: student.termsAcceptedAt,
        termsVersion: student.termsVersion,
      },
      classes,
      tasks: tasks.map((task) => ({
        ...task,
        allowResponse: taskAllowsResponse(task.data),
        response: responseByTask.get(String(task._id)) ?? null,
      })),
      materials,
      lessonPlans,
      events,
      evaluations,
      attendance,
      notifications,
      lgpdRequests,
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/profile", async (request: AuthenticatedRequest, response, next) => {
  try {
    const textField = (max: number) => z.string().trim().max(max);
    const parsed = z.object({
      fullName: z.string().trim().min(2).max(140).optional(),
      age: z.number().int().min(4).max(99).optional(),
      birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      gender: z.enum(["Feminino", "Masculino", "Outro", "Prefiro não informar"]).optional(),
      modality: textField(60).optional(),
      school: textField(160).optional(),
      address: z.object({
        neighborhood: textField(120).optional(),
        city: textField(120).optional(),
        street: textField(160).optional(),
        number: textField(30).optional(),
        complement: textField(160).optional(),
      }).strict().optional(),
      guardian: z.object({
        name: textField(140).optional(),
        phone: textField(40).optional(),
      }).strict().optional(),
    }).strict().refine((value) => Object.keys(value).length > 0, "Informe ao menos um dado para atualizar.");
    const result = parsed.safeParse(request.body);
    if (!result.success) {
      response.status(400).json({ message: result.error.issues[0]?.message ?? "Confira os dados informados." });
      return;
    }

    const studentFilter = {
      _id: request.user!.id,
      role: "ALUNO",
      status: "aprovado",
      deletedAt: null,
      ...getTestDataFilter(request.user!.isTestData),
    };
    const updates: Record<string, unknown> = {};
    if (result.data.fullName !== undefined) updates.fullName = result.data.fullName;
    if (result.data.age !== undefined) updates.age = result.data.age;
    if (result.data.birthDate !== undefined) updates.birthDate = result.data.birthDate;
    if (result.data.gender !== undefined) updates.gender = result.data.gender;
    if (result.data.modality !== undefined) updates.modality = result.data.modality;
    if (result.data.school !== undefined) updates.school = result.data.school;
    if (result.data.address) {
      for (const key of ["neighborhood", "city", "street", "number", "complement"] as const) {
        const value = result.data.address[key];
        if (value !== undefined) updates[`address.${key}`] = value;
      }
    }
    if (result.data.guardian) {
      for (const key of ["name", "phone"] as const) {
        const value = result.data.guardian[key];
        if (value !== undefined) updates[`guardian.${key}`] = value;
      }
    }

    const updateResult = await User.updateOne(
      studentFilter,
      { $set: updates },
      { runValidators: true },
    );
    if (!updateResult.matchedCount) {
      response.status(404).json({ message: "Conta de aluno ativa não encontrada." });
      return;
    }
    const [student] = await User.find(studentFilter)
      .limit(1)
      .select("fullName email age birthDate gender modality school address guardian termsAcceptedAt termsVersion")
      .lean();
    if (!student) {
      response.status(404).json({ message: "Conta de aluno ativa não encontrada." });
      return;
    }
    await recordAudit(request, "student_profile_update", "User", String(student._id), {
      fields: Object.keys(result.data),
    });
    response.json({ student });
  } catch (error) {
    next(error);
  }
});

router.patch("/notifications/:id/read", async (request: AuthenticatedRequest, response, next) => {
  try {
    const notificationId = objectIdSchema.safeParse(request.params.id);
    if (!notificationId.success) {
      response.status(400).json({ message: "Identificador de notificação inválido." });
      return;
    }
    const [student] = await User.find({
      _id: request.user!.id,
      role: "ALUNO",
      status: "aprovado",
      deletedAt: null,
      ...getTestDataFilter(request.user!.isTestData),
    }).limit(1).select("classIds");
    if (!student) {
      response.status(404).json({ message: "Conta de aluno ativa não encontrada." });
      return;
    }
    const notificationFilter = {
      _id: notificationId.data,
      studentId: student._id,
      classId: { $in: student.classIds },
      ...getTestDataFilter(request.user!.isTestData),
    };
    const updateResult = await Notification.updateOne(
      notificationFilter,
      { $set: { "data.read": true } },
    );
    if (!updateResult.matchedCount) {
      response.status(404).json({ message: "Notificação não encontrada." });
      return;
    }
    await recordAudit(request, "student_notification_read", "Notification", notificationId.data);
    response.json({ notification: { _id: notificationId.data, data: { read: true } } });
  } catch (error) {
    next(error);
  }
});

router.post("/lgpd-requests", async (request: AuthenticatedRequest, response, next) => {
  try {
    const parsed = z.object({
      type: z.enum(["access", "correction", "deletion", "portability", "revocation"]),
      description: z.string().trim().max(2000).optional(),
    }).strict().safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: parsed.error.issues[0]?.message ?? "Confira o tipo e a descrição da solicitação." });
      return;
    }

    const [student] = await User.find({
      _id: request.user!.id,
      role: "ALUNO",
      status: "aprovado",
      deletedAt: null,
      ...getTestDataFilter(request.user!.isTestData),
    }).limit(1).select("_id");
    if (!student) {
      response.status(404).json({ message: "Conta de aluno ativa não encontrada." });
      return;
    }

    const lgpdRequest = await LGPDRequest.create({
      userId: student._id,
      type: parsed.data.type,
      description: parsed.data.description,
      isTestData: request.user!.isTestData,
    });
    await recordAudit(request, "student_lgpd_request_create", "LGPDRequest", lgpdRequest.id, {
      type: lgpdRequest.type,
    });
    response.status(201).json({
      request: {
        _id: lgpdRequest.id,
        type: lgpdRequest.type,
        description: lgpdRequest.description,
        status: lgpdRequest.status,
        createdAt: lgpdRequest.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/lgpd-requests/:id/export", async (request: AuthenticatedRequest, response, next) => {
  try {
    const id = objectIdSchema.safeParse(request.params.id);
    if (!id.success) {
      response.status(400).json({ message: "Identificador de solicitação inválido." });
      return;
    }
    const approvedRequest = await LGPDRequest.findOne({
      _id: id.data,
      userId: request.user!.id,
      type: "portability",
      status: "completed",
      ...getTestDataFilter(request.user!.isTestData),
    }).select("_id");
    if (!approvedRequest) {
      response.status(403).json({ message: "O download só fica disponível após a aprovação da solicitação pela administração." });
      return;
    }
    const data = await getStudentDataExport(request.user!.id, request.user!.isTestData);
    if (!data) {
      response.status(404).json({ message: "Conta de aluno ativa não encontrada." });
      return;
    }
    await recordAudit(request, "student_lgpd_portability_download", "LGPDRequest", approvedRequest.id);
    response.json({ exportedAt: new Date().toISOString(), ...data });
  } catch (error) {
    next(error);
  }
});

router.post("/tasks/:id/response", async (request: AuthenticatedRequest, response, next) => {
  try {
    const taskId = objectIdSchema.safeParse(request.params.id);
    const parsed = z.object({
      content: z.string().trim().min(1).max(12000),
    }).safeParse(request.body);
    if (!taskId.success || !parsed.success) {
      response.status(400).json({ message: parsed.success ? "Identificador de tarefa inválido." : parsed.error.issues[0]?.message ?? "Confira sua resposta." });
      return;
    }

    const student = await User.findOne({
      _id: request.user!.id,
      role: "ALUNO",
      status: "aprovado",
      deletedAt: null,
      ...getTestDataFilter(request.user!.isTestData),
    }).select("classIds");
    if (!student) {
      response.status(404).json({ message: "Conta de aluno ativa não encontrada." });
      return;
    }
    const task = await Task.findOne({
      _id: taskId.data,
      classId: { $in: student.classIds },
      ...getTestDataFilter(request.user!.isTestData),
    }).select("classId data");
    if (!task) {
      response.status(404).json({ message: "Tarefa não encontrada nas suas turmas." });
      return;
    }
    if (!taskAllowsResponse(task.data)) {
      response.status(403).json({ message: "Esta tarefa não aceita respostas pela plataforma." });
      return;
    }

    const responseFilter = {
      taskId: task._id,
      studentId: student._id,
      classId: task.classId,
      ...getTestDataFilter(request.user!.isTestData),
    };
    const existing = await TaskResponse.findOne(responseFilter).select("grade");
    if (existing?.grade !== undefined) {
      response.status(409).json({ message: "Esta resposta já foi corrigida e não pode mais ser alterada." });
      return;
    }
    const taskResponse = await TaskResponse.findOneAndUpdate(
      responseFilter,
      {
        $set: { content: parsed.data.content, description: parsed.data.content },
        $setOnInsert: {
          taskId: task._id,
          studentId: student._id,
          classId: task.classId,
          createdBy: student._id,
          isTestData: request.user!.isTestData,
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    if (!taskResponse) {
      response.status(500).json({ message: "Não foi possível registrar sua resposta." });
      return;
    }
    await recordAudit(request, "student_task_response_submit", "TaskResponse", taskResponse.id, {
      taskId: String(task._id),
      classId: String(task.classId),
    });
    response.json(taskResponse);
  } catch (error) {
    if (error instanceof mongoose.Error) {
      next(error);
      return;
    }
    next(error);
  }
});

export const studentPortalRouter = router;
