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
  Modality,
  PasswordResetRequest,
  Task,
  TaskResponse,
  User,
} from "../models/index.js";
import { recordAudit } from "../services/audit.service.js";
import { changePassword, hashPassword, validatePassword } from "../services/password.service.js";
import { initializeEnrollmentCounter } from "../services/enrollment.service.js";
import { getRegistrationSettings, releaseRegistration, reserveRegistration } from "../services/registration.service.js";
import { getSiteContent } from "../services/siteContent.service.js";
import { generateSiteDocumentUploadUrl, verifySiteDocument } from "../services/r2.service.js";

const router = Router();
const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Identificador inválido.");
const teacherSchema = z.object({
  fullName: z.string().trim().min(3).max(140),
  email: z.string().trim().email().max(254),
  password: z.string().min(10).max(128),
});
const teacherUpdateSchema = z.object({
  fullName: z.string().trim().min(3).max(140),
  email: z.string().trim().email().max(254),
});
const modalitySchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).default(""),
  icon: z.enum(["soccer", "basketball", "volleyball", "handball", "tennis", "running", "fitness", "swimming"]).default("soccer"),
  color: z.enum(["#DBEAFE", "#D1FAE5", "#EDE9FE", "#FFE4E6", "#FFEDD5", "#FEF3C7", "#CFFAFE", "#E2E8F0"]).default("#DBEAFE"),
});
const siteContentSchema = z.object({
  heroDescription: z.string().trim().min(1).max(1200),
  methodologyTitle: z.string().trim().min(1).max(120),
  methodologyDescription: z.string().trim().min(1).max(1200),
  modalityTitle: z.string().trim().min(1).max(120),
  modalityDescription: z.string().trim().min(1).max(1200),
  enrollmentTitle: z.string().trim().min(1).max(160),
  enrollmentDescription: z.string().trim().min(1).max(1200),
  footerDescription: z.string().trim().min(1).max(600),
  contactEmail: z.string().trim().email().max(254),
  contactPhone: z.string().trim().min(3).max(40),
  contactAddress: z.string().trim().min(2).max(200),
  supportText: z.string().trim().min(1).max(500),
  copyrightText: z.string().trim().min(1).max(300),
  termsVersion: z.string().trim().min(1).max(24),
  termsContent: z.string().trim().min(20).max(20000),
  privacyContent: z.string().trim().min(20).max(20000),
  registrationForm: z.object({
    key: z.string().min(1).max(200),
    name: z.string().trim().min(1).max(180),
  }).nullable(),
  regulation: z.object({
    key: z.string().min(1).max(200),
    name: z.string().trim().min(1).max(180),
  }).nullable(),
});
const classSchema = z.object({
  name: z.string().trim().min(2).max(100),
  modality: z.string().trim().min(2).max(60),
  teacherIds: z.array(objectIdSchema).max(20).default([]),
  enrollmentLimit: z.number().int().min(1).max(10000),
  registrationStartsAt: z.string().datetime(),
  registrationEndsAt: z.string().datetime(),
  requirements: z.array(z.string().trim().min(2).max(240)).max(20).default([]),
}).refine(
  (value) => new Date(value.registrationStartsAt) < new Date(value.registrationEndsAt),
  { path: ["registrationEndsAt"], message: "O encerramento deve ocorrer após a abertura das inscrições." },
);
const registrationSettingsSchema = z.object({
  students: z.object({
    open: z.boolean(),
    limit: z.number().int().min(1).max(100000),
  }),
  teachers: z.object({
    open: z.boolean(),
    limit: z.number().int().min(1).max(100000),
  }),
});

router.use(requireAuth, allowRoles("ADM"));

router.get("/site-content", async (_request, response, next) => {
  try {
    const content = await getSiteContent();
    response.json({
      heroDescription: content.heroDescription,
      methodologyTitle: content.methodologyTitle,
      methodologyDescription: content.methodologyDescription,
      modalityTitle: content.modalityTitle,
      modalityDescription: content.modalityDescription,
      enrollmentTitle: content.enrollmentTitle,
      enrollmentDescription: content.enrollmentDescription,
      footerDescription: content.footerDescription,
      contactEmail: content.contactEmail,
      contactPhone: content.contactPhone,
      contactAddress: content.contactAddress,
      supportText: content.supportText,
      copyrightText: content.copyrightText,
      termsVersion: content.termsVersion,
      termsUpdatedAt: content.termsUpdatedAt,
      termsContent: content.termsContent,
      privacyContent: content.privacyContent,
      registrationForm: content.registrationFormKey
        ? { key: content.registrationFormKey, name: content.registrationFormName }
        : null,
      regulation: content.regulationKey
        ? { key: content.regulationKey, name: content.regulationName }
        : null,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/site-content/upload-url", async (request, response, next) => {
  try {
    const parsed = z.object({
      kind: z.enum(["registration-form", "regulation"]),
      fileName: z.string().trim().min(1).max(180).regex(/\.pdf$/i, "Envie um arquivo PDF."),
    }).safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: parsed.error.issues[0]?.message ?? "Selecione um arquivo PDF válido." });
      return;
    }
    response.json(await generateSiteDocumentUploadUrl(parsed.data.kind));
  } catch (error) {
    next(error);
  }
});

router.patch("/site-content", async (request: AuthenticatedRequest, response, next) => {
  try {
    const parsed = siteContentSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: parsed.error.issues[0]?.message ?? "Confira os textos e documentos informados." });
      return;
    }
    const current = await getSiteContent();
    const termsChanged = current.termsContent !== parsed.data.termsContent ||
      current.privacyContent !== parsed.data.privacyContent;
    if (termsChanged && current.termsVersion === parsed.data.termsVersion) {
      response.status(400).json({ message: "Altere a versão dos termos e da política quando atualizar seus textos." });
      return;
    }
    if (parsed.data.registrationForm) {
      await verifySiteDocument(parsed.data.registrationForm.key, "registration-form");
    }
    if (parsed.data.regulation) {
      await verifySiteDocument(parsed.data.regulation.key, "regulation");
    }
    const fields = parsed.data;
    const documentsChanged = {
      registrationForm: current.registrationFormKey !== fields.registrationForm?.key,
      regulation: current.regulationKey !== fields.regulation?.key,
    };
    current.heroDescription = fields.heroDescription;
    current.methodologyTitle = fields.methodologyTitle;
    current.methodologyDescription = fields.methodologyDescription;
    current.modalityTitle = fields.modalityTitle;
    current.modalityDescription = fields.modalityDescription;
    current.enrollmentTitle = fields.enrollmentTitle;
    current.enrollmentDescription = fields.enrollmentDescription;
    current.footerDescription = fields.footerDescription;
    current.contactEmail = fields.contactEmail;
    current.contactPhone = fields.contactPhone;
    current.contactAddress = fields.contactAddress;
    current.supportText = fields.supportText;
    current.copyrightText = fields.copyrightText;
    current.termsVersion = fields.termsVersion;
    current.termsContent = fields.termsContent;
    current.privacyContent = fields.privacyContent;
    current.registrationFormKey = fields.registrationForm?.key ?? "";
    current.registrationFormName = fields.registrationForm?.name ?? "Ficha de inscrição (PDF)";
    current.regulationKey = fields.regulation?.key ?? "";
    current.regulationName = fields.regulation?.name ?? "";
    if (termsChanged) current.termsUpdatedAt = new Date();
    await current.save();
    await recordAudit(request, "site_content_update", "SiteContent", current.id, {
      termsChanged,
      termsVersion: current.termsVersion,
      documentsChanged,
    });
    response.json({
      message: "Conteúdo do site atualizado.",
      termsUpdatedAt: current.termsUpdatedAt,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/registration-settings", async (_request, response, next) => {
  try {
    const settings = await getRegistrationSettings();
    response.json({
      students: {
        open: settings.studentRegistrationsOpen,
        limit: settings.studentLimit,
        current: settings.studentCount,
      },
      teachers: {
        open: settings.teacherRegistrationsOpen,
        limit: settings.teacherLimit,
        current: settings.teacherCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/registration-settings", async (request: AuthenticatedRequest, response, next) => {
  try {
    const parsed = registrationSettingsSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: parsed.error.issues[0]?.message ?? "Confira os limites de inscrição informados." });
      return;
    }

    const settings = await getRegistrationSettings();
    settings.studentRegistrationsOpen = parsed.data.students.open;
    settings.studentLimit = parsed.data.students.limit;
    settings.teacherRegistrationsOpen = parsed.data.teachers.open;
    settings.teacherLimit = parsed.data.teachers.limit;
    await settings.save();
    await recordAudit(request, "registration_settings_update", "RegistrationSettings", settings.id, parsed.data);
    response.json({
      students: {
        open: settings.studentRegistrationsOpen,
        limit: settings.studentLimit,
        current: settings.studentCount,
      },
      teachers: {
        open: settings.teacherRegistrationsOpen,
        limit: settings.teacherLimit,
        current: settings.teacherCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/password-reset-requests", async (_request, response, next) => {
  try {
    const [requests, pendingCount] = await Promise.all([
      PasswordResetRequest.find()
        .sort({ requestedAt: -1 })
        .limit(100)
        .populate({ path: "userId", select: "fullName email role deletedAt" })
        .lean(),
      PasswordResetRequest.countDocuments({ status: "pending" }),
    ]);
    response.json({
      pendingCount,
      requests: requests.map((request) => ({
        id: request._id,
        status: request.status,
        requestedAt: request.requestedAt,
        resolvedAt: request.resolvedAt,
        user: request.userId && typeof request.userId === "object" && "fullName" in request.userId
          ? {
            id: request.userId._id,
            fullName: request.userId.fullName,
            email: request.userId.email,
            active: !request.userId.deletedAt,
          }
          : null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/users/:id/password", async (request: AuthenticatedRequest, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const parsed = z.object({ newPassword: z.string().min(10).max(128) }).safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Informe uma nova senha válida, com pelo menos 10 caracteres." });
      return;
    }
    const user = await User.findOne({
      _id: id,
      role: { $in: ["ALUNO", "PROFESSOR"] },
      deletedAt: null,
    }).select("fullName");
    if (!user) {
      response.status(404).json({ message: "Aluno ou professor não encontrado ou inativo." });
      return;
    }
    const passwordError = await changePassword(user.id, parsed.data.newPassword, user.fullName);
    if (passwordError) {
      response.status(400).json({ message: passwordError });
      return;
    }
    await recordAudit(request, "admin_password_reset", "User", user.id, { role: user.role });
    response.json({ message: "Senha atualizada. A pessoa precisará entrar novamente." });
  } catch (error) {
    next(error);
  }
});

router.patch("/password-reset-requests/:id/complete", async (request: AuthenticatedRequest, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const parsed = z.object({ newPassword: z.string().min(10).max(128) }).safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Informe uma nova senha válida, com pelo menos 10 caracteres." });
      return;
    }
    const now = new Date();
    const resetRequest = await PasswordResetRequest.findOneAndUpdate(
      {
        _id: id,
        status: "pending",
        $or: [{ processingUntil: null }, { processingUntil: { $exists: false } }, { processingUntil: { $lt: now } }],
      },
      { $set: { processingUntil: new Date(now.getTime() + 2 * 60 * 1000) } },
      { new: true },
    );
    if (!resetRequest) {
      response.status(409).json({ message: "Esta solicitação já foi atendida ou está sendo processada." });
      return;
    }
    const user = await User.findOne({
      _id: resetRequest.userId,
      role: "ALUNO",
      status: "aprovado",
      deletedAt: null,
    }).select("fullName");
    if (!user) {
      await PasswordResetRequest.updateOne(
        { _id: resetRequest.id, status: "pending" },
        { $set: { status: "rejected", resolvedAt: new Date(), resolvedBy: request.user!.id }, $unset: { processingUntil: 1 } },
      );
      response.status(404).json({ message: "A conta vinculada à solicitação não está mais ativa." });
      return;
    }
    const passwordError = await changePassword(user.id, parsed.data.newPassword, user.fullName);
    if (passwordError) {
      await PasswordResetRequest.updateOne(
        { _id: resetRequest.id, status: "pending" },
        { $unset: { processingUntil: 1 } },
      );
      response.status(400).json({ message: passwordError });
      return;
    }
    await PasswordResetRequest.updateOne(
      { _id: resetRequest.id, status: "pending" },
      { $set: { status: "completed", resolvedAt: new Date(), resolvedBy: request.user!.id }, $unset: { processingUntil: 1 } },
    );
    await recordAudit(request, "password_reset_request_complete", "User", user.id, { requestId: resetRequest.id });
    response.json({ message: "Senha atualizada e solicitação concluída." });
  } catch (error) {
    next(error);
  }
});

router.patch("/password-reset-requests/:id/reject", async (request: AuthenticatedRequest, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const now = new Date();
    const resetRequest = await PasswordResetRequest.findOneAndUpdate(
      {
        _id: id,
        status: "pending",
        $or: [{ processingUntil: null }, { processingUntil: { $exists: false } }, { processingUntil: { $lt: now } }],
      },
      { $set: { status: "rejected", resolvedAt: new Date(), resolvedBy: request.user!.id } },
      { new: true },
    );
    if (!resetRequest) {
      response.status(409).json({ message: "A solicitação já foi atendida ou está sendo processada." });
      return;
    }
    await recordAudit(request, "password_reset_request_reject", "User", resetRequest.userId.toString(), { requestId: resetRequest.id });
    response.json({ message: "Solicitação recusada." });
  } catch (error) {
    next(error);
  }
});

router.get("/lgpd-requests", async (_request, response, next) => {
  try {
    const requests = await LGPDRequest.find()
      .select("userId type description status responseNote createdAt updatedAt reviewedAt isTestData")
      .populate({ path: "userId", select: "fullName email role status" })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    response.json(requests);
  } catch (error) {
    next(error);
  }
});

router.patch("/lgpd-requests/:id", async (request: AuthenticatedRequest, response, next) => {
  try {
    const id = objectIdSchema.safeParse(request.params.id);
    const parsed = z.object({
      status: z.enum(["open", "processing", "completed", "rejected"]),
      responseNote: z.string().trim().max(2000).default(""),
    }).strict().refine(
      (value) => value.status !== "rejected" || value.responseNote.length >= 3,
      { path: ["responseNote"], message: "Informe o motivo da recusa." },
    ).safeParse(request.body);
    if (!id.success || !parsed.success) {
      response.status(400).json({ message: parsed.success ? "Identificador de solicitação inválido." : parsed.error.issues[0]?.message ?? "Confira os dados da análise." });
      return;
    }

    const lgpdRequest = await LGPDRequest.findByIdAndUpdate(
      id.data,
      {
        $set: {
          status: parsed.data.status,
          responseNote: parsed.data.responseNote,
          reviewedBy: request.user!.id,
          reviewedAt: new Date(),
        },
      },
      { new: true, runValidators: true },
    ).populate({ path: "userId", select: "fullName email role status" });
    if (!lgpdRequest) {
      response.status(404).json({ message: "Solicitação LGPD não encontrada." });
      return;
    }
    await recordAudit(request, "admin_lgpd_request_review", "LGPDRequest", lgpdRequest.id, {
      type: lgpdRequest.type,
      status: lgpdRequest.status,
    });
    response.json(lgpdRequest);
  } catch (error) {
    next(error);
  }
});

router.get("/teachers", async (_request, response, next) => {
  try {
    const teachers = await User.find({ role: "PROFESSOR", deletedAt: null })
      .select("fullName email classIds createdAt isTestData")
      .sort({ fullName: 1 })
      .limit(500)
      .lean();
    response.json(teachers);
  } catch (error) {
    next(error);
  }
});

router.post("/teachers", async (request: AuthenticatedRequest, response, next) => {
  try {
    const parsed = teacherSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: parsed.error.issues[0]?.message ?? "Confira os dados do professor." });
      return;
    }
    const data = parsed.data;
    const passwordError = validatePassword(data.password, data.fullName);
    if (passwordError) {
      response.status(400).json({ message: passwordError });
      return;
    }
    const email = data.email.toLowerCase();
    if (await User.exists({ email })) {
      response.status(409).json({ message: "Já existe uma conta com esse e-mail." });
      return;
    }
    const reservation = await reserveRegistration("teacher");
    if (!reservation.ok) {
      response.status(409).json({
        message: reservation.reason === "closed"
          ? "O cadastro de professores está encerrado no momento."
          : "O limite de professores foi atingido.",
      });
      return;
    }
    let teacher;
    try {
      teacher = await User.create({
        fullName: data.fullName,
        email,
        passwordHash: await hashPassword(data.password),
        role: "PROFESSOR",
      });
    } catch (error) {
      await releaseRegistration("teacher");
      throw error;
    }
    await recordAudit(request, "teacher_create", "User", teacher.id);
    response.status(201).json({
      _id: teacher.id,
      fullName: teacher.fullName,
      email: teacher.email,
      classIds: teacher.classIds,
      createdAt: teacher.createdAt,
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/teachers/:id", async (request: AuthenticatedRequest, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const parsed = teacherUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: parsed.error.issues[0]?.message ?? "Confira os dados do professor." });
      return;
    }
    const email = parsed.data.email.toLowerCase();
    if (await User.exists({ email, _id: { $ne: id } })) {
      response.status(409).json({ message: "Já existe uma conta com esse e-mail." });
      return;
    }
    const teacher = await User.findOneAndUpdate(
      { _id: id, role: "PROFESSOR", deletedAt: null },
      { $set: { fullName: parsed.data.fullName, email } },
      { new: true, runValidators: true },
    ).select("fullName email classIds createdAt");
    if (!teacher) {
      response.status(404).json({ message: "Professor não encontrado." });
      return;
    }
    await recordAudit(request, "teacher_update", "User", teacher.id);
    response.json(teacher);
  } catch (error) {
    next(error);
  }
});

router.delete("/teachers/:id", async (request: AuthenticatedRequest, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const currentTeacher = await User.findOne({ _id: id, role: "PROFESSOR", deletedAt: null }).select("fullName");
    if (!currentTeacher) {
      response.status(404).json({ message: "Professor não encontrado." });
      return;
    }
    if (await Class.exists({ teacherIds: id })) {
      response.status(409).json({ message: "Remova o professor das turmas antes de desativar a conta." });
      return;
    }
    const teacher = await User.findOneAndUpdate(
      { _id: id, role: "PROFESSOR", deletedAt: null },
      { $set: { deletedAt: new Date() } },
      { new: true },
    ).select("fullName isTestData");
    if (!teacher) {
      response.status(404).json({ message: "Professor não encontrado." });
      return;
    }
    if (!teacher.isTestData) await releaseRegistration("teacher");
    await recordAudit(request, "teacher_deactivate", "User", teacher.id);
    response.json({ message: "Professor desativado." });
  } catch (error) {
    next(error);
  }
});

router.get("/modalities", async (_request, response, next) => {
  try {
    const modalities = await Modality.find().sort({ name: 1 }).limit(200).lean();
    response.json(modalities);
  } catch (error) {
    next(error);
  }
});

router.post("/modalities", async (request: AuthenticatedRequest, response, next) => {
  try {
    const parsed = modalitySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: parsed.error.issues[0]?.message ?? "Confira os dados da modalidade." });
      return;
    }
    if (await Modality.exists({ name: { $regex: `^${parsed.data.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } })) {
      response.status(409).json({ message: "Essa modalidade já está cadastrada." });
      return;
    }
    const modality = await Modality.create(parsed.data);
    await recordAudit(request, "modality_create", "Modality", modality.id);
    response.status(201).json(modality);
  } catch (error) {
    next(error);
  }
});

router.patch("/modalities/:id", async (request: AuthenticatedRequest, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const parsed = modalitySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: parsed.error.issues[0]?.message ?? "Confira os dados da modalidade." });
      return;
    }
    const current = await Modality.findById(id);
    if (!current) {
      response.status(404).json({ message: "Modalidade não encontrada." });
      return;
    }
    if (current.name.toLowerCase() !== parsed.data.name.toLowerCase()) {
      const escapedName = parsed.data.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (await Modality.exists({ _id: { $ne: id }, name: { $regex: `^${escapedName}$`, $options: "i" } })) {
        response.status(409).json({ message: "Essa modalidade já está cadastrada." });
        return;
      }
      if (await Class.exists({ modality: current.name }) || await User.exists({ modality: current.name })) {
        response.status(409).json({ message: "A modalidade está vinculada a alunos ou turmas. Altere os vínculos antes de renomeá-la." });
        return;
      }
    }
    current.name = parsed.data.name;
    current.description = parsed.data.description;
    current.icon = parsed.data.icon;
    current.color = parsed.data.color;
    await current.save();
    await recordAudit(request, "modality_update", "Modality", current.id);
    response.json(current);
  } catch (error) {
    next(error);
  }
});

router.delete("/modalities/:id", async (request: AuthenticatedRequest, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const modality = await Modality.findById(id);
    if (!modality) {
      response.status(404).json({ message: "Modalidade não encontrada." });
      return;
    }
    if (await Class.exists({ modality: modality.name }) || await User.exists({ modality: modality.name })) {
      response.status(409).json({ message: "A modalidade está vinculada a alunos ou turmas e não pode ser removida." });
      return;
    }
    await modality.deleteOne();
    await recordAudit(request, "modality_delete", "Modality", modality.id);
    response.json({ message: "Modalidade removida." });
  } catch (error) {
    next(error);
  }
});

router.get("/classes", async (_request, response, next) => {
  try {
    const classIds = await Class.find().distinct("_id");
    await Promise.all(classIds.map((id) => initializeEnrollmentCounter(id)));
    const [classes, studentCounts] = await Promise.all([
      Class.find().sort({ name: 1 })
        .populate({ path: "teacherIds", match: { deletedAt: null }, select: "fullName email" })
        .limit(500)
        .lean(),
      User.aggregate([
        { $match: { role: "ALUNO", deletedAt: null, status: { $in: ["pendente", "aprovado"] } } },
        { $unwind: "$classIds" },
        { $group: { _id: "$classIds", count: { $sum: 1 } } },
      ]),
    ]);
    const studentsPerClass = new Map(studentCounts.map((item: { _id: mongoose.Types.ObjectId; count: number }) => [String(item._id), item.count]));
    const rows = classes.map((sportsClass) => ({
      ...sportsClass,
      studentCount: studentsPerClass.get(String(sportsClass._id)) ?? 0,
    }));
    response.json(rows);
  } catch (error) {
    next(error);
  }
});

async function validateClassReferences(modality: string, teacherIds: string[]) {
  if (!await Modality.exists({ name: modality })) {
    return "Selecione uma modalidade cadastrada.";
  }
  if (!teacherIds.length) return null;
  const validTeacherCount = await User.countDocuments({
    _id: { $in: teacherIds.map((id) => new mongoose.Types.ObjectId(id)) },
    role: "PROFESSOR",
    deletedAt: null,
  });
  return validTeacherCount === teacherIds.length ? null : "Um ou mais professores selecionados não estão ativos.";
}

router.post("/classes", async (request: AuthenticatedRequest, response, next) => {
  try {
    const parsed = classSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: parsed.error.issues[0]?.message ?? "Confira os dados da turma." });
      return;
    }
    const referenceError = await validateClassReferences(parsed.data.modality, parsed.data.teacherIds);
    if (referenceError) {
      response.status(400).json({ message: referenceError });
      return;
    }
    const sportsClass = await Class.create({
      ...parsed.data,
      registrationStartsAt: new Date(parsed.data.registrationStartsAt),
      registrationEndsAt: new Date(parsed.data.registrationEndsAt),
      requirements: parsed.data.requirements,
      enrolledCount: 0,
      enrollmentCounterInitialized: true,
    });
    await User.updateMany(
      { _id: { $in: parsed.data.teacherIds }, role: "PROFESSOR" },
      { $addToSet: { classIds: sportsClass._id } },
    );
    await recordAudit(request, "class_create", "Class", sportsClass.id);
    response.status(201).json(sportsClass);
  } catch (error) {
    next(error);
  }
});

router.patch("/classes/:id", async (request: AuthenticatedRequest, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const parsed = classSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: parsed.error.issues[0]?.message ?? "Confira os dados da turma." });
      return;
    }
    const referenceError = await validateClassReferences(parsed.data.modality, parsed.data.teacherIds);
    if (referenceError) {
      response.status(400).json({ message: referenceError });
      return;
    }
    await initializeEnrollmentCounter(id);
    const currentClass = await Class.findById(id).select("teacherIds");
    if (!currentClass) {
      response.status(404).json({ message: "Turma não encontrada." });
      return;
    }
    const previousTeacherIds: string[] = (currentClass.teacherIds as mongoose.Types.ObjectId[])
      .map((teacherId) => teacherId.toString());
    const sportsClass = await Class.findOneAndUpdate(
      { _id: id, $expr: { $lte: ["$enrolledCount", parsed.data.enrollmentLimit] } },
      {
        $set: {
          name: parsed.data.name,
          modality: parsed.data.modality,
          teacherIds: parsed.data.teacherIds,
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
    )
      .populate("teacherIds", "fullName email");
    if (!sportsClass) {
      if (await Class.exists({ _id: id })) {
        response.status(409).json({ message: "O limite de vagas não pode ficar abaixo das inscrições pendentes e dos alunos aprovados." });
      } else {
        response.status(404).json({ message: "Turma não encontrada." });
      }
      return;
    }
    const nextTeacherIds = parsed.data.teacherIds;
    await Promise.all([
      User.updateMany(
        { _id: { $in: previousTeacherIds.filter((teacherId) => !nextTeacherIds.includes(teacherId)) }, role: "PROFESSOR" },
        { $pull: { classIds: id } },
      ),
      User.updateMany(
        { _id: { $in: nextTeacherIds.filter((teacherId) => !previousTeacherIds.includes(teacherId)) }, role: "PROFESSOR" },
        { $addToSet: { classIds: id } },
      ),
    ]);
    await recordAudit(request, "class_update", "Class", sportsClass.id);
    response.json(sportsClass);
  } catch (error) {
    next(error);
  }
});

router.delete("/classes/:id", async (request: AuthenticatedRequest, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const sportsClass = await Class.findById(id);
    if (!sportsClass) {
      response.status(404).json({ message: "Turma não encontrada." });
      return;
    }
    const [hasStudents, hasAttendance, hasActivities] = await Promise.all([
      User.exists({ classIds: id }),
      Attendance.exists({ classId: id }),
      Promise.all([Task, TaskResponse, Material, LessonPlan, Event, Evaluation].map((model) => model.exists({ classId: id })))
        .then((results) => results.some(Boolean)),
    ]);
    if (hasStudents || hasAttendance || hasActivities) {
      response.status(409).json({ message: "A turma possui alunos ou atividades vinculadas e não pode ser removida." });
      return;
    }
    await sportsClass.deleteOne();
    await User.updateMany(
      { _id: { $in: sportsClass.teacherIds }, role: "PROFESSOR" },
      { $pull: { classIds: id } },
    );
    await recordAudit(request, "class_delete", "Class", sportsClass.id);
    response.json({ message: "Turma removida." });
  } catch (error) {
    next(error);
  }
});

router.get("/reports/summary", async (_request, response, next) => {
  try {
    const [
      studentsByStatus,
      studentsByModality,
      teachers,
      classes,
      attendanceSummary,
      registrationTimeline,
    ] = await Promise.all([
      User.aggregate([
        { $match: { role: "ALUNO", deletedAt: null } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      User.aggregate([
        { $match: { role: "ALUNO", deletedAt: null } },
        { $group: { _id: { $ifNull: ["$modality", "Não informada"] }, count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 30 },
      ]),
      User.countDocuments({ role: "PROFESSOR", deletedAt: null }),
      Class.countDocuments(),
      Attendance.aggregate([
        { $match: { date: { $gte: new Date(new Date().getFullYear(), 0, 1) } } },
        { $group: { _id: null, records: { $sum: 1 }, present: { $sum: { $cond: ["$present", 1, 0] } } } },
      ]),
      User.aggregate([
        {
          $match: {
            role: "ALUNO",
            deletedAt: null,
            createdAt: { $gte: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 11, 1)) },
          },
        },
        { $group: { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } }, count: { $sum: 1 } } },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),
    ]);
    const enrollmentStatuses = { pendente: 0, aprovado: 0, recusado: 0 };
    for (const row of studentsByStatus as Array<{ _id?: keyof typeof enrollmentStatuses; count: number }>) {
      if (row._id && row._id in enrollmentStatuses) enrollmentStatuses[row._id] = row.count;
    }
    const attendance = attendanceSummary[0] ?? { records: 0, present: 0 };
    const attendanceRate = attendance.records
      ? Math.round((attendance.present / attendance.records) * 100)
      : null;
    response.json({
      generatedAt: new Date().toISOString(),
      students: {
        total: enrollmentStatuses.pendente + enrollmentStatuses.aprovado + enrollmentStatuses.recusado,
        ...enrollmentStatuses,
        byModality: studentsByModality.map((row: { _id: string; count: number }) => ({ modality: row._id, count: row.count })),
      },
      teachers,
      classes,
      attendance: { records: attendance.records, present: attendance.present, rate: attendanceRate },
      registrationTimeline: registrationTimeline.map((row: { _id: { year: number; month: number }; count: number }) => ({
        year: row._id.year,
        month: row._id.month,
        count: row.count,
      })),
    });
  } catch (error) {
    next(error);
  }
});

export const adminRouter = router;
