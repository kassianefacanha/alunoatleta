import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  AddRounded,
  ArticleRounded,
  AssignmentRounded,
  AssessmentRounded,
  CalendarMonthRounded,
  CheckCircleRounded,
  ClassRounded,
  DashboardRounded,
  DeleteOutlineRounded,
  EditOutlined,
  EventRounded,
  FactCheckRounded,
  GroupsRounded,
  KeyRounded,
  LogoutRounded,
  MenuRounded,
  NotificationsNoneRounded,
  NotificationsRounded,
  PersonOutlineRounded,
  SearchRounded,
  SportsSoccerRounded,
  SyncRounded,
  VisibilityOutlined,
} from "@mui/icons-material";
import { Alert, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, InputLabel, MenuItem, Pagination, Select, TextField } from "@mui/material";
import { Link, useNavigate } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";
import { adminRequest } from "../services/admin";
import { getClassRequirements } from "../lib/classEligibility";

interface ClassRow {
  _id: string;
  name: string;
  modality: string;
  enrollmentLimit?: number;
  enrolledCount?: number;
  registrationStartsAt?: string;
  registrationEndsAt?: string;
  requiresNeighborhoodSchool?: boolean;
  minimumAge?: number;
  maximumAge?: number;
  otherEligibilityRequirements?: string[];
  requirements?: string[];
}

interface ModalityOption {
  name: string;
}

interface StudentRow {
  _id: string;
  fullName: string;
  email: string;
  age?: number;
  modality?: string;
  status?: "pendente" | "aprovado" | "recusado";
}

interface StudentDetails extends StudentRow {
  createdAt: string;
  birthDate?: string;
  gender?: string;
  school?: string;
  address?: { neighborhood?: string; city?: string; street?: string; number?: string; complement?: string };
  guardian?: { name?: string; phone?: string };
  classes: Array<{ id: string; name: string; requirements: string[] }>;
  documents: { photoUrl: string | null; signedFormUrl: string | null };
  rejectionReason?: string;
  rejectionReasons?: string[];
  rejectionOtherReason?: string;
}

type TeacherSection = "overview" | "classes" | "students" | "attendance" | "tasks" | "materials" | "lesson-plans" | "notifications" | "events" | "evaluations" | "reports" | "profile";
type WorkResource = Exclude<TeacherSection, "overview" | "classes" | "students" | "attendance" | "reports" | "profile">;

interface TeacherClassSummary {
  _id: string;
  name: string;
  modality: string;
}

interface TeacherDashboardData {
  stats: {
    students: number;
    pendingRegistrations: number;
    attendanceRecords: number;
    attendanceRate: number | null;
    tasksToReview: number;
    classes: number;
  };
  classes: TeacherClassSummary[];
  attendanceByClass: Array<{ id: string; name: string; rate: number | null; records: number }>;
  pendingStudents: StudentRow[];
  upcomingEvents: WorkRecord[];
  upcomingTasks: WorkRecord[];
}

interface WorkRecord {
  _id: string;
  title: string;
  description?: string;
  content?: string;
  type?: string;
  classId?: string | { _id: string; name: string };
  studentId?: string | { _id: string; fullName: string };
  taskId?: string | { _id: string; title: string };
  date?: string;
  dueDate?: string;
  present?: boolean;
  grade?: number;
  feedback?: string;
  createdAt?: string;
  data?: { allowResponse?: boolean };
}

interface AttendanceStudent {
  id: string;
  fullName: string;
  email: string;
  present: boolean;
  marked: boolean;
}

const sectionInfo: Record<TeacherSection, { title: string; description: string }> = {
  overview: { title: "Visão geral", description: "Acompanhe suas turmas, alunos e atividades." },
  classes: { title: "Minhas turmas", description: "Consulte suas turmas e mantenha os requisitos atualizados." },
  students: { title: "Meus alunos", description: "Consulte e analise inscrições dos alunos das suas turmas." },
  attendance: { title: "Presenças", description: "Faça a chamada e acompanhe o histórico de frequência." },
  tasks: { title: "Tarefas", description: "Crie atividades e avalie as respostas recebidas." },
  materials: { title: "Materiais", description: "Compartilhe links e conteúdos de apoio com suas turmas." },
  "lesson-plans": { title: "Planos de aula", description: "Organize e consulte seus planos de aula." },
  notifications: { title: "Notificações", description: "Envie comunicados para um aluno ou para toda a turma." },
  events: { title: "Eventos", description: "Organize os próximos eventos das suas turmas." },
  evaluations: { title: "Avaliações", description: "Registre notas e feedback dos seus alunos." },
  reports: { title: "Relatórios", description: "Exporte dados de frequência, desempenho e tarefas." },
  profile: { title: "Meu perfil", description: "Atualize seus dados pessoais e altere sua senha." },
};

const workSections: WorkResource[] = ["tasks", "materials", "lesson-plans", "notifications", "events", "evaluations"];

interface ClassForm {
  name: string;
  modality: string;
  enrollmentLimit: string;
  registrationStartsAt: string;
  registrationEndsAt: string;
  requirements: string[];
}

function dateTimeLocalValue(value?: string) {
  const date = value ? new Date(value) : new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function createEmptyClassForm(modality = ""): ClassForm {
  return {
    name: "",
    modality,
    enrollmentLimit: "30",
    registrationStartsAt: dateTimeLocalValue(),
    registrationEndsAt: dateTimeLocalValue(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()),
    requirements: [],
  };
}

function getTokenRole(token: string): string | undefined {
  try {
    const payload = token.split(".")[1];
    if (!payload) return undefined;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(normalized)).role as string | undefined;
  } catch {
    return undefined;
  }
}

export function TeacherClassesPage() {
  const token = localStorage.getItem("aluno-atleta-token");
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [modalities, setModalities] = useState<ModalityOption[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [studentTotal, setStudentTotal] = useState(0);
  const [studentPage, setStudentPage] = useState(1);
  const [activeSection, setActiveSection] = useState<TeacherSection>("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dashboard, setDashboard] = useState<TeacherDashboardData | null>(null);
  const [workRecords, setWorkRecords] = useState<WorkRecord[]>([]);
  const [taskResponses, setTaskResponses] = useState<WorkRecord[]>([]);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().slice(0, 10));
  const [attendanceClassId, setAttendanceClassId] = useState("");
  const [attendanceStudents, setAttendanceStudents] = useState<AttendanceStudent[]>([]);
  const [attendanceHistory, setAttendanceHistory] = useState<Array<{ date: string; total: number; present: number; rate: number }>>([]);
  const [profile, setProfile] = useState({ fullName: "", email: "" });
  const [profilePassword, setProfilePassword] = useState({ currentPassword: "", newPassword: "" });
  const [workEditor, setWorkEditor] = useState<WorkRecord | null | undefined>(undefined);
  const [workForm, setWorkForm] = useState({ title: "", description: "", content: "", type: "", classId: "", studentId: "", date: "", dueDate: "", grade: "", feedback: "", allowPlatformResponse: false });
  const [notificationForm, setNotificationForm] = useState({ title: "", description: "", classId: "", studentId: "" });
  const [classStudents, setClassStudents] = useState<StudentRow[]>([]);
  const [selectedResponse, setSelectedResponse] = useState<WorkRecord | null>(null);
  const [gradeForm, setGradeForm] = useState({ grade: "", feedback: "" });
  const [reportDates, setReportDates] = useState({ from: "", to: "" });
  const [reportData, setReportData] = useState<{ attendance: WorkRecord[]; evaluations: WorkRecord[]; tasks: WorkRecord[]; responses: WorkRecord[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editor, setEditor] = useState<ClassRow | null | undefined>(undefined);
  const [form, setForm] = useState<ClassForm>(() => createEmptyClassForm());
  const [classDetails, setClassDetails] = useState<ClassRow | null>(null);
  const [workDetails, setWorkDetails] = useState<{ section: WorkResource; record: WorkRecord } | null>(null);
  const [selectedTaskResponsesTarget, setSelectedTaskResponsesTarget] = useState<WorkRecord | null>(null);
  const [studentTarget, setStudentTarget] = useState<StudentDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewEnabled, setReviewEnabled] = useState(false);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [otherReason, setOtherReason] = useState("");

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [classRows, modalityRows, studentResult, dashboardResult] = await Promise.all([
        adminRequest<ClassRow[]>("/teacher/classes", token),
        fetch(`${import.meta.env.VITE_API_URL ?? "/api/v1"}/public/modalities`)
          .then(async (response) => {
            if (!response.ok) throw new Error("Não foi possível carregar as modalidades.");
            return response.json() as Promise<Array<ModalityOption & { id: string }>>;
          }),
        adminRequest<{ rows: StudentRow[]; total: number }>(`/students?page=${studentPage}&pageSize=20`, token),
        adminRequest<TeacherDashboardData>("/teacher/dashboard", token),
      ]);
      setClasses(classRows);
      setModalities(modalityRows);
      setStudents(studentResult.rows);
      setStudentTotal(studentResult.total);
      setDashboard(dashboardResult);
      if (!attendanceClassId && classRows.length) setAttendanceClassId(classRows[0]._id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar suas turmas.");
    } finally {
      setLoading(false);
    }
  }, [attendanceClassId, studentPage, token]);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    const classId = activeSection === "notifications"
      ? notificationForm.classId
      : activeSection === "evaluations" && workEditor !== undefined
        ? workForm.classId
        : "";
    if (!token || !classId) {
      setClassStudents([]);
      return;
    }
    let active = true;
    adminRequest<StudentRow[]>(`/teacher/class-students?classId=${encodeURIComponent(classId)}`, token)
      .then((rows) => { if (active) setClassStudents(rows); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Não foi possível carregar os alunos da turma.");
      });
    return () => { active = false; };
  }, [activeSection, notificationForm.classId, token, workEditor, workForm.classId]);

  const loadSectionData = useCallback(async () => {
    if (!token) return;
    setError("");
    try {
      if (workSections.includes(activeSection as WorkResource)) {
        const [records, responses] = await Promise.all([
          adminRequest<WorkRecord[]>(`/teacher/work/${activeSection}`, token),
          activeSection === "tasks" ? adminRequest<WorkRecord[]>("/teacher/task-responses", token) : Promise.resolve([]),
        ]);
        setWorkRecords(records);
        setTaskResponses(responses);
      } else if (activeSection === "attendance" && attendanceClassId) {
        const [roster, history] = await Promise.all([
          adminRequest<{ students: AttendanceStudent[] }>(`/teacher/attendance?classId=${encodeURIComponent(attendanceClassId)}&date=${attendanceDate}`, token),
          adminRequest<typeof attendanceHistory>(`/teacher/attendance/history?classId=${encodeURIComponent(attendanceClassId)}`, token),
        ]);
        setAttendanceStudents(roster.students);
        setAttendanceHistory(history);
      } else if (activeSection === "profile") {
        const result = await adminRequest<{ fullName: string; email: string }>("/teacher/profile", token);
        setProfile({ fullName: result.fullName, email: result.email });
      } else if (activeSection === "reports") {
        const query = new URLSearchParams();
        if (reportDates.from) query.set("from", reportDates.from);
        if (reportDates.to) query.set("to", reportDates.to);
        setReportData(await adminRequest(`/teacher/reports${query.size ? `?${query}` : ""}`, token));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar esta área.");
    }
  }, [activeSection, attendanceClassId, attendanceDate, reportDates, token]);

  useEffect(() => {
    if (activeSection !== "overview" && activeSection !== "classes" && activeSection !== "students") {
      void loadSectionData();
    }
  }, [activeSection, loadSectionData]);

  function changeSection(section: TeacherSection) {
    setActiveSection(section);
    setMobileMenuOpen(false);
    setError("");
    setSuccess("");
  }

  function openWorkEditor(record?: WorkRecord) {
    const recordClassId = typeof record?.classId === "string" ? record.classId : record?.classId?._id;
    const studentId = typeof record?.studentId === "string" ? record.studentId : record?.studentId?._id;
    setWorkForm({
      title: record?.title ?? "",
      description: record?.description ?? "",
      content: record?.content ?? "",
      type: record?.type ?? "",
      classId: recordClassId ?? classes[0]?._id ?? "",
      studentId: studentId ?? "",
      date: record?.date ? new Date(record.date).toISOString().slice(0, 16) : "",
      dueDate: record?.dueDate ? new Date(record.dueDate).toISOString().slice(0, 16) : "",
      grade: record?.grade === undefined ? "" : String(record.grade),
      feedback: record?.feedback ?? "",
      allowPlatformResponse: false,
    });
    setWorkEditor(record ?? null);
    setError("");
  }

  function openWorkDetails(record: WorkRecord, resource: WorkResource = activeSection as WorkResource) {
    setWorkDetails({ section: resource, record });
  }

  async function saveWork(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !workSections.includes(activeSection as WorkResource)) return;
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...workForm,
        ...(workForm.date ? { date: new Date(workForm.date).toISOString() } : { date: undefined }),
        ...(workForm.dueDate ? { dueDate: new Date(workForm.dueDate).toISOString() } : { dueDate: undefined }),
        ...(workForm.grade ? { grade: Number(workForm.grade) } : { grade: undefined }),
        ...(activeSection !== "evaluations" ? { studentId: undefined } : {}),
      };
      await adminRequest(
        `/teacher/work/${activeSection}${workEditor ? `/${encodeURIComponent(workEditor._id)}` : ""}`,
        token,
        workEditor ? "PATCH" : "POST",
        payload,
      );
      setWorkEditor(undefined);
      setSuccess(workEditor ? "Alterações salvas." : "Cadastro criado.");
      await loadSectionData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteWork(record: WorkRecord) {
    if (!token || !window.confirm(`Deseja excluir “${record.title}”?`)) return;
    setError("");
    try {
      await adminRequest(`/teacher/work/${activeSection}/${encodeURIComponent(record._id)}`, token, "DELETE");
      setSuccess("Registro excluído.");
      await loadSectionData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível excluir o registro.");
    }
  }

  async function loadAttendanceForDate(nextDate: string, nextClassId = attendanceClassId) {
    if (!token || !nextClassId) return;
    setAttendanceDate(nextDate);
    setAttendanceClassId(nextClassId);
    try {
      const roster = await adminRequest<{ students: AttendanceStudent[] }>(
        `/teacher/attendance?classId=${encodeURIComponent(nextClassId)}&date=${nextDate}`,
        token,
      );
      setAttendanceStudents(roster.students);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar a chamada.");
    }
  }

  async function saveAttendance() {
    if (!token || !attendanceClassId || !attendanceStudents.length) return;
    setSaving(true);
    setError("");
    try {
      await adminRequest("/teacher/attendance", token, "POST", {
        classId: attendanceClassId,
        date: attendanceDate,
        records: attendanceStudents.map(({ id, present }) => ({ studentId: id, present })),
      });
      setSuccess("Chamada salva com sucesso.");
      await loadSectionData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar a chamada.");
    } finally {
      setSaving(false);
    }
  }

  async function sendNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    setError("");
    try {
      const result = await adminRequest<{ sent: number }>("/teacher/notifications", token, "POST", {
        ...notificationForm,
        studentIds: notificationForm.studentId ? [notificationForm.studentId] : [],
      });
      setSuccess(`Notificação enviada para ${result.sent} ${result.sent === 1 ? "aluno" : "alunos"}.`);
      setNotificationForm({ title: "", description: "", classId: classes[0]?._id ?? "", studentId: "" });
      await loadSectionData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível enviar a notificação.");
    } finally {
      setSaving(false);
    }
  }

  async function gradeTaskResponse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedResponse) return;
    setSaving(true);
    setError("");
    try {
      await adminRequest(`/teacher/task-responses/${encodeURIComponent(selectedResponse._id)}/grade`, token, "PATCH", {
        grade: Number(gradeForm.grade),
        feedback: gradeForm.feedback,
      });
      setSelectedResponse(null);
      setSuccess("Resposta avaliada.");
      await loadSectionData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível avaliar a resposta.");
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await adminRequest<{ fullName: string; email: string }>("/teacher/profile", token, "PATCH", profile);
      setProfile(updated);
      localStorage.setItem("aluno-atleta-name", updated.fullName);
      setSuccess("Perfil atualizado.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível atualizar o perfil.");
    } finally {
      setSaving(false);
    }
  }

  async function changeTeacherPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    setError("");
    try {
      await adminRequest("/auth/password", token, "POST", profilePassword);
      setProfilePassword({ currentPassword: "", newPassword: "" });
      setSuccess("Senha atualizada. Entre novamente para continuar.");
      signOut();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível alterar a senha.");
    } finally {
      setSaving(false);
    }
  }

  async function exportReports() {
    if (!reportData) return;
    const rows = [
      ...reportData.attendance.map((row) => ({ Tipo: "Presença", Data: row.date, Turma: getRelatedName(row.classId), Aluno: getRelatedName(row.studentId), Resultado: row.present ? "Presente" : "Ausente" })),
      ...reportData.evaluations.map((row) => ({ Tipo: "Avaliação", Data: row.date, Turma: getRelatedName(row.classId), Aluno: getRelatedName(row.studentId), Resultado: row.grade ?? "", Feedback: row.feedback ?? "" })),
      ...reportData.tasks.map((row) => ({ Tipo: "Tarefa", Data: row.dueDate ?? "", Turma: getRelatedName(row.classId), Título: row.title })),
      ...reportData.responses.map((row) => ({ Tipo: "Resposta", Data: row.createdAt ?? "", Turma: getRelatedName(row.classId), Aluno: getRelatedName(row.studentId), Tarefa: getRelatedName(row.taskId), Nota: row.grade ?? "", Feedback: row.feedback ?? "" })),
    ];
    const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const csv = [headers, ...rows.map((row) => headers.map((header) => String(row[header as keyof typeof row] ?? "")))]
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "relatorio-professor.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function openEditor(sportsClass?: ClassRow) {
    setForm(sportsClass ? {
      name: sportsClass.name,
      modality: sportsClass.modality,
      enrollmentLimit: String(sportsClass.enrollmentLimit ?? 30),
      registrationStartsAt: dateTimeLocalValue(sportsClass.registrationStartsAt),
      registrationEndsAt: dateTimeLocalValue(sportsClass.registrationEndsAt),
      requirements: getClassRequirements(sportsClass),
    } : createEmptyClassForm(modalities[0]?.name ?? ""));
    setEditor(sportsClass ?? null);
    setError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    setError("");
    setSuccess("");
    const payload = {
      ...form,
      enrollmentLimit: Number(form.enrollmentLimit),
      registrationStartsAt: new Date(form.registrationStartsAt).toISOString(),
      registrationEndsAt: new Date(form.registrationEndsAt).toISOString(),
      requirements: form.requirements.map((item) => item.trim()).filter(Boolean),
    };
    try {
      await adminRequest(
        editor ? `/teacher/classes/${encodeURIComponent(editor._id)}` : "/teacher/classes",
        token,
        editor ? "PATCH" : "POST",
        payload,
      );
      setEditor(undefined);
      setSuccess(editor ? "Requisitos da turma atualizados." : "Turma criada.");
      await loadData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar a turma.");
    } finally {
      setSaving(false);
    }
  }

  async function openStudent(student: StudentRow, canReview: boolean) {
    if (!token) return;
    setDetailLoading(true);
    setStudentTarget(null);
    setReviewEnabled(canReview);
    setSelectedReasons([]);
    setOtherReason("");
    setError("");
    try {
      setStudentTarget(await adminRequest<StudentDetails>(`/students/${encodeURIComponent(student._id)}/details`, token));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar os dados do aluno.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function reviewStudent(status: "aprovado" | "recusado") {
    if (!token || !studentTarget) return;
    setSaving(true);
    setError("");
    try {
      await adminRequest(`/students/${encodeURIComponent(studentTarget._id)}/review`, token, "PATCH", {
        status,
        ...(status === "recusado" ? { rejectionReasons: selectedReasons, otherReason: otherReason.trim() } : {}),
      });
      setStudentTarget(null);
      await loadData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível analisar a inscrição.");
    } finally {
      setSaving(false);
    }
  }

  function signOut() {
    localStorage.removeItem("aluno-atleta-token");
    localStorage.removeItem("aluno-atleta-role");
    localStorage.removeItem("aluno-atleta-name");
    navigate("/login", { replace: true });
  }

  if (!token || getTokenRole(token) !== "PROFESSOR") {
    return <main className="admin-access-denied"><section><GroupsRounded /><h1>Gestão de turmas</h1><p>Entre com uma conta de professor para continuar.</p><Button component={Link} to="/login" variant="contained">Entrar</Button></section></main>;
  }

  const navItems: Array<{ key: TeacherSection; label: string; Icon: typeof DashboardRounded }> = [
    { key: "overview", label: "Visão geral", Icon: DashboardRounded },
    { key: "students", label: "Meus alunos", Icon: GroupsRounded },
    { key: "classes", label: "Minhas turmas", Icon: ClassRounded },
    { key: "attendance", label: "Presenças", Icon: FactCheckRounded },
    { key: "tasks", label: "Tarefas", Icon: AssignmentRounded },
    { key: "materials", label: "Materiais", Icon: ArticleRounded },
    { key: "lesson-plans", label: "Planos de aula", Icon: CalendarMonthRounded },
    { key: "notifications", label: "Notificações", Icon: NotificationsRounded },
    { key: "events", label: "Eventos", Icon: EventRounded },
    { key: "evaluations", label: "Avaliações", Icon: AssessmentRounded },
    { key: "reports", label: "Relatórios", Icon: SearchRounded },
    { key: "profile", label: "Meu perfil", Icon: PersonOutlineRounded },
  ];
  const section = sectionInfo[activeSection];
  const shownRecords = workRecords;
  const selectedTaskResponses = selectedTaskResponsesTarget
    ? taskResponses.filter((item) => getRelatedId(item.taskId) === selectedTaskResponsesTarget._id)
    : [];
  const rowClassName = (record: WorkRecord) => getRelatedName(record.classId) || "Turma";

  return (
    <main className="admin-shell teacher-dashboard-shell">
      {mobileMenuOpen && <button className="admin-sidebar-scrim" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)} />}
      <aside className={`admin-sidebar${mobileMenuOpen ? " is-open" : ""}`}>
        <Link to="/" className="admin-brand" aria-label="Voltar ao site">
          <BrandLogo className="brand-logo admin-logo" /><span>ÁREA <b>PROFESSOR</b></span>
        </Link>
        <span className="admin-nav-label">MINHA ÁREA</span>
        <nav className="admin-navigation" aria-label="Navegação do professor">
          {navItems.slice(0, 3).map(({ key, label, Icon }) => (
            <button key={key} className={activeSection === key ? "active" : ""} onClick={() => changeSection(key)}>
              <Icon />{label}
              {key === "students" && dashboard?.stats.pendingRegistrations ? <span className="admin-nav-count">{dashboard.stats.pendingRegistrations}</span> : null}
            </button>
          ))}
        </nav>
        <span className="admin-nav-label admin-nav-label-secondary">ENSINO</span>
        <nav className="admin-navigation admin-navigation-muted" aria-label="Ferramentas de ensino">
          {navItems.slice(3, 10).map(({ key, label, Icon }) => (
            <button key={key} className={activeSection === key ? "active" : ""} onClick={() => changeSection(key)}>
              <Icon />{label}
              {key === "tasks" && dashboard?.stats.tasksToReview ? <span className="admin-nav-count">{dashboard.stats.tasksToReview}</span> : null}
            </button>
          ))}
        </nav>
        <span className="admin-nav-label admin-nav-label-secondary">CONTA</span>
        <nav className="admin-navigation admin-navigation-muted">
          {navItems.slice(10).map(({ key, label, Icon }) => (
            <button key={key} className={activeSection === key ? "active" : ""} onClick={() => changeSection(key)}><Icon />{label}</button>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <div className="admin-security-note"><CheckCircleRounded /><span><b>Área do professor</b><small>Acesso às suas turmas</small></span></div>
          <button className="admin-signout" onClick={signOut}><LogoutRounded /> Sair</button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <button className="admin-mobile-menu" aria-label="Abrir menu" onClick={() => setMobileMenuOpen(true)}><MenuRounded /></button>
          <div className="admin-breadcrumb"><span>Professor</span><b>/</b><strong>{section.title}</strong></div>
          <div className="admin-topbar-actions">
            <Link to="/" className="admin-public-link">Ver site <SyncRounded /></Link>
            <button className="admin-icon-button" aria-label="Ver inscrições pendentes" onClick={() => changeSection("students")}>
              <NotificationsNoneRounded />
              {dashboard?.stats.pendingRegistrations ? <span className="admin-notification-count">{dashboard.stats.pendingRegistrations}</span> : null}
            </button>
            <span className="admin-avatar" aria-hidden="true">{(profile.fullName || localStorage.getItem("aluno-atleta-name") || "P").slice(0, 1).toUpperCase()}</span>
          </div>
        </header>

        <div className="admin-content">
          <div className="admin-welcome">
            <div><span className="admin-eyebrow">PAINEL DO PROFESSOR</span><h1>{activeSection === "overview" ? `Olá, ${(localStorage.getItem("aluno-atleta-name") || "Professor").split(" ")[0]}!` : section.title}</h1><p>{section.description}</p></div>
            <Button className="admin-refresh" variant="outlined" startIcon={<SyncRounded />} onClick={() => activeSection === "overview" || activeSection === "classes" || activeSection === "students" ? void loadData() : void loadSectionData()}>Atualizar</Button>
          </div>
          {error && <Alert severity="error" className="admin-alert">{error}</Alert>}
          {success && <Alert severity="success" className="admin-alert" onClose={() => setSuccess("")}>{success}</Alert>}
          {(loading && activeSection === "overview") ? <div className="admin-loading"><CircularProgress size={28} /><span>Carregando seu painel...</span></div> : (
            <>
              {activeSection === "overview" && dashboard && (
                <>
                  <section className="admin-stats-grid teacher-stats-grid">
                    <StatCard Icon={GroupsRounded} label="Meus alunos" value={dashboard.stats.students} detail={`${dashboard.stats.classes} turmas vinculadas`} tone="total" />
                    <StatCard Icon={FactCheckRounded} label="Presenças no mês" value={dashboard.stats.attendanceRecords} detail={dashboard.stats.attendanceRate === null ? "Nenhuma chamada registrada" : `${dashboard.stats.attendanceRate}% de frequência`} tone="approved" />
                    <StatCard Icon={AssignmentRounded} label="Tarefas para corrigir" value={dashboard.stats.tasksToReview} detail="Respostas aguardando avaliação" tone="pending" />
                    <StatCard Icon={PersonOutlineRounded} label="Inscrições pendentes" value={dashboard.stats.pendingRegistrations} detail="Alunos das suas turmas" tone="rejected" />
                  </section>
                  <section className="admin-panel">
                    <div className="admin-panel-heading"><div><span className="admin-eyebrow">FREQUÊNCIA</span><h2>Frequência por turma</h2><p>Presenças registradas neste mês.</p></div><Button onClick={() => changeSection("attendance")} endIcon={<SyncRounded />}>Fazer chamada</Button></div>
                    <div className="teacher-frequency-list">
                      {dashboard.attendanceByClass.map((item) => <div className="teacher-frequency-row" key={item.id}><span>{item.name}<small>{item.records} registros</small></span><div><i style={{ width: `${item.rate ?? 0}%` }} /></div><b>{item.rate === null ? "—" : `${item.rate}%`}</b></div>)}
                      {!dashboard.attendanceByClass.length && <div className="admin-management-empty"><GroupsRounded /><span>Suas turmas aparecerão aqui.</span></div>}
                    </div>
                  </section>
                  <section className="admin-panel">
                    <div className="admin-panel-heading"><div><span className="admin-eyebrow">INSCRIÇÕES</span><h2>Alunos aguardando análise</h2><p>Inscrições vinculadas às suas turmas.</p></div><Button onClick={() => changeSection("students")} endIcon={<SyncRounded />}>Ver alunos</Button></div>
                    {dashboard.pendingStudents.map((student) => <article className="admin-management-row" key={student._id}><span className="admin-management-icon"><PersonOutlineRounded /></span><span className="admin-management-identity"><b>{student.fullName}</b><small>{student.email}</small></span><span className="admin-management-actions"><button aria-label={`Ver ${student.fullName}`} onClick={() => void openStudent(student, true)}><VisibilityOutlined /></button><Button size="small" variant="outlined" onClick={() => void openStudent(student, true)}>Analisar</Button></span></article>)}
                    {!dashboard.pendingStudents.length && <div className="admin-management-empty"><CheckCircleRounded /><span>Sem inscrições pendentes.</span></div>}
                  </section>
                  <section className="teacher-dashboard-columns">
                    <div className="admin-panel"><div className="admin-panel-heading"><div><h2>Próximos eventos</h2><p>Agenda das suas turmas.</p></div><Button onClick={() => changeSection("events")}>Ver todos</Button></div>{dashboard.upcomingEvents.map((item) => <div className="teacher-upcoming-item" key={item._id}><EventRounded /><span><b>{item.title}</b><small>{formatTeacherDate(item.date)} · {rowClassName(item)}</small></span><button aria-label={`Ver evento ${item.title}`} onClick={() => openWorkDetails(item, "events")}><VisibilityOutlined /></button></div>)}{!dashboard.upcomingEvents.length && <p className="teacher-empty-copy">Nenhum evento próximo cadastrado.</p>}</div>
                    <div className="admin-panel"><div className="admin-panel-heading"><div><h2>Próximas tarefas</h2><p>Prazos das suas atividades.</p></div><Button onClick={() => changeSection("tasks")}>Ver tarefas</Button></div>{dashboard.upcomingTasks.map((item) => <div className="teacher-upcoming-item" key={item._id}><AssignmentRounded /><span><b>{item.title}</b><small>{formatTeacherDate(item.dueDate)} · {rowClassName(item)}</small></span><button aria-label={`Ver tarefa ${item.title}`} onClick={() => openWorkDetails(item, "tasks")}><VisibilityOutlined /></button></div>)}{!dashboard.upcomingTasks.length && <p className="teacher-empty-copy">Nenhuma tarefa cadastrada.</p>}</div>
                  </section>
                  <section className="admin-shortcuts">
                    <button onClick={() => changeSection("attendance")}><span><FactCheckRounded /></span><b>Fazer chamada</b><small>Registrar presenças por turma</small><SyncRounded /></button>
                    <button onClick={() => { changeSection("tasks"); openWorkEditor(); }}><span><AssignmentRounded /></span><b>Criar tarefa</b><small>Compartilhar uma atividade</small><AddRounded /></button>
                    <button onClick={() => changeSection("reports")}><span><AssessmentRounded /></span><b>Ver relatórios</b><small>Frequência e desempenho</small><SyncRounded /></button>
                  </section>
                </>
              )}

              {activeSection === "classes" && (
                <>
                  <div className="admin-management-heading"><div><h2>Turmas vinculadas</h2><p>{classes.length} turmas</p></div><Button variant="contained" startIcon={<AddRounded />} onClick={() => openEditor()} disabled={!modalities.length}>Criar turma</Button></div>
                  <section className="admin-panel admin-management-list">
                    {classes.map((sportsClass) => (
                      <article className="admin-management-row teacher-class-row" key={sportsClass._id}>
                        <span className="admin-management-icon"><SportsSoccerRounded /></span>
                        <span className="admin-management-identity"><b>{sportsClass.name}</b><small>{sportsClass.modality}</small></span>
                        <span className="admin-management-detail">
                          {sportsClass.enrolledCount ?? 0}/{sportsClass.enrollmentLimit ?? 30} vagas reservadas
                          <small>Inscrições: {formatTeacherDate(sportsClass.registrationStartsAt)} – {formatTeacherDate(sportsClass.registrationEndsAt)}</small>
                          <small>{eligibilityLabels(sportsClass).join(" · ") || "Sem requisitos adicionais"}</small>
                        </span>
                        <span className="admin-management-actions">
                          <button aria-label={`Ver turma ${sportsClass.name}`} onClick={() => setClassDetails(sportsClass)}><VisibilityOutlined /></button>
                          <button aria-label={`Editar ${sportsClass.name}`} onClick={() => openEditor(sportsClass)}><EditOutlined /></button>
                        </span>
                      </article>
                    ))}
                    {!classes.length && <div className="admin-management-empty"><GroupsRounded /><span>Você ainda não tem turmas vinculadas.</span></div>}
                  </section>
                </>
              )}

              {activeSection === "students" && (
                <section className="admin-panel admin-management-panel"><div className="admin-list-toolbar"><div><h2>Alunos das minhas turmas</h2><p>{studentTotal} alunos encontrados</p></div></div><div className="admin-management-list">{students.map((student) => <article className="admin-management-row teacher-class-row" key={student._id}><span className="admin-management-icon"><GroupsRounded /></span><span className="admin-management-identity"><b>{student.fullName}</b><small>{student.email}</small></span><span className="admin-management-detail">{student.modality || "Modalidade não informada"} · {student.age ? `${student.age} anos` : "idade não informada"}<small className={`teacher-student-status is-${student.status ?? "pendente"}`}>{studentStatusLabel(student.status)}</small></span><span className="admin-management-actions"><button aria-label={`Ver dados de ${student.fullName}`} onClick={() => void openStudent(student, false)}><VisibilityOutlined /></button>{student.status === "pendente" && <Button size="small" variant="outlined" onClick={() => void openStudent(student, true)}>Analisar</Button>}</span></article>)}{!students.length && <div className="admin-management-empty"><SearchRounded /><span>Nenhum aluno vinculado às suas turmas.</span></div>}</div>{studentTotal > 20 && <div className="teacher-student-pagination"><span>Exibindo {(studentPage - 1) * 20 + 1}–{Math.min(studentPage * 20, studentTotal)} de {studentTotal} alunos</span><Pagination count={Math.ceil(studentTotal / 20)} page={studentPage} onChange={(_event, page) => setStudentPage(page)} size="small" /></div>}</section>
              )}

              {activeSection === "attendance" && (
                <section className="admin-panel teacher-work-panel">
                  <div className="teacher-work-toolbar"><FormControl><InputLabel id="attendance-class-label">Turma</InputLabel><Select labelId="attendance-class-label" label="Turma" value={attendanceClassId} onChange={(event) => void loadAttendanceForDate(attendanceDate, event.target.value)}>{classes.map((item) => <MenuItem value={item._id} key={item._id}>{item.name}</MenuItem>)}</Select></FormControl><TextField label="Data da chamada" type="date" value={attendanceDate} onChange={(event) => void loadAttendanceForDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} /></div>
                  <div className="admin-panel-heading"><div><h2>Lista de chamada</h2><p>Marque quem esteve presente e salve a chamada.</p></div><Button variant="contained" onClick={() => void saveAttendance()} disabled={saving || !attendanceStudents.length}>{saving ? "Salvando..." : "Salvar chamada"}</Button></div>
                  {attendanceStudents.map((student) => <label className="teacher-attendance-row" key={student.id}><span><b>{student.fullName}</b><small>{student.email}</small></span><FormControlLabel control={<Checkbox checked={student.present} onChange={(event) => setAttendanceStudents((current) => current.map((item) => item.id === student.id ? { ...item, present: event.target.checked, marked: true } : item))} />} label={student.present ? "Presente" : "Ausente"} /></label>)}
                  {!attendanceStudents.length && <div className="admin-management-empty"><GroupsRounded /><span>Não há alunos aprovados para esta turma ou data.</span></div>}
                  <div className="teacher-attendance-history"><h3>Histórico de chamadas</h3>{attendanceHistory.map((item) => <div key={item.date}><span>{formatTeacherDate(item.date)}</span><span>{item.present}/{item.total} presentes</span><b>{item.rate}%</b></div>)}{!attendanceHistory.length && <small>Nenhuma chamada anterior.</small>}</div>
                </section>
              )}

              {workSections.includes(activeSection as WorkResource) && (
                <>
                  {activeSection === "notifications" ? (
                    <div className="teacher-dashboard-columns">
                      <section className="admin-panel teacher-work-panel">
                        <div className="admin-panel-heading"><div><h2>Enviar comunicado</h2><p>Envie para toda a turma ou para um aluno específico.</p></div></div>
                        <form className="teacher-work-form" onSubmit={(event) => void sendNotification(event)}>
                          <TextField label="Título" value={notificationForm.title} onChange={(event) => setNotificationForm({ ...notificationForm, title: event.target.value })} required inputProps={{ maxLength: 200 }} />
                          <FormControl required><InputLabel id="notification-class-label">Turma</InputLabel><Select labelId="notification-class-label" label="Turma" value={notificationForm.classId} onChange={(event) => setNotificationForm({ ...notificationForm, classId: event.target.value, studentId: "" })}>{classes.map((item) => <MenuItem key={item._id} value={item._id}>{item.name}</MenuItem>)}</Select></FormControl>
                          <FormControl><InputLabel id="notification-student-label">Destinatário</InputLabel><Select labelId="notification-student-label" label="Destinatário" value={notificationForm.studentId} onChange={(event) => setNotificationForm({ ...notificationForm, studentId: event.target.value })}><MenuItem value="">Toda a turma</MenuItem>{classStudents.map((student) => <MenuItem key={student._id} value={student._id}>{student.fullName}</MenuItem>)}</Select></FormControl>
                          <TextField label="Mensagem" value={notificationForm.description} onChange={(event) => setNotificationForm({ ...notificationForm, description: event.target.value })} required multiline minRows={4} inputProps={{ maxLength: 5000 }} />
                          <Button type="submit" variant="contained" disabled={saving || !classes.length}>{saving ? "Enviando..." : "Enviar notificação"}</Button>
                        </form>
                      </section>
                      <section className="admin-panel admin-management-list"><div className="admin-panel-heading"><div><h2>Histórico enviado</h2><p>Comunicados das suas turmas.</p></div></div>{workRecords.map((record) => <article className="admin-management-row" key={record._id}><span className="admin-management-icon"><NotificationsRounded /></span><span className="admin-management-identity"><b>{record.title}</b><small>{record.description}</small></span><span className="admin-management-detail">{rowClassName(record)}<small>{formatTeacherDate(record.createdAt)}</small></span><span className="admin-management-actions"><button aria-label={`Ver notificação ${record.title}`} onClick={() => openWorkDetails(record, "notifications")}><VisibilityOutlined /></button></span></article>)}{!workRecords.length && <div className="admin-management-empty"><NotificationsRounded /><span>Nenhuma notificação enviada.</span></div>}</section>
                    </div>
                  ) : (
                    <section className="admin-panel admin-management-panel">
                      <div className="admin-panel-heading"><div><h2>{section.title}</h2><p>{workRecords.length} registros</p></div><Button variant="contained" startIcon={<AddRounded />} onClick={() => openWorkEditor()} disabled={!classes.length}>{activeSection === "evaluations" ? "Nova avaliação" : `Criar ${activeSection === "lesson-plans" ? "plano" : activeSection === "events" ? "evento" : activeSection === "materials" ? "material" : "tarefa"}`}</Button></div>
                      <div className="admin-management-list">{shownRecords.map((record) => {
                        const responseCount = taskResponses.filter((item) => getRelatedId(item.taskId) === record._id).length;
                        return <article className="admin-management-row teacher-class-row" key={record._id}><span className="admin-management-icon">{activeSection === "tasks" ? <AssignmentRounded /> : activeSection === "events" ? <EventRounded /> : activeSection === "evaluations" ? <AssessmentRounded /> : <ArticleRounded />}</span><span className="admin-management-identity"><b>{record.title}</b><small>{record.description || record.content || record.feedback || "Sem descrição"}</small></span><span className="admin-management-detail">{rowClassName(record)}<small>{formatTeacherDate(record.dueDate ?? record.date ?? record.createdAt)}</small>{activeSection === "evaluations" && <small>{getRelatedName(record.studentId)} · Nota {record.grade ?? "—"}</small>}</span><span className="admin-management-actions"><button aria-label={`Ver ${record.title}`} onClick={() => openWorkDetails(record)}><VisibilityOutlined /></button>{activeSection === "tasks" && <Button size="small" variant="outlined" onClick={() => setSelectedTaskResponsesTarget(record)}>Ver respostas ({responseCount})</Button>}<button aria-label={`Editar ${record.title}`} onClick={() => openWorkEditor(record)}><EditOutlined /></button><button aria-label={`Excluir ${record.title}`} onClick={() => void deleteWork(record)}><DeleteOutlineRounded /></button></span></article>;
                      })}{!workRecords.length && <div className="admin-management-empty"><SearchRounded /><span>Nenhum registro cadastrado.</span></div>}</div>
                      {activeSection === "tasks" && taskResponses.length > 0 && <div className="teacher-task-responses"><h3>Respostas recebidas · {taskResponses.length}</h3>{taskResponses.map((item) => <article key={item._id}><span><b>{getRelatedName(item.studentId)}</b><small>{getRelatedName(item.taskId)} · {rowClassName(item)} · {item.grade === undefined ? "Aguardando correção" : `Nota ${item.grade}/10`}</small><p>{item.content || item.description || "Resposta sem texto."}</p></span><span className="admin-management-actions"><button aria-label={`Ver resposta de ${getRelatedName(item.studentId)}`} onClick={() => openWorkDetails(item, "tasks")}><VisibilityOutlined /></button><Button variant="outlined" onClick={() => { setSelectedResponse(item); setGradeForm({ grade: item.grade === undefined ? "" : String(item.grade), feedback: item.feedback ?? "" }); }}>{item.grade === undefined ? "Corrigir" : "Editar avaliação"}</Button></span></article>)}</div>}
                    </section>
                  )}
                </>
              )}

              {activeSection === "reports" && (
                <div className="admin-reports">
                  <section className="admin-panel admin-report-panel teacher-report-panel">
                    <div className="admin-panel-heading"><div><h2>Relatório de atividades</h2><p>Dados das suas turmas, sem registros de teste.</p></div></div>
                    <details className="admin-report-collapsible">
                      <summary><span>Filtros opcionais</span><span>{reportDates.from || reportDates.to ? "Período personalizado" : "Todas as datas"}</span></summary>
                      <fieldset className="admin-report-fieldset">
                        <legend>Período</legend>
                        <div className="admin-report-filters">
                          <TextField label="Data inicial" type="date" value={reportDates.from} onChange={(event) => setReportDates({ ...reportDates, from: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                          <TextField label="Data final" type="date" value={reportDates.to} onChange={(event) => setReportDates({ ...reportDates, to: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                        </div>
                        <small className="admin-report-hint">O período é aplicado à data de cada tipo de registro.</small>
                      </fieldset>
                    </details>
                    <div className="admin-report-export teacher-report-actions">
                      <Button variant="outlined" onClick={() => void loadSectionData()}>Aplicar filtros</Button>
                      <Button variant="contained" startIcon={<ArticleRounded />} onClick={() => void exportReports()} disabled={!reportData}>Exportar CSV</Button>
                    </div>
                    {reportData && (
                      <div className="admin-stats-grid admin-report-stats">
                        <article className="admin-stat-card"><span className="admin-stat-icon stat-total"><FactCheckRounded /></span><span className="admin-stat-label">Presenças registradas</span><strong>{reportData.attendance.length}</strong><small>No período selecionado</small></article>
                        <article className="admin-stat-card"><span className="admin-stat-icon stat-approved"><AssessmentRounded /></span><span className="admin-stat-label">Avaliações</span><strong>{reportData.evaluations.length}</strong><small>Notas e feedbacks</small></article>
                        <article className="admin-stat-card"><span className="admin-stat-icon stat-pending"><AssignmentRounded /></span><span className="admin-stat-label">Tarefas</span><strong>{reportData.tasks.length}</strong><small>Atividades cadastradas</small></article>
                        <article className="admin-stat-card"><span className="admin-stat-icon stat-rejected"><ArticleRounded /></span><span className="admin-stat-label">Respostas recebidas</span><strong>{reportData.responses.length}</strong><small>Envios dos alunos</small></article>
                      </div>
                    )}
                  </section>
                </div>
              )}

              {activeSection === "profile" && (
                <div className="teacher-dashboard-columns">
                  <form className="admin-panel teacher-work-form" onSubmit={(event) => void saveProfile(event)}><div className="admin-panel-heading"><div><h2>Dados pessoais</h2><p>Atualize seu nome e e-mail de acesso.</p></div></div><TextField label="Nome completo" value={profile.fullName} onChange={(event) => setProfile({ ...profile, fullName: event.target.value })} required inputProps={{ maxLength: 140 }} /><TextField label="E-mail" type="email" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} required /><div className="teacher-profile-classes"><b>Minhas turmas</b>{classes.map((item) => <span key={item._id}>{item.name} · {item.modality}</span>)}{!classes.length && <small>Nenhuma turma vinculada.</small>}</div><Button type="submit" variant="contained" disabled={saving}>Salvar perfil</Button></form>
                  <form className="admin-panel teacher-work-form" onSubmit={(event) => void changeTeacherPassword(event)}><div className="admin-panel-heading"><div><h2>Alterar senha</h2><p>Use uma senha nova e exclusiva.</p></div></div><TextField label="Senha atual" type="password" autoComplete="current-password" value={profilePassword.currentPassword} onChange={(event) => setProfilePassword({ ...profilePassword, currentPassword: event.target.value })} required /><TextField label="Nova senha" type="password" autoComplete="new-password" value={profilePassword.newPassword} onChange={(event) => setProfilePassword({ ...profilePassword, newPassword: event.target.value })} required helperText="Mínimo de 10 caracteres; use três tipos de caracteres." /><Button type="submit" variant="outlined" startIcon={<KeyRounded />} disabled={saving}>Alterar senha</Button></form>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Dialog open={editor !== undefined} onClose={() => !saving && setEditor(undefined)} fullWidth maxWidth="sm">
        <form onSubmit={(event) => void save(event)}>
          <DialogTitle>{editor ? `Editar ${editor.name}` : "Criar turma"}</DialogTitle>
          <DialogContent className="admin-editor-fields">
            <TextField autoFocus label="Nome da turma" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required inputProps={{ maxLength: 100 }} />
            <FormControl required fullWidth><InputLabel id="teacher-modality-label">Modalidade</InputLabel><Select labelId="teacher-modality-label" label="Modalidade" value={form.modality} onChange={(event) => setForm({ ...form, modality: event.target.value })}>{modalities.map(({ name }) => <MenuItem key={name} value={name}>{name}</MenuItem>)}</Select></FormControl>
            <TextField
              label="Limite de alunos"
              type="number"
              value={form.enrollmentLimit}
              onChange={(event) => setForm({ ...form, enrollmentLimit: event.target.value })}
              required
              slotProps={{ htmlInput: { min: 1, max: 10000, step: 1 } }}
              helperText={editor && "O limite não pode ser menor que as inscrições pendentes e os alunos aprovados."}
            />
            <TextField
              label="Início das inscrições"
              type="datetime-local"
              value={form.registrationStartsAt}
              onChange={(event) => setForm({ ...form, registrationStartsAt: event.target.value })}
              required
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Encerramento das inscrições"
              type="datetime-local"
              value={form.registrationEndsAt}
              onChange={(event) => setForm({ ...form, registrationEndsAt: event.target.value })}
              required
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: form.registrationStartsAt } }}
            />
            <fieldset className="teacher-eligibility-fieldset"><legend>Requisitos para inscrição</legend><div className="teacher-extra-requirements"><b>Adicione e descreva os requisitos da turma</b>{form.requirements.map((requirement, index) => <div className="teacher-extra-requirement" key={index}><TextField label={`Requisito ${index + 1}`} value={requirement} onChange={(event) => setForm({ ...form, requirements: form.requirements.map((item, current) => current === index ? event.target.value : item) })} required multiline inputProps={{ maxLength: 240 }} /><Button type="button" color="error" onClick={() => setForm({ ...form, requirements: form.requirements.filter((_, current) => current !== index) })}>Excluir</Button></div>)}<Button type="button" onClick={() => setForm({ ...form, requirements: [...form.requirements, ""] })} disabled={form.requirements.length >= 20}>Adicionar requisito</Button></div></fieldset>
          </DialogContent>
          <DialogActions className="admin-dialog-actions"><Button onClick={() => setEditor(undefined)} disabled={saving}>Cancelar</Button><Button type="submit" variant="contained" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button></DialogActions>
        </form>
      </Dialog>
      <Dialog open={Boolean(classDetails)} onClose={() => setClassDetails(null)} fullWidth maxWidth="sm">
        <DialogTitle>Turma {classDetails?.name}</DialogTitle>
        <DialogContent className="admin-editor-fields">
          <p className="admin-dialog-copy">Modalidade: {classDetails?.modality ?? "—"}</p>
          <p className="admin-dialog-copy">Vagas reservadas: {classDetails?.enrolledCount ?? 0}/{classDetails?.enrollmentLimit ?? 30}</p>
          <p className="admin-dialog-copy">Início das inscrições: {formatTeacherDate(classDetails?.registrationStartsAt)}</p>
          <p className="admin-dialog-copy">Encerramento das inscrições: {formatTeacherDate(classDetails?.registrationEndsAt)}</p>
          <div className="admin-dialog-copy">
            <b>Requisitos para inscrição</b>
            {classDetails && eligibilityLabels(classDetails).length
              ? <ul>{eligibilityLabels(classDetails).map((requirement) => <li key={requirement}>{requirement}</li>)}</ul>
              : <p>Nenhum requisito adicional cadastrado.</p>}
          </div>
        </DialogContent>
        <DialogActions className="admin-dialog-actions"><Button onClick={() => setClassDetails(null)}>Fechar</Button></DialogActions>
      </Dialog>
      <Dialog open={Boolean(workDetails)} onClose={() => setWorkDetails(null)} fullWidth maxWidth="sm">
        <DialogTitle>{workDetails?.record.taskId ? "Resposta do aluno" : "Detalhes do registro"} · {workDetails?.record.title || getRelatedName(workDetails?.record.taskId)}</DialogTitle>
        <DialogContent className="admin-editor-fields">
          <p className="admin-dialog-copy">Turma: {rowClassName(workDetails?.record ?? { _id: "", title: "" })}</p>
          {workDetails?.record.studentId && <p className="admin-dialog-copy">Aluno: {getRelatedName(workDetails.record.studentId)}</p>}
          {(workDetails?.record.date || workDetails?.record.dueDate || workDetails?.record.createdAt) && (
            <p className="admin-dialog-copy">
              {workDetails.record.dueDate ? "Prazo" : "Data"}: {formatTeacherDate(workDetails.record.dueDate ?? workDetails.record.date ?? workDetails.record.createdAt)}
            </p>
          )}
          {workDetails?.record.type && <p className="admin-dialog-copy">Tipo: {workDetails.record.type}</p>}
          {workDetails?.record.description && <div className="admin-dialog-copy"><b>Descrição</b><p>{workDetails.record.description}</p></div>}
          {workDetails?.record.content && <div className="admin-dialog-copy"><b>Conteúdo/resposta</b><p>{workDetails.record.content}</p></div>}
          {workDetails?.section === "tasks" && !workDetails.record.taskId && <p className="admin-dialog-copy">Resposta pela plataforma: {workDetails.record.data?.allowResponse ? "Permitida" : "Não permitida"}</p>}
          {workDetails?.record.grade !== undefined && <p className="admin-dialog-copy">Nota: {workDetails.record.grade}/10</p>}
          {workDetails?.record.feedback && <div className="admin-dialog-copy"><b>Feedback</b><p>{workDetails.record.feedback}</p></div>}
          {!workDetails?.record.description && !workDetails?.record.content && !workDetails?.record.feedback && <p className="admin-dialog-copy">Sem detalhes adicionais cadastrados.</p>}
        </DialogContent>
        <DialogActions className="admin-dialog-actions"><Button onClick={() => setWorkDetails(null)}>Fechar</Button></DialogActions>
      </Dialog>
      <Dialog open={detailLoading || Boolean(studentTarget)} onClose={() => !saving && !detailLoading && setStudentTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>{studentTarget ? (reviewEnabled ? `Analisar inscrição de ${studentTarget.fullName}` : `Dados de ${studentTarget.fullName}`) : "Carregando dados do aluno"}</DialogTitle>
        <DialogContent>
          {detailLoading && <div className="admin-table-loading"><CircularProgress size={20} /> Carregando ficha do aluno...</div>}
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {studentTarget && <StudentDetailsPanel student={studentTarget} reviewEnabled={reviewEnabled} selectedReasons={selectedReasons} onToggleReason={(reason, checked) => setSelectedReasons((current) => checked ? [...current, reason] : current.filter((item) => item !== reason))} otherReason={otherReason} setOtherReason={setOtherReason} />}
        </DialogContent>
        <DialogActions className="admin-dialog-actions">
          <Button onClick={() => setStudentTarget(null)} disabled={saving || detailLoading}>{reviewEnabled ? "Cancelar" : "Fechar"}</Button>
          {reviewEnabled && studentTarget?.status === "pendente" && <><Button color="error" variant="outlined" disabled={saving || (!selectedReasons.length && otherReason.trim().length < 3)} onClick={() => void reviewStudent("recusado")}>Recusar</Button><Button variant="contained" disabled={saving} onClick={() => void reviewStudent("aprovado")}>{saving ? "Salvando..." : "Aprovar"}</Button></>}
        </DialogActions>
      </Dialog>
      <Dialog open={workEditor !== undefined} onClose={() => !saving && setWorkEditor(undefined)} fullWidth maxWidth="sm">
        <form onSubmit={(event) => void saveWork(event)}>
          <DialogTitle>{workEditor ? "Editar" : "Criar"} {section.title.toLocaleLowerCase("pt-BR").replace(/s$/, "")}</DialogTitle>
          <DialogContent className="admin-editor-fields">
            <TextField autoFocus label="Título" value={workForm.title} onChange={(event) => setWorkForm({ ...workForm, title: event.target.value })} required inputProps={{ maxLength: 200 }} />
            <FormControl required><InputLabel id="work-class-label">Turma</InputLabel><Select labelId="work-class-label" label="Turma" value={workForm.classId} onChange={(event) => setWorkForm({ ...workForm, classId: event.target.value, studentId: "" })}>{classes.map((item) => <MenuItem key={item._id} value={item._id}>{item.name}</MenuItem>)}</Select></FormControl>
            {(activeSection === "tasks" || activeSection === "events" || activeSection === "materials") && <TextField label="Descrição" value={workForm.description} onChange={(event) => setWorkForm({ ...workForm, description: event.target.value })} multiline minRows={2} inputProps={{ maxLength: 5000 }} />}
            {(activeSection === "tasks" || activeSection === "materials" || activeSection === "lesson-plans") && <TextField label={activeSection === "materials" ? "Link ou conteúdo" : "Conteúdo"} value={workForm.content} onChange={(event) => setWorkForm({ ...workForm, content: event.target.value })} multiline minRows={3} inputProps={{ maxLength: 12000 }} />}
            {activeSection === "materials" && <FormControl><InputLabel id="material-type-label">Tipo</InputLabel><Select labelId="material-type-label" label="Tipo" value={workForm.type} onChange={(event) => setWorkForm({ ...workForm, type: event.target.value })}><MenuItem value="link">Link</MenuItem><MenuItem value="text">Texto</MenuItem></Select></FormControl>}
            {(activeSection === "events" || activeSection === "lesson-plans" || activeSection === "evaluations") && <TextField label="Data" type="datetime-local" value={workForm.date} onChange={(event) => setWorkForm({ ...workForm, date: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />}
            {activeSection === "tasks" && <TextField label="Prazo" type="datetime-local" value={workForm.dueDate} onChange={(event) => setWorkForm({ ...workForm, dueDate: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />}
            {activeSection === "evaluations" && <><FormControl required><InputLabel id="evaluation-student-label">Aluno</InputLabel><Select labelId="evaluation-student-label" label="Aluno" value={workForm.studentId} onChange={(event) => setWorkForm({ ...workForm, studentId: event.target.value })}>{classStudents.map((student) => <MenuItem key={student._id} value={student._id}>{student.fullName}</MenuItem>)}</Select></FormControl><TextField label="Nota (0 a 10)" type="number" value={workForm.grade} onChange={(event) => setWorkForm({ ...workForm, grade: event.target.value })} required slotProps={{ htmlInput: { min: 0, max: 10, step: 0.1 } }} /><TextField label="Feedback" value={workForm.feedback} onChange={(event) => setWorkForm({ ...workForm, feedback: event.target.value })} multiline minRows={2} inputProps={{ maxLength: 5000 }} /></>}
            {activeSection === "tasks" && <FormControlLabel control={<Checkbox checked={workForm.allowPlatformResponse} onChange={(event) => setWorkForm({ ...workForm, allowPlatformResponse: event.target.checked })} />} label="Permitir resposta pela plataforma" />}
          </DialogContent>
          <DialogActions className="admin-dialog-actions"><Button onClick={() => setWorkEditor(undefined)} disabled={saving}>Cancelar</Button><Button type="submit" variant="contained" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button></DialogActions>
        </form>
      </Dialog>
      <Dialog open={Boolean(selectedTaskResponsesTarget)} onClose={() => setSelectedTaskResponsesTarget(null)} fullWidth maxWidth="md">
        <DialogTitle>Respostas da tarefa: {selectedTaskResponsesTarget?.title}</DialogTitle>
        <DialogContent>
          <p className="admin-dialog-copy">{selectedTaskResponses.length} {selectedTaskResponses.length === 1 ? "aluno respondeu" : "alunos responderam"}.</p>
          {selectedTaskResponses.length > 0 ? (
            <div className="teacher-task-responses">
              {selectedTaskResponses.map((item) => (
                <article key={item._id}>
                  <span>
                    <b>{getRelatedName(item.studentId)}</b>
                    <small>{rowClassName(item)} · Enviada em {formatTeacherDate(item.createdAt)}</small>
                    <p>{item.content || item.description || "Resposta sem texto."}</p>
                    {item.grade !== undefined && <small>Nota: {item.grade}/10{item.feedback ? ` · Feedback: ${item.feedback}` : ""}</small>}
                  </span>
                  <Button
                    variant={item.grade === undefined ? "contained" : "outlined"}
                    onClick={() => {
                      setSelectedResponse(item);
                      setGradeForm({ grade: item.grade === undefined ? "" : String(item.grade), feedback: item.feedback ?? "" });
                    }}
                  >
                    {item.grade === undefined ? "Corrigir" : "Editar avaliação"}
                  </Button>
                </article>
              ))}
            </div>
          ) : (
            <div className="admin-management-empty"><AssignmentRounded /><span>Nenhum aluno respondeu esta tarefa ainda.</span></div>
          )}
        </DialogContent>
        <DialogActions className="admin-dialog-actions"><Button onClick={() => setSelectedTaskResponsesTarget(null)}>Fechar</Button></DialogActions>
      </Dialog>
      <Dialog open={Boolean(selectedResponse)} onClose={() => !saving && setSelectedResponse(null)} fullWidth maxWidth="sm"><form onSubmit={(event) => void gradeTaskResponse(event)}><DialogTitle>Corrigir resposta de {getRelatedName(selectedResponse?.studentId)}</DialogTitle><DialogContent className="admin-editor-fields"><p className="admin-dialog-copy">{getRelatedName(selectedResponse?.taskId)} · {selectedResponse?.content || selectedResponse?.description || "Sem resposta escrita."}</p><TextField label="Nota (0 a 10)" type="number" value={gradeForm.grade} onChange={(event) => setGradeForm({ ...gradeForm, grade: event.target.value })} required slotProps={{ htmlInput: { min: 0, max: 10, step: 0.1 } }} /><TextField label="Feedback" value={gradeForm.feedback} onChange={(event) => setGradeForm({ ...gradeForm, feedback: event.target.value })} multiline minRows={3} inputProps={{ maxLength: 5000 }} /></DialogContent><DialogActions className="admin-dialog-actions"><Button onClick={() => setSelectedResponse(null)}>Cancelar</Button><Button type="submit" variant="contained" disabled={saving}>{saving ? "Salvando..." : "Salvar avaliação"}</Button></DialogActions></form></Dialog>
    </main>
  );
}

function eligibilityLabels(sportsClass: ClassRow) {
  return getClassRequirements(sportsClass);
}

function studentStatusLabel(status?: StudentRow["status"]) {
  if (status === "aprovado") return "Aprovado";
  if (status === "recusado") return "Recusado";
  return "Pendente";
}

function getStudentRejectionReason(student: StudentDetails) {
  if (student.rejectionReasons?.length || student.rejectionOtherReason) {
    return [...(student.rejectionReasons ?? []), student.rejectionOtherReason].filter(Boolean).join(" ");
  }
  return student.rejectionReason ?? "";
}

function getRelatedName(value: WorkRecord["classId"] | WorkRecord["studentId"] | WorkRecord["taskId"]) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if ("name" in value) return value.name;
  if ("fullName" in value) return value.fullName;
  return value.title;
}

function getRelatedId(value: WorkRecord["classId"] | WorkRecord["studentId"] | WorkRecord["taskId"]) {
  if (!value) return "";
  return typeof value === "string" ? value : value._id;
}

function formatTeacherDate(value?: string) {
  if (!value) return "Data não definida";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data não definida"
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function StatCard({ Icon, label, value, detail, tone }: {
  Icon: typeof GroupsRounded;
  label: string;
  value: number;
  detail: string;
  tone: "total" | "pending" | "approved" | "rejected";
}) {
  return (
    <article className="admin-stat-card">
      <span className={`admin-stat-icon stat-${tone}`}><Icon /></span>
      <span className="admin-stat-label">{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function StudentDetailsPanel({ student, reviewEnabled, selectedReasons, onToggleReason, otherReason, setOtherReason }: {
  student: StudentDetails;
  reviewEnabled: boolean;
  selectedReasons: string[];
  onToggleReason: (reason: string, checked: boolean) => void;
  otherReason: string;
  setOtherReason: (reason: string) => void;
}) {
  const address = student.address
    ? [student.address.street, student.address.number, student.address.complement, student.address.neighborhood, student.address.city].filter(Boolean).join(", ")
    : "";
  return (
    <div className="student-details-content">
      <dl className="student-details-grid">
        <div><dt>E-mail</dt><dd>{student.email}</dd></div>
        <div><dt>Status</dt><dd>{studentStatusLabel(student.status)}</dd></div>
        <div><dt>Nascimento</dt><dd>{student.birthDate ? formatTeacherDate(student.birthDate) : "—"}</dd></div>
        <div><dt>Idade</dt><dd>{student.age ? `${student.age} anos` : "—"}</dd></div>
        <div><dt>Gênero</dt><dd>{student.gender ?? "—"}</dd></div>
        <div><dt>Modalidade</dt><dd>{student.modality ?? "—"}</dd></div>
        <div><dt>Escola</dt><dd>{student.school ?? "—"}</dd></div>
        <div><dt>Endereço</dt><dd>{address || "—"}</dd></div>
        <div><dt>Responsável</dt><dd>{student.guardian?.name ?? "—"}</dd></div>
        <div><dt>Telefone do responsável</dt><dd>{student.guardian?.phone ?? "—"}</dd></div>
        <div><dt>Turma(s)</dt><dd>{student.classes.map(({ name }) => name).join(", ") || "—"}</dd></div>
      </dl>
      {student.classes.map((sportsClass) => (
        <section className="student-details-class" key={sportsClass.id}>
          <h3>Requisitos da turma {sportsClass.name}</h3>
          {sportsClass.requirements.length ? <ul>{sportsClass.requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ul> : <p>Nenhum requisito adicional cadastrado.</p>}
        </section>
      ))}
      {student.status === "recusado" && getStudentRejectionReason(student) && <Alert severity="warning"><b>Motivo da recusa:</b> {getStudentRejectionReason(student)}</Alert>}
      <div className="student-detail-documents">
        {student.documents.photoUrl && <a href={student.documents.photoUrl} target="_blank" rel="noreferrer">Abrir foto do aluno</a>}
        {student.documents.signedFormUrl && <a href={student.documents.signedFormUrl} target="_blank" rel="noreferrer">Abrir ficha assinada (PDF)</a>}
      </div>
      {reviewEnabled && student.status === "pendente" && (
        <section className="student-review-reasons">
          <h3>Requisitos para esta turma</h3>
          <p>Marque os critérios não atendidos ou informe outro motivo.</p>
          {student.classes.flatMap(({ requirements }) => requirements).filter((item, index, all) => all.indexOf(item) === index).map((requirement) => (
            <FormControlLabel key={requirement} control={<Checkbox checked={selectedReasons.includes(requirement)} onChange={(event) => onToggleReason(requirement, event.target.checked)} />} label={requirement} />
          ))}
          <TextField label={selectedReasons.length ? "Outro motivo (opcional)" : "Outro motivo"} value={otherReason} onChange={(event) => setOtherReason(event.target.value)} multiline minRows={2} fullWidth slotProps={{ htmlInput: { maxLength: 500 } }} />
        </section>
      )}
    </div>
  );
}
