import { model, Schema, Types } from 'mongoose';

export type UserRole = 'admin' | 'teacher' | 'student';
export type EnrollmentStatus = 'pending' | 'approved' | 'rejected';

const timestamps = { timestamps: true, versionKey: false as const };

const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'teacher', 'student'], required: true },
  isActive: { type: Boolean, default: true },
  refreshTokenHash: { type: String, select: false },
  teacherPermissions: {
    type: [String],
    default: ['students:read', 'students:write', 'attendance:write', 'assignments:read', 'assignments:write', 'materials:write', 'notifications:write', 'events:write', 'evaluations:write', 'social:read', 'social:write', 'exports:read']
  }
}, timestamps);

const studentSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  fullName: { type: String, required: true, trim: true, index: true },
  birthDate: { type: Date, required: true },
  age: { type: Number, required: true, min: 0, max: 120 },
  sex: { type: String, enum: ['Feminino', 'Masculino', 'Outro', 'Prefiro não informar'], required: true },
  modality: { type: String, required: true, trim: true, default: 'Futsal', index: true },
  school: { type: String, required: true, trim: true },
  address: {
    neighborhood: { type: String, required: true, default: 'Alto da Mangueira' },
    city: { type: String, required: true, default: 'Maracanaú' },
    street: { type: String, required: true },
    number: { type: String, required: true },
    complement: { type: String }
  },
  guardian: {
    name: { type: String, required: true },
    phone: { type: String, required: true }
  },
  studentPhotoKey: { type: String, required: true },
  signedFormPdfKey: { type: String, required: true },
  enrollmentStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  rejectionReason: { type: String },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: { type: Date },
  termsAcceptedAt: { type: Date, required: true },
  termsAcceptedIp: { type: String, required: true },
  termsVersion: { type: String, required: true },
  classIds: [{ type: Schema.Types.ObjectId, ref: 'SportsClass' }]
}, timestamps);
studentSchema.index({ fullName: 'text', modality: 1, enrollmentStatus: 1 });

const sportsClassSchema = new Schema({
  name: { type: String, required: true, trim: true },
  modality: { type: String, required: true, default: 'Futsal' },
  teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  studentIds: [{ type: Schema.Types.ObjectId, ref: 'Student' }],
  schedule: [{ dayOfWeek: { type: Number, min: 0, max: 6 }, startTime: String, endTime: String }],
  location: { type: String, trim: true },
  isActive: { type: Boolean, default: true }
}, timestamps);

const attendanceSchema = new Schema({
  classId: { type: Schema.Types.ObjectId, ref: 'SportsClass', required: true, index: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  date: { type: Date, required: true, index: true },
  status: { type: String, enum: ['present', 'absent', 'excused'], required: true },
  note: String,
  recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, timestamps);
attendanceSchema.index({ classId: 1, studentId: 1, date: 1 }, { unique: true });

const assignmentSchema = new Schema({
  classId: { type: Schema.Types.ObjectId, ref: 'SportsClass', required: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  responseType: { type: String, enum: ['text', 'none'], default: 'text' },
  dueAt: Date
}, timestamps);

const submissionSchema = new Schema({
  assignmentId: { type: Schema.Types.ObjectId, ref: 'Assignment', required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  response: { type: String, required: true },
  submittedAt: { type: Date, default: Date.now }
}, timestamps);
submissionSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true });

const materialSchema = new Schema({
  classId: { type: Schema.Types.ObjectId, ref: 'SportsClass', required: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  body: { type: String },
  url: { type: String },
  fileKey: { type: String }
}, timestamps);

const lessonPlanSchema = new Schema({
  classId: { type: Schema.Types.ObjectId, ref: 'SportsClass', required: true, index: true },
  teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  objectives: { type: String, required: true },
  activities: { type: String, required: true },
  notes: String
}, timestamps);

const notificationSchema = new Schema({
  recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  classId: { type: Schema.Types.ObjectId, ref: 'SportsClass' },
  senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  readAt: Date
}, timestamps);

const eventSchema = new Schema({
  classId: { type: Schema.Types.ObjectId, ref: 'SportsClass', required: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  startsAt: { type: Date, required: true },
  location: String
}, timestamps);

const evaluationSchema = new Schema({
  classId: { type: Schema.Types.ObjectId, ref: 'SportsClass', required: true, index: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  score: { type: Number, required: true, min: 0, max: 10 },
  feedback: { type: String, required: true },
  evaluatedAt: { type: Date, default: Date.now }
}, timestamps);

const socialPostSchema = new Schema({
  classId: { type: Schema.Types.ObjectId, ref: 'SportsClass', required: true, index: true },
  authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, maxlength: 2000 },
  link: { type: String },
  likedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }]
}, timestamps);

const socialCommentSchema = new Schema({
  postId: { type: Schema.Types.ObjectId, ref: 'SocialPost', required: true, index: true },
  authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, maxlength: 1000 }
}, timestamps);

const auditLogSchema = new Schema({
  actorId: { type: Schema.Types.ObjectId, ref: 'User' },
  action: { type: String, required: true, index: true },
  resource: { type: String, required: true },
  resourceId: { type: Schema.Types.ObjectId },
  metadata: { type: Schema.Types.Mixed },
  ip: String
}, { ...timestamps, versionKey: false });
auditLogSchema.index({ createdAt: -1 });

export const User = model('User', userSchema);
export const Student = model('Student', studentSchema);
export const SportsClass = model('SportsClass', sportsClassSchema);
export const Attendance = model('Attendance', attendanceSchema);
export const Assignment = model('Assignment', assignmentSchema);
export const AssignmentSubmission = model('AssignmentSubmission', submissionSchema);
export const Material = model('Material', materialSchema);
export const LessonPlan = model('LessonPlan', lessonPlanSchema);
export const Notification = model('Notification', notificationSchema);
export const SportsEvent = model('SportsEvent', eventSchema);
export const Evaluation = model('Evaluation', evaluationSchema);
export const SocialPost = model('SocialPost', socialPostSchema);
export const SocialComment = model('SocialComment', socialCommentSchema);
export const AuditLog = model('AuditLog', auditLogSchema);

export function isObjectId(value: string): boolean {
  return Types.ObjectId.isValid(value);
}
