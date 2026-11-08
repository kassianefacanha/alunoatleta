import { Router } from "express";
import { z } from "zod";
import type { Types } from "mongoose";
import { allowRoles, requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { Class, User } from "../models/index.js";
import { recordAudit } from "../services/audit.service.js";
import { releaseEnrollment } from "../services/enrollment.service.js";
import { releaseRegistration } from "../services/registration.service.js";
import { getClassEligibilityRequirements } from "../services/eligibility.service.js";
import { getApplicationDocumentUrl } from "../services/r2.service.js";
import type { ClassEligibility } from "../services/eligibility.service.js";

const router = Router();
router.use(requireAuth);
router.use(allowRoles("ADM", "PROFESSOR"));

interface StudentDetailRecord {
  _id: Types.ObjectId;
  classIds: Types.ObjectId[];
  studentPhotoKey?: string;
  signedFormPdfKey?: string;
}

interface ClassDetailRecord extends ClassEligibility {
  _id: Types.ObjectId;
  name: string;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

router.get("/", async (request: AuthenticatedRequest, response, next) => {
  try {
    const page = z.coerce.number().int().min(1).default(1).parse(request.query.page);
    const pageSize = z.coerce.number().int().min(1).max(100).default(20).parse(request.query.pageSize);
    const status = z.enum(["pendente", "aprovado", "recusado"]).optional().parse(request.query.status);
    const search = z.string().trim().max(100).optional().parse(request.query.search);
    const filter: Record<string, unknown> = {
      role: "ALUNO",
      deletedAt: null,
      ...((request.user?.role !== "ADM") && { isTestData: { $ne: true } }),
      ...(status && { status }),
      ...(search && {
        $or: [
          { fullName: { $regex: escapeRegex(search), $options: "i" } },
          { email: { $regex: escapeRegex(search), $options: "i" } },
        ],
      }),
    };
    if (request.user?.role === "PROFESSOR") {
      filter.classIds = await Class.distinct("_id", { teacherIds: request.user.id });
    }
    const [students, total] = await Promise.all([
      User.find(filter)
        .select("fullName email status age modality classIds createdAt isTestData")
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      User.countDocuments(filter),
    ]);
    await recordAudit(request, "list", "Student", undefined, { page, pageSize });
    response.json({ rows: students, total, page, pageSize });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/details", async (request: AuthenticatedRequest, response, next) => {
  try {
    const filter: Record<string, unknown> = {
      _id: request.params.id,
      role: "ALUNO",
      deletedAt: null,
      ...((request.user?.role !== "ADM") && { isTestData: { $ne: true } }),
    };
    if (request.user?.role === "PROFESSOR") {
      filter.classIds = { $in: await Class.distinct("_id", { teacherIds: request.user.id }) };
    }
    const student = await User.findOne(filter)
      .select("fullName email status rejectionReason rejectionReasons rejectionOtherReason age birthDate gender modality school address guardian classIds studentPhotoKey signedFormPdfKey termsAcceptedAt termsVersion createdAt isTestData")
      .lean<StudentDetailRecord & Record<string, unknown> | null>();
    if (!student) {
      response.status(404).json({ message: "Aluno não encontrado ou sem acesso autorizado." });
      return;
    }
    const classes = await Class.find({
      _id: { $in: student.classIds },
      ...(request.user?.role === "PROFESSOR" && { teacherIds: request.user.id }),
    })
      .select("name requirements requiresNeighborhoodSchool minimumAge maximumAge otherEligibilityRequirements")
      .lean<ClassDetailRecord[]>();
    const [photoUrl, signedFormUrl] = await Promise.all([
      student.studentPhotoKey ? getApplicationDocumentUrl(student.studentPhotoKey) : Promise.resolve(null),
      student.signedFormPdfKey ? getApplicationDocumentUrl(student.signedFormPdfKey) : Promise.resolve(null),
    ]);
    await recordAudit(request, "student_view_details", "Student", String(student._id));
    response.json({
      ...student,
      classes: classes.map((sportsClass) => ({
        id: sportsClass._id,
        name: sportsClass.name,
        requirements: getClassEligibilityRequirements(sportsClass),
      })),
      documents: { photoUrl, signedFormUrl },
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/review", async (request: AuthenticatedRequest, response, next) => {
  try {
    const { status, rejectionReasons = [], otherReason = "" } = z.object({
      status: z.enum(["aprovado", "recusado"]),
      rejectionReasons: z.array(z.string().trim().min(2).max(240)).max(25).default([]),
      otherReason: z.string().trim().max(500).default(""),
    }).parse(request.body);
    if (status === "recusado" && !rejectionReasons.length && otherReason.length < 3) {
      response.status(400).json({ message: "Marque ao menos um requisito não atendido ou informe outro motivo." });
      return;
    }
    const filter: Record<string, unknown> = {
      _id: request.params.id,
      role: "ALUNO",
      status: "pendente",
      deletedAt: null,
      ...((request.user?.role !== "ADM") && { isTestData: { $ne: true } }),
    };
    if (request.user?.role === "PROFESSOR") {
      filter.classIds = { $in: await Class.distinct("_id", { teacherIds: request.user.id }) };
    }
    const pendingStudent = await User.findOne(filter).select("classIds");
    if (!pendingStudent) {
      response.status(404).json({ message: "Inscrição não encontrada ou já foi analisada." });
      return;
    }
    if (status === "recusado") {
      const classes = await Class.find({ _id: { $in: pendingStudent.classIds } })
        .where(request.user?.role === "PROFESSOR" ? { teacherIds: request.user.id } : {})
        .select("requirements requiresNeighborhoodSchool minimumAge maximumAge otherEligibilityRequirements")
        .lean<ClassEligibility[]>();
      const allowedReasons = new Set(classes.flatMap(getClassEligibilityRequirements));
      const invalidReason = rejectionReasons.find((reason) => !allowedReasons.has(reason));
      if (invalidReason) {
        response.status(400).json({ message: "Um ou mais motivos não correspondem aos requisitos das turmas do aluno." });
        return;
      }
    }
    const rejectionReason = [...rejectionReasons, otherReason].filter(Boolean).join(" ");
    const student = await User.findOneAndUpdate(
      filter,
      {
        status,
        rejectionReason: status === "recusado" ? rejectionReason : "",
        rejectionReasons: status === "recusado" ? rejectionReasons : [],
        rejectionOtherReason: status === "recusado" ? otherReason : "",
        approvedBy: request.user!.id,
        ...(status === "aprovado" && { approvedAt: new Date() }),
      },
      { new: true },
    )    .select("fullName status rejectionReason rejectionReasons rejectionOtherReason classIds isTestData");
    if (!student) {
      response.status(404).json({ message: "Inscrição não encontrada ou já foi analisada." });
      return;
    }
    if (status === "recusado") {
      await Promise.all([
        ...student.classIds.map((classId: Types.ObjectId) => releaseEnrollment(classId)),
        ...(!student.isTestData ? [releaseRegistration("student")] : []),
      ]);
    }
    await recordAudit(request, `registration_${status}`, "Student", student.id, {
      rejectionReasons,
      otherReason,
    });
    response.json(student);
  } catch (error) {
    next(error);
  }
});

export const studentRouter = router;
