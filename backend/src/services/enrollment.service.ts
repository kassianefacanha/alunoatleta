import mongoose from "mongoose";
import { Class, User } from "../models/index.js";

export async function initializeEnrollmentCounter(classId: mongoose.Types.ObjectId | string) {
  const sportsClass = await Class.findOne({
    _id: classId,
    enrollmentCounterInitialized: { $ne: true },
  }).select("+enrollmentCounterInitialized");
  if (!sportsClass) return;

  const enrolledCount = await User.countDocuments({
    classIds: sportsClass._id,
    role: "ALUNO",
    status: { $in: ["pendente", "aprovado"] },
    deletedAt: null,
  });
  await Class.updateOne(
    { _id: sportsClass._id, enrollmentCounterInitialized: { $ne: true } },
    { $set: { enrolledCount, enrollmentCounterInitialized: true } },
  );
}

export async function reserveEnrollment(classId: mongoose.Types.ObjectId | string, now = new Date()) {
  await initializeEnrollmentCounter(classId);
  return Class.findOneAndUpdate(
    {
      _id: classId,
      registrationStartsAt: { $lte: now },
      registrationEndsAt: { $gt: now },
      $expr: { $lt: ["$enrolledCount", "$enrollmentLimit"] },
    },
    { $inc: { enrolledCount: 1 } },
    { new: true },
  );
}

export async function releaseEnrollment(classId: mongoose.Types.ObjectId | string) {
  await initializeEnrollmentCounter(classId);
  await Class.updateOne(
    { _id: classId, enrolledCount: { $gt: 0 } },
    { $inc: { enrolledCount: -1 } },
  );
}
