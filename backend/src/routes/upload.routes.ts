import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { confirmUploadedFile, generateUploadUrl } from "../services/r2.service.js";

const router = Router();
const uploadTypeSchema = z.enum(["studentPhoto", "signedFormPdf"]);
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Muitos envios em pouco tempo. Aguarde e tente novamente." },
});

router.post("/presign", uploadLimiter, async (request, response, next) => {
  try {
    const parsed = z.object({
      fileName: z.string().trim().min(1).max(180),
      contentType: z.string().min(1).max(100),
      uploadType: uploadTypeSchema,
    }).safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Informe um tipo de arquivo permitido." });
      return;
    }
    response.json(await generateUploadUrl(
      parsed.data.uploadType,
      parsed.data.contentType,
    ));
  } catch (error) {
    next(error);
  }
});

router.post("/confirm", uploadLimiter, async (request, response, next) => {
  try {
    const parsed = z.object({
      key: z.string().min(1).max(200),
      contentType: z.string().min(1).max(100),
      uploadType: uploadTypeSchema,
    }).safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Informe os dados do arquivo enviado." });
      return;
    }
    const key = await confirmUploadedFile(
      parsed.data.key,
      parsed.data.uploadType,
      parsed.data.contentType,
    );
    response.json({ key });
  } catch (error) {
    next(error);
  }
});

export const uploadRouter = router;
