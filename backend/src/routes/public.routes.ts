import { Router } from "express";
import { Modality, SiteContent } from "../models/index.js";
import { getSiteContent } from "../services/siteContent.service.js";
import { getSiteDocumentUrl } from "../services/r2.service.js";

const router = Router();

router.get("/modalities", async (_request, response, next) => {
  try {
    const modalities = await Modality.find()
      .select("name description icon color")
      .sort({ name: 1 })
      .limit(100)
      .lean();
    response.json(modalities.map((modality) => ({
      id: modality._id,
      name: modality.name,
      description: modality.description ?? "",
      icon: modality.icon ?? "soccer",
      color: modality.color ?? "#2867C1",
    })));
  } catch (error) {
    next(error);
  }
});

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
      registrationFormName: content.registrationFormName,
      regulationName: content.regulationName,
      registrationFormUrl: content.registrationFormKey
        ? "/public/content-files/registration-form"
        : "/ficha-inscricao.pdf",
      regulationUrl: content.regulationKey
        ? "/public/content-files/regulation"
        : null,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/content-files/:kind", async (request, response, next) => {
  try {
    const kind = request.params.kind;
    if (kind !== "registration-form" && kind !== "regulation") {
      response.status(404).json({ message: "Documento não encontrado." });
      return;
    }
    const content = await SiteContent.findOne({ key: "public" }).select(
      "registrationFormKey registrationFormName regulationKey regulationName",
    );
    const key = kind === "registration-form" ? content?.registrationFormKey : content?.regulationKey;
    const name = kind === "registration-form" ? content?.registrationFormName : content?.regulationName;
    if (!key) {
      response.status(404).json({ message: "Documento não encontrado." });
      return;
    }
    response.redirect(302, await getSiteDocumentUrl(key, name ?? "documento.pdf"));
  } catch (error) {
    next(error);
  }
});

export const publicRouter = router;
