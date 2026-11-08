import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { z } from "zod";
import { env } from "./config/environment.js";
import { connectDatabase } from "./config/database.js";
import { ensureBootstrapAccounts } from "./services/bootstrapDemoAccounts.service.js";
import { requireAuth } from "./middleware/auth.js";
import { AuditLog, User } from "./models/index.js";
import { authRouter } from "./routes/auth.routes.js";
import { adminRouter } from "./routes/admin.routes.js";
import { studentRouter } from "./routes/student.routes.js";
import { studentPortalRouter } from "./routes/student-portal.routes.js";
import { teacherRouter } from "./routes/teacher.routes.js";
import { uploadRouter } from "./routes/upload.routes.js";
import { reportRouter } from "./routes/reports.routes.js";
import { publicRouter } from "./routes/public.routes.js";
import type { AuthenticatedRequest } from "./middleware/auth.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", env.NODE_ENV === "production" ? 1 : false);
app.use(helmet());
app.use(cors({
  origin: env.CLIENT_ORIGIN,
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ limit: "32kb", strict: true }));
app.use(cookieParser());

app.get("/api/v1/health", (_request, response) => {
  response.json({ status: "ok", service: "aluno-atleta-api" });
});
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/public", publicRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/admin/reports", reportRouter);
app.use("/api/v1/uploads", uploadRouter);
app.use("/api/v1/students", studentRouter);
app.use("/api/v1/student", studentPortalRouter);
app.use("/api/v1/teacher", teacherRouter);
app.get("/api/v1/audit", requireAuth, async (request, response, next) => {
  try {
    if ((request as AuthenticatedRequest).user?.role !== "ADM") {
      response.status(403).json({ message: "Somente a administração pode consultar a auditoria." });
      return;
    }
    const parsed = z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
      search: z.string().trim().max(100).default(""),
      action: z.string().trim().max(100).default(""),
      resourceType: z.string().trim().max(100).default(""),
      ip: z.string().trim().max(64).default(""),
      from: z.string().date().optional(),
      to: z.string().date().optional(),
    }).safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ message: "Confira os filtros de auditoria." });
      return;
    }
    const { page, pageSize, search, action, resourceType, ip, from, to } = parsed.data;
    if (from && to && from > to) {
      response.status(400).json({ message: "A data inicial deve ser anterior à data final." });
      return;
    }
    const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const filter: Record<string, unknown> = {
      ...(action && { action: { $regex: escapeRegex(action), $options: "i" } }),
      ...(resourceType && { resourceType: { $regex: escapeRegex(resourceType), $options: "i" } }),
      ...(ip && { ip: { $regex: escapeRegex(ip), $options: "i" } }),
      ...((from || to) && {
        at: {
          ...(from && { $gte: new Date(`${from}T00:00:00.000Z`) }),
          ...(to && { $lt: new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000) }),
        },
      }),
    };
    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      const matchingActors = await User.find({ $or: [{ fullName: regex }, { email: regex }] })
        .distinct("_id")
        .limit(500);
      filter.$or = [
        { action: regex },
        { resourceType: regex },
        { ip: regex },
        { actorId: { $in: matchingActors } },
      ];
    }
    const [rows, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ at: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .select("actorId action resourceType resourceId ip at metadata")
        .populate({ path: "actorId", select: "fullName email" })
        .lean(),
      AuditLog.countDocuments(filter),
    ]);
    response.json({ rows, total, page, pageSize });
  } catch (error) {
    next(error);
  }
});
app.use((request, response) => {
  response.status(404).json({ message: "Recurso não encontrado." });
});
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof SyntaxError && "body" in error) {
    response.status(400).json({ message: "O corpo da solicitação não é um JSON válido." });
    return;
  }
  if (error instanceof Error) {
    console.error("Falha na API:", error.message);
    if ("name" in error && error.name === "ValidationError") {
      response.status(400).json({ message: "Confira os dados e tente novamente." });
      return;
    }
  }
  response.status(500).json({ message: "Não foi possível concluir a solicitação." });
});

async function startServer() {
  await connectDatabase();
  await ensureBootstrapAccounts();
  app.listen(env.PORT, () => {
    console.log(`API Aluno / Atleta disponível na porta ${env.PORT}.`);
  });
}

startServer().catch((error: unknown) => {
  console.error("A API não foi iniciada. Confira as variáveis de ambiente e a conexão MongoDB.", error);
  process.exitCode = 1;
});
