import {
  Attendance,
  Class,
  Evaluation,
  Event,
  LGPDRequest,
  LessonPlan,
  Material,
  Notification,
  Task,
  TaskResponse,
  User,
} from "../models/index.js";
import { getTestDataFilter } from "./testDataScope.js";

function taskAllowsResponse(data: unknown) {
  return typeof data === "object" && data !== null && "allowResponse" in data && data.allowResponse === true;
}

export async function getStudentDataExport(studentId: string, isTestData: boolean) {
  const [student] = await User.find({
    _id: studentId,
    role: "ALUNO",
    status: "aprovado",
    deletedAt: null,
    ...getTestDataFilter(isTestData),
  })
    .limit(1)
    .select("fullName email age birthDate gender modality school address guardian classIds termsAcceptedAt termsVersion")
    .lean();
  if (!student) return null;

  const classIds = student.classIds ?? [];
  const classIdFilter = { $in: classIds };
  const dataScope = getTestDataFilter(isTestData);
  const [classes, tasks, materials, lessonPlans, events, evaluations, attendance, notifications] = await Promise.all([
    Class.find({ _id: classIdFilter, ...dataScope })
      .select("name modality")
      .sort({ name: 1 })
      .lean(),
    Task.find({ classId: classIdFilter, ...dataScope })
      .select("title description content classId dueDate createdAt data")
      .populate({ path: "classId", select: "name modality" })
      .sort({ dueDate: 1, createdAt: -1 })
      .limit(250)
      .lean(),
    Material.find({ classId: classIdFilter, ...dataScope })
      .select("title description content type classId createdAt")
      .populate({ path: "classId", select: "name modality" })
      .sort({ createdAt: -1 })
      .limit(250)
      .lean(),
    LessonPlan.find({ classId: classIdFilter, ...dataScope })
      .select("title description content date classId createdAt")
      .populate({ path: "classId", select: "name modality" })
      .sort({ date: -1, createdAt: -1 })
      .limit(250)
      .lean(),
    Event.find({ classId: classIdFilter, ...dataScope })
      .select("title description date classId createdAt")
      .populate({ path: "classId", select: "name modality" })
      .sort({ date: 1, createdAt: -1 })
      .limit(250)
      .lean(),
    Evaluation.find({ classId: classIdFilter, studentId: student._id, ...dataScope })
      .select("title description date grade feedback classId createdAt")
      .populate({ path: "classId", select: "name modality" })
      .sort({ date: -1, createdAt: -1 })
      .limit(250)
      .lean(),
    Attendance.find({ classId: classIdFilter, studentId: student._id, ...dataScope })
      .select("date present classId")
      .populate({ path: "classId", select: "name modality" })
      .sort({ date: -1 })
      .limit(1000)
      .lean(),
    Notification.find({ studentId: student._id, classId: classIdFilter, ...dataScope })
      .select("title description classId data createdAt")
      .populate({ path: "classId", select: "name modality" })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean(),
  ]);
  const responses = tasks.length
    ? await TaskResponse.find({
      taskId: { $in: tasks.map((task) => task._id) },
      studentId: student._id,
      classId: classIdFilter,
      ...dataScope,
    })
      .select("taskId content grade feedback createdAt")
      .sort({ createdAt: -1 })
      .lean()
    : [];
  const lgpdRequests = await LGPDRequest.find({ userId: student._id, ...dataScope })
    .select("type description status responseNote createdAt updatedAt reviewedAt")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  const responseByTask = new Map<string, (typeof responses)[number]>();
  for (const taskResponse of responses) {
    const taskId = String(taskResponse.taskId);
    if (!responseByTask.has(taskId)) responseByTask.set(taskId, taskResponse);
  }

  return {
    student: {
      _id: student._id,
      fullName: student.fullName,
      email: student.email,
      age: student.age,
      birthDate: student.birthDate,
      gender: student.gender,
      modality: student.modality,
      school: student.school,
      address: student.address,
      guardian: student.guardian,
      termsAcceptedAt: student.termsAcceptedAt,
      termsVersion: student.termsVersion,
    },
    classes,
    tasks: tasks.map((task) => ({
      ...task,
      allowResponse: taskAllowsResponse(task.data),
      response: responseByTask.get(String(task._id)) ?? null,
    })),
    materials,
    lessonPlans,
    events,
    evaluations,
    attendance,
    notifications,
    lgpdRequests,
  };
}
