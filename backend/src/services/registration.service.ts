import { RegistrationSettings, User } from "../models/index.js";

type RegistrationKind = "student" | "teacher";

const settingsKey = "global";

export async function getRegistrationSettings() {
  let settings = await RegistrationSettings.findOneAndUpdate(
    { key: settingsKey },
    { $setOnInsert: { key: settingsKey } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).select("+countersInitialized");

  if (!settings.countersInitialized) {
    const [studentCount, teacherCount] = await Promise.all([
      User.countDocuments({
        role: "ALUNO",
        status: { $in: ["pendente", "aprovado"] },
        deletedAt: null,
        isTestData: { $ne: true },
      }),
      User.countDocuments({
        role: "PROFESSOR",
        deletedAt: null,
        isTestData: { $ne: true },
      }),
    ]);
    await RegistrationSettings.updateOne(
      { _id: settings._id, countersInitialized: { $ne: true } },
      { $set: { studentCount, teacherCount, countersInitialized: true } },
    );
    settings = await RegistrationSettings.findById(settings._id).select("+countersInitialized");
    if (!settings) throw new Error("As configurações de inscrição não puderam ser carregadas.");
  }

  return settings;
}

export async function reserveRegistration(kind: RegistrationKind) {
  const settings = await getRegistrationSettings();
  const openField = kind === "student" ? "studentRegistrationsOpen" : "teacherRegistrationsOpen";
  const countField = kind === "student" ? "studentCount" : "teacherCount";
  const limitField = kind === "student" ? "studentLimit" : "teacherLimit";

  const reserved = await RegistrationSettings.findOneAndUpdate(
    {
      _id: settings._id,
      [openField]: true,
      $expr: { $lt: [`$${countField}`, `$${limitField}`] },
    },
    { $inc: { [countField]: 1 } },
    { new: true },
  );
  if (reserved) return { ok: true as const };

  const latest = await getRegistrationSettings();
  const isOpen = kind === "student"
    ? latest.studentRegistrationsOpen
    : latest.teacherRegistrationsOpen;
  if (!isOpen) return { ok: false as const, reason: "closed" as const };
  return { ok: false as const, reason: "limit" as const };
}

export async function releaseRegistration(kind: RegistrationKind) {
  const countField = kind === "student" ? "studentCount" : "teacherCount";
  await RegistrationSettings.updateOne(
    { key: settingsKey, [countField]: { $gt: 0 } },
    { $inc: { [countField]: -1 } },
  );
}
