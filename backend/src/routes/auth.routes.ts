import { randomUUID, createHash } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { env } from "../config/environment.js";
import { AuditLog, Class, FileUpload, PasswordHistory, PasswordResetRequest, User } from "../models/index.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import {
  initializeEnrollmentCounter,
  releaseEnrollment,
  reserveEnrollment,
} from "../services/enrollment.service.js";
import { changePassword, hashPassword, validatePassword } from "../services/password.service.js";
import { getRegistrationSettings, releaseRegistration, reserveRegistration } from "../services/registration.service.js";
import { getSiteContent } from "../services/siteContent.service.js";
import { getClassEligibilityRequirements, type ClassEligibility } from "../services/eligibility.service.js";

const router = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Muitas tentativas de acesso. Aguarde 15 minutos e tente novamente." },
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Muitas solicitações. Tente novamente mais tarde." },
});
const passwordResetRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Muitas solicitações. Aguarde antes de tentar novamente." },
});
const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});
const passwordResetRequestSchema = z.object({
  email: z.string().email().max(254),
  fullName: z.string().trim().min(3).max(140),
});
const registrationSchema = z.object({
  email: z.string().email().max(254),
  fullName: z.string().trim().min(3).max(140),
  password: z.string().min(10).max(128),
  age: z.number().int().min(4).max(99),
  birthDate: z.string().date(),
  gender: z.enum(["Feminino", "Masculino", "Outro", "Prefiro não informar"]),
  classId: z.string().regex(/^[a-f\d]{24}$/i),
  school: z.string().trim().min(2).max(160),
  neighborhood: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(120),
  street: z.string().trim().min(2).max(160),
  number: z.string().trim().min(1).max(30),
  complement: z.string().trim().max(100).default(""),
  guardianName: z.string().trim().min(3).max(140),
  guardianPhone: z.string().trim().min(10).max(24),
  studentPhotoKey: z.string().regex(/^applications\/[0-9a-f-]{36}\/studentPhoto\.(png|jpg)$/i),
  signedFormPdfKey: z.string().regex(/^applications\/[0-9a-f-]{36}\/signedFormPdf\.pdf$/i),
  termsAcceptedAt: z.string().datetime(),
  termsVersion: z.string().min(1).max(24),
  consent: z.literal(true),
  eligibilityConfirmed: z.boolean().optional(),
});

function createTokens(userId: string, role: "ADM" | "PROFESSOR" | "ALUNO", isTestData: boolean) {
  const accessToken = jwt.sign({ sub: userId, role, isTestData }, env.JWT_SECRET, { expiresIn: "15m" });
  const refreshToken = jwt.sign(
    { sub: userId, role, isTestData, nonce: randomUUID() },
    env.JWT_REFRESH_SECRET,
    { expiresIn: "7d" },
  );
  return { accessToken, refreshToken };
}

function setRefreshCookie(response: import("express").Response, token: string) {
  response.cookie("refreshToken", token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/api/v1/auth",
  });
}

router.get("/registration-options", async (_request, response, next) => {
  try {
    const now = new Date();
    const registrationSettings = await getRegistrationSettings();
    if (!registrationSettings.studentRegistrationsOpen ||
      registrationSettings.studentCount >= registrationSettings.studentLimit) {
      response.json([]);
      return;
    }
    const openClassIds = await Class.find({
      registrationStartsAt: { $lte: now },
      registrationEndsAt: { $gt: now },
      isTestData: { $ne: true },
    }).distinct("_id");
    await Promise.all(openClassIds.map((id) => initializeEnrollmentCounter(id)));
    const classes = await Class.find({
      registrationStartsAt: { $lte: now },
      registrationEndsAt: { $gt: now },
      isTestData: { $ne: true },
      $expr: { $lt: [{ $ifNull: ["$enrolledCount", 0] }, "$enrollmentLimit"] },
    })
      .select("name modality enrollmentLimit enrolledCount registrationEndsAt requirements requiresNeighborhoodSchool minimumAge maximumAge otherEligibilityRequirements")
      .sort({ name: 1 })
      .limit(100)
      .lean<Array<ClassEligibility & {
        _id: unknown;
        name: string;
        modality: string;
        enrollmentLimit: number;
        enrolledCount: number;
        registrationEndsAt: Date;
      }>>();
    response.json(classes.map((sportsClass) => ({
      id: sportsClass._id,
      name: sportsClass.name,
      modality: sportsClass.modality,
      remainingSpots: Math.max(0, sportsClass.enrollmentLimit - sportsClass.enrolledCount),
      registrationEndsAt: sportsClass.registrationEndsAt,
      requirements: getClassEligibilityRequirements(sportsClass),
    })));
  } catch (error) {
    next(error);
  }
});

router.post("/login", loginLimiter, async (request, response, next) => {
  try {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Informe um e-mail e uma senha válidos." });
      return;
    }
    const user = await User.findOne({
      email: parsed.data.email.toLowerCase(),
      deletedAt: null,
    }).select("+passwordHash");
    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      response.status(401).json({ message: "E-mail ou senha incorretos." });
      return;
    }
    if (user.role === "ALUNO" && user.status !== "aprovado") {
      response.status(403).json({
        message: user.status === "recusado"
          ? `Sua inscrição precisa de ajustes. ${user.rejectionReason}`
          : "Sua inscrição ainda está em análise. Você receberá uma notificação por e-mail quando for aprovada.",
      });
      return;
    }
    const tokens = createTokens(user.id, user.role as "ADM" | "PROFESSOR" | "ALUNO", user.isTestData);
    user.refreshTokenHash = createHash("sha256").update(tokens.refreshToken).digest("hex");
    await user.save();
    await AuditLog.create({
      actorId: user.id,
      action: "login",
      resourceType: "User",
      resourceId: user._id,
      ip: request.ip,
    });
    setRefreshCookie(response, tokens.refreshToken);
    response.json({
      accessToken: tokens.accessToken,
      user: { id: user.id, fullName: user.fullName, role: user.role },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/register", registerLimiter, async (request, response, next) => {
  try {
    const parsed = registrationSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Confira os dados obrigatórios da inscrição.",
      });
      return;
    }
    const data = parsed.data;
    const siteContent = await getSiteContent();
    if (data.termsVersion !== siteContent.termsVersion) {
      response.status(400).json({ message: "Atualizamos nossos termos. Releia a política e tente novamente." });
      return;
    }
    const passwordError = validatePassword(data.password, data.fullName);
    if (passwordError) {
      response.status(400).json({ message: passwordError });
      return;
    }
    const birthDate = new Date(`${data.birthDate}T12:00:00.000Z`);
    const today = new Date();
    let calculatedAge = today.getUTCFullYear() - birthDate.getUTCFullYear();
    if (
      today.getUTCMonth() < birthDate.getUTCMonth() ||
      (today.getUTCMonth() === birthDate.getUTCMonth() && today.getUTCDate() < birthDate.getUTCDate())
    ) calculatedAge--;
    if (birthDate > today || Math.abs(calculatedAge - data.age) > 1) {
      response.status(400).json({ message: "Confira a data de nascimento e a idade informadas." });
      return;
    }
    const selectedClass = await Class.findOne({ _id: data.classId, isTestData: { $ne: true } })
      .select("modality requirements requiresNeighborhoodSchool minimumAge maximumAge otherEligibilityRequirements");
    if (!selectedClass) {
      response.status(400).json({ message: "A turma selecionada não está disponível." });
      return;
    }
    if (getClassEligibilityRequirements(selectedClass).length && !data.eligibilityConfirmed) {
      response.status(400).json({ message: "Confirme que leu os requisitos desta turma antes de enviar a inscrição." });
      return;
    }
    const existing = await User.exists({ email: data.email.toLowerCase() });
    if (existing) {
      response.status(409).json({ message: "Já existe um cadastro com esse e-mail." });
      return;
    }
    const uploads = await FileUpload.find({
      key: { $in: [data.studentPhotoKey, data.signedFormPdfKey] },
      confirmedAt: { $ne: null },
      usedAt: null,
      expiresAt: { $gt: new Date() },
    });
    const confirmedPhoto = uploads.some((upload) =>
      upload.key === data.studentPhotoKey && upload.uploadType === "studentPhoto",
    );
    const confirmedForm = uploads.some((upload) =>
      upload.key === data.signedFormPdfKey && upload.uploadType === "signedFormPdf",
    );
    if (!confirmedPhoto || !confirmedForm) {
      response.status(400).json({ message: "Envie e confirme sua foto e a ficha assinada antes de continuar." });
      return;
    }
    const registrationReservation = await reserveRegistration("student");
    if (!registrationReservation.ok) {
      response.status(409).json({
        message: registrationReservation.reason === "closed"
          ? "As inscrições de alunos estão encerradas no momento."
          : "O limite de inscrições de alunos foi atingido.",
      });
      return;
    }
    const reservedClass = await reserveEnrollment(data.classId);
    if (!reservedClass) {
      await releaseRegistration("student");
      response.status(409).json({ message: "As inscrições para essa turma estão fechadas ou as vagas foram preenchidas." });
      return;
    }
    let user;
    try {
      user = await User.create({
        email: data.email.toLowerCase(),
        passwordHash: await hashPassword(data.password),
        fullName: data.fullName,
        role: "ALUNO",
        status: "pendente",
        age: data.age,
        birthDate,
        gender: data.gender,
        modality: selectedClass.modality,
        classIds: [reservedClass._id],
        school: data.school,
        address: {
          neighborhood: data.neighborhood,
          city: data.city,
          street: data.street,
          number: data.number,
          complement: data.complement,
        },
        guardian: { name: data.guardianName, phone: data.guardianPhone },
        studentPhotoKey: data.studentPhotoKey,
        signedFormPdfKey: data.signedFormPdfKey,
        termsAcceptedAt: new Date(data.termsAcceptedAt),
        termsAcceptedIp: request.ip,
        termsVersion: siteContent.termsVersion,
      });
    } catch (error) {
      await Promise.all([
        releaseEnrollment(reservedClass._id),
        releaseRegistration("student"),
      ]);
      throw error;
    }
    await FileUpload.updateMany(
      { key: { $in: [data.studentPhotoKey, data.signedFormPdfKey] }, usedAt: null },
      { $set: { usedAt: new Date() } },
    );
    response.status(201).json({ id: user.id, status: user.status });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === 11000) {
      response.status(409).json({ message: "Já existe um cadastro com esse e-mail." });
      return;
    }
    next(error);
  }
});

router.post("/refresh", async (request, response, next) => {
  try {
    const token = request.cookies?.refreshToken as string | undefined;
    if (!token) {
      response.status(401).json({ message: "Entre novamente para continuar." });
      return;
    }
    const claims = jwt.verify(token, env.JWT_REFRESH_SECRET);
    if (typeof claims === "string" || !claims.sub || !claims.role) {
      response.status(401).json({ message: "Entre novamente para continuar." });
      return;
    }
    const user = await User.findOne({ _id: claims.sub, deletedAt: null }).select("+refreshTokenHash");
    const hash = createHash("sha256").update(token).digest("hex");
    if (!user?.refreshTokenHash || user.refreshTokenHash !== hash) {
      if (user) {
        user.refreshTokenHash = undefined;
        await user.save();
      }
      response.status(401).json({ message: "Sua sessão expirou. Entre novamente." });
      return;
    }
    const tokens = createTokens(user.id, user.role as "ADM" | "PROFESSOR" | "ALUNO", user.isTestData);
    user.refreshTokenHash = createHash("sha256").update(tokens.refreshToken).digest("hex");
    await user.save();
    setRefreshCookie(response, tokens.refreshToken);
    response.json({ accessToken: tokens.accessToken });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      response.status(401).json({ message: "Sua sessão expirou. Entre novamente." });
      return;
    }
    next(error);
  }
});

router.post("/logout", async (request, response, next) => {
  try {
    const token = request.cookies?.refreshToken as string | undefined;
    if (token) {
      try {
        const claims = jwt.verify(token, env.JWT_REFRESH_SECRET);
        if (typeof claims !== "string" && claims.sub) {
          await User.updateOne({ _id: claims.sub }, { $unset: { refreshTokenHash: 1 } });
        }
      } catch {
        // An expired or invalid refresh token cannot invalidate another session.
      }
    }
    response.clearCookie("refreshToken", {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/v1/auth",
    });
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post("/password", requireAuth, async (request: AuthenticatedRequest, response, next) => {
  try {
    const parsed = z.object({
      currentPassword: z.string().min(1).max(128),
      newPassword: z.string().min(10).max(128),
    }).safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Informe sua senha atual e uma senha nova válida." });
      return;
    }

    const user = await User.findOne({
      _id: request.user!.id,
      deletedAt: null,
    }).select("+passwordHash");
    if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
      response.status(401).json({ message: "A senha atual está incorreta." });
      return;
    }

    const passwordError = await changePassword(
      user.id,
      parsed.data.newPassword,
      user.fullName,
    );
    if (passwordError) {
      response.status(400).json({ message: passwordError });
      return;
    }
    await AuditLog.create({
      actorId: user.id,
      action: "password_change",
      resourceType: "User",
      resourceId: user._id,
      ip: request.ip,
    });

    router.post("/password-reset-requests", passwordResetRequestLimiter, async (request, response, next) => {
      try {
        const parsed = passwordResetRequestSchema.safeParse(request.body);
        if (!parsed.success) {
          response.status(400).json({ message: "Informe seu nome completo e e-mail cadastrados." });
          return;
        }

        const { email, fullName } = parsed.data;
        const escapedName = fullName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const student = await User.findOne({
          email: email.toLowerCase(),
          fullName: { $regex: `^${escapedName}$`, $options: "i" },
          role: "ALUNO",
          status: "aprovado",
          deletedAt: null,
        }).select("_id");

        if (student) {
          await PasswordResetRequest.findOneAndUpdate(
            {
              userId: student._id,
              status: "pending",
              $or: [{ processingUntil: null }, { processingUntil: { $exists: false } }],
            },
            { $setOnInsert: { userId: student._id, status: "pending", requestedAt: new Date() } },
            { upsert: true, new: true, setDefaultsOnInsert: true },
          );
        }

        response.status(202).json({
          message: "Se os dados corresponderem a uma conta de aluno ativa, a solicitação será encaminhada à administração. A confirmação de identidade será feita pela equipe.",
        });
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === 11000) {
          response.status(202).json({
            message: "Se os dados corresponderem a uma conta de aluno ativa, a solicitação será encaminhada à administração. A confirmação de identidade será feita pela equipe.",
          });
          return;
        }
        next(error);
      }
    });
    response.clearCookie("refreshToken", {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/v1/auth",
    });
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

export const authRouter = router;
