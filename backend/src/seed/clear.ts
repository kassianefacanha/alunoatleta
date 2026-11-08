import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { env } from "../config/environment.js";
import { AuditLog, LGPDRequest, PasswordHistory, PasswordResetRequest, User } from "../models/index.js";

async function clearTestData() {
  if (env.NODE_ENV === "production" || env.SEED_CLEAR_CONFIRM !== "yes") {
    throw new Error("A limpeza exige NODE_ENV diferente de production e SEED_CLEAR_CONFIRM=yes.");
  }
  await connectDatabase();
  const testUsers = await User.find({ isTestData: true }).distinct("_id");
  const ids = testUsers.map(String);
  await Promise.all([
    User.deleteMany({ isTestData: true }),
    PasswordHistory.deleteMany({ userId: { $in: testUsers } }),
    PasswordResetRequest.deleteMany({ userId: { $in: testUsers } }),
    LGPDRequest.deleteMany({ isTestData: true }),
    AuditLog.deleteMany({ actorId: { $in: testUsers } }),
  ]);
  for (const collectionName of ["classes", "attendances", "tasks", "taskresponses", "materials", "lessonplans", "notifications", "events", "evaluations"]) {
    await mongoose.connection.collection(collectionName).deleteMany({ isTestData: true });
  }
  console.log(`Dados de demonstração removidos. ${ids.length} contas de teste excluídas.`);
}

clearTestData()
  .catch((error: unknown) => {
    console.error("Não foi possível remover os dados de demonstração.", error);
    process.exitCode = 1;
  })
  .finally(async () => mongoose.disconnect());
