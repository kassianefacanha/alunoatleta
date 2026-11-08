import mongoose from "mongoose";
import {
  Evaluation,
  Event,
  LessonPlan,
  Material,
  Notification,
  Task,
  TaskResponse,
} from "../models/index.js";
import { env } from "./environment.js";

function getMongoErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return error.code;
}

export async function connectDatabase() {
  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 8000,
    maxPoolSize: 15,
  });
  for (const model of [Task, TaskResponse, Material, LessonPlan, Notification, Event, Evaluation]) {
    try {
      await model.collection.dropIndex("studentId_1_date_1");
    } catch (error) {
      const code = getMongoErrorCode(error);
      if (code !== 26 && code !== 27) throw error;
    }
  }
  console.log("Banco de dados conectado.");
}
