import { SiteContent } from "../models/index.js";

export async function getSiteContent() {
  const existing = await SiteContent.findOne({ key: "public" });
  if (existing) return existing;

  try {
    return await SiteContent.create({ key: "public" });
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== 11000) throw error;
    const createdByAnotherRequest = await SiteContent.findOne({ key: "public" });
    if (!createdByAnotherRequest) throw error;
    return createdByAnotherRequest;
  }
}
