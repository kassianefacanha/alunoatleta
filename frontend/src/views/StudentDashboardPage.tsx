import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArticleRounded,
  AssignmentRounded,
  CalendarMonthRounded,
  CheckCircleRounded,
  ClassRounded,
  DashboardRounded,
  DownloadRounded,
  DoneAllRounded,
  EventRounded,
  FactCheckRounded,
  KeyRounded,
  LogoutRounded,
  MenuRounded,
  NotificationsNoneRounded,
  NotificationsRounded,
  PersonOutlineRounded,
  PrivacyTipRounded,
  SchoolRounded,
  SaveRounded,
  SendRounded,
  SyncRounded,
  TaskAltRounded,
  VisibilityRounded,
} from "@mui/icons-material";
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField } from "@mui/material";
import { Link, useNavigate } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";
import { adminRequest } from "../services/admin";

type StudentSection = "overview" | "tasks" | "materials" | "lesson-plans" | "events" | "evaluations" | "attendance" | "notifications" | "profile" | "privacy";

interface ClassSummary {
  _id: string;
  name: string;
  modality: string;
}

interface StudentRecord {
  _id: string;
  title?: string;
  description?: string;
  content?: string;
  type?: string;
  classId?: string | ClassSummary | null;
  date?: string;
  dueDate?: string;
  grade?: number;
  feedback?: string;
  present?: boolean;
  createdAt?: string;
  allowResponse?: boolean;
  response?: {
    _id: string;
    content?: string;
    grade?: number;
    feedback?: string;
    createdAt?: string;
  } | null;
  data?: { allowResponse?: boolean; read?: boolean };
}

interface StudentTask extends StudentRecord {
  title: string;
  allowResponse: boolean;
}

type LgpdRequestType = "access" | "correction" | "deletion" | "portability" | "revocation";

interface StudentLgpdRequest {
  _id: string;
  type: LgpdRequestType;
  description?: string;
  responseNote?: string;
  reviewedAt?: string;
  status: "open" | "processing" | "completed" | "rejected";
  createdAt: string;
}

interface StudentDashboardData {
  student: {
    _id: string;
    fullName: string;
    email: string;
    age?: number;
    birthDate?: string;
    gender?: string;
    modality?: string;
    school?: string;
    address?: { neighborhood?: string; city?: string; street?: string; number?: string; complement?: string };
    guardian?: { name?: string; phone?: string };
    termsAcceptedAt?: string;
    termsVersion?: string;
  };
  classes: ClassSummary[];
  tasks: StudentTask[];
  materials: StudentRecord[];
  lessonPlans: StudentRecord[];
  events: StudentRecord[];
  evaluations: StudentRecord[];
  attendance: StudentRecord[];
  notifications: Array<StudentRecord & { data?: { read?: boolean } }>;
  lgpdRequests: StudentLgpdRequest[];
}

type TaskFilter = "all" | "pending" | "submitted" | "graded";
type NotificationFilter = "all" | "unread" | "read";

const sectionInfo: Record<StudentSection, { title: string; description: string }> = {
  overview: { title: "Visão geral", description: "Acompanhe suas atividades e avisos." },
  tasks: { title: "Minhas tarefas", description: "Consulte atividades e envie respostas pela plataforma." },
  materials: { title: "Materiais", description: "Acesse os conteúdos compartilhados pelos professores." },
  "lesson-plans": { title: "Planos de aula", description: "Consulte os planos e conteúdos das suas turmas." },
  events: { title: "Eventos", description: "Veja a agenda das suas turmas." },
  evaluations: { title: "Avaliações", description: "Acompanhe notas e feedbacks." },
  attendance: { title: "Frequência", description: "Consulte seu histórico de presenças." },
  notifications: { title: "Notificações", description: "Leia os comunicados enviados pelos professores." },
  profile: { title: "Meu perfil", description: "Confira seus dados e turmas." },
  privacy: { title: "Meus dados (LGPD)", description: "Consulte seus dados pessoais e acompanhe solicitações de privacidade." },
};

const navItems: Array<{ key: StudentSection; label: string; Icon: typeof DashboardRounded }> = [
  { key: "overview", label: "Visão geral", Icon: DashboardRounded },
  { key: "tasks", label: "Tarefas", Icon: AssignmentRounded },
  { key: "materials", label: "Materiais", Icon: ArticleRounded },
  { key: "lesson-plans", label: "Planos de aula", Icon: CalendarMonthRounded },
  { key: "events", label: "Eventos", Icon: EventRounded },
  { key: "evaluations", label: "Avaliações", Icon: TaskAltRounded },
  { key: "attendance", label: "Frequência", Icon: FactCheckRounded },
  { key: "notifications", label: "Notificações", Icon: NotificationsRounded },
  { key: "profile", label: "Meu perfil", Icon: PersonOutlineRounded },
  { key: "privacy", label: "Meus dados (LGPD)", Icon: PrivacyTipRounded },
];

const lgpdRequestLabels: Record<LgpdRequestType, string> = {
  access: "Acesso aos dados",
  correction: "Correção",
  deletion: "Exclusão",
  portability: "Portabilidade",
  revocation: "Revogação de consentimento",
};

function getTokenRole(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return undefined;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(normalized)).role as string | undefined;
  } catch {
    return undefined;
  }
}

function getRelatedName(value?: string | ClassSummary | null) {
  if (!value) return "Turma";
  return typeof value === "string" ? value : value.name;
}

function formatStudentDate(value?: string) {
  if (!value) return "Data não definida";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data não definida"
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function lgpdRequestStatusLabel(status: StudentLgpdRequest["status"]) {
  if (status === "open") return "Aguardando análise";
  if (status === "processing") return "Em análise";
  if (status === "completed") return "Concluída";
  return "Recusada";
}

function recordMatches(item: StudentRecord, search: string, classId: string) {
  const relatedClass = typeof item.classId === "object" && item.classId ? item.classId : null;
  const matchesClass = !classId || (relatedClass && relatedClass._id === classId);
  const searchableText = [item.title, item.description, item.content, item.type, relatedClass?.name]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("pt-BR");
  return Boolean(matchesClass) && searchableText.includes(search.trim().toLocaleLowerCase("pt-BR"));
}

function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function StudentDashboardPage() {
  const token = localStorage.getItem("aluno-atleta-token");
  const navigate = useNavigate();
  const [data, setData] = useState<StudentDashboardData | null>(null);
  const [section, setSection] = useState<StudentSection>("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [taskTarget, setTaskTarget] = useState<StudentTask | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<StudentRecord | null>(null);
  const [taskResponse, setTaskResponse] = useState("");
  const [listSearch, setListSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [notificationFilter, setNotificationFilter] = useState<NotificationFilter>("all");
  const [profileForm, setProfileForm] = useState({
    fullName: "",
    age: "",
    birthDate: "",
    gender: "",
    modality: "",
    school: "",
    neighborhood: "",
    city: "",
    street: "",
    number: "",
    complement: "",
    guardianName: "",
    guardianPhone: "",
  });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "" });
  const [lgpdRequestType, setLgpdRequestType] = useState<LgpdRequestType>("access");
  const [lgpdDescription, setLgpdDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      setData(await adminRequest<StudentDashboardData>("/student/dashboard", token));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar sua área.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => {
    if (!data) return;
    setProfileForm({
      fullName: data.student.fullName ?? "",
      age: data.student.age ? String(data.student.age) : "",
      birthDate: data.student.birthDate ? data.student.birthDate.slice(0, 10) : "",
      gender: data.student.gender ?? "",
      modality: data.student.modality ?? "",
      school: data.student.school ?? "",
      neighborhood: data.student.address?.neighborhood ?? "",
      city: data.student.address?.city ?? "",
      street: data.student.address?.street ?? "",
      number: data.student.address?.number ?? "",
      complement: data.student.address?.complement ?? "",
      guardianName: data.student.guardian?.name ?? "",
      guardianPhone: data.student.guardian?.phone ?? "",
    });
  }, [data]);

  const pendingTasks = useMemo(
    () => data?.tasks.filter((task) => !task.response) ?? [],
    [data],
  );
  const unreadNotifications = useMemo(
    () => data?.notifications.filter((notification) => notification.data?.read !== true).length ?? 0,
    [data],
  );
  const attendanceRate = useMemo(() => {
    if (!data?.attendance.length) return null;
    const present = data.attendance.filter((record) => record.present).length;
    return Math.round((present / data.attendance.length) * 100);
  }, [data]);
  const nextEvent = useMemo(
    () => data?.events.find((item) => item.date && new Date(item.date) >= new Date()),
    [data],
  );
  const lastEvaluation = useMemo(
    () => data?.evaluations.find((item) => item.grade !== undefined),
    [data],
  );
  const visibleTasks = useMemo(() => (data?.tasks ?? []).filter((task) => {
    if (!recordMatches(task, listSearch, classFilter)) return false;
    if (taskFilter === "pending") return !task.response;
    if (taskFilter === "submitted") return Boolean(task.response && task.response.grade === undefined);
    if (taskFilter === "graded") return task.response?.grade !== undefined;
    return true;
  }), [classFilter, data, listSearch, taskFilter]);
  const visibleNotifications = useMemo(() => (data?.notifications ?? []).filter((item) => {
    if (!recordMatches(item, listSearch, classFilter)) return false;
    if (notificationFilter === "unread") return item.data?.read !== true;
    if (notificationFilter === "read") return item.data?.read === true;
    return true;
  }), [classFilter, data, listSearch, notificationFilter]);
  const monthlyAttendance = useMemo(() => {
    if (!data) return [];
    const now = new Date();
    return Array.from({ length: 6 }, (_unused, index) => {
      const month = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      const attendance = data.attendance.filter((item) => {
        const date = item.date ? new Date(item.date) : null;
        return date && date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
      });
      const grades = data.evaluations.filter((item) => {
        const date = item.date ? new Date(item.date) : null;
        return date && item.grade !== undefined && date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
      });
      return {
        label: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(month).replace(".", ""),
        attendance: attendance.length ? Math.round((attendance.filter((item) => item.present).length / attendance.length) * 100) : null,
        grade: grades.length ? grades.reduce((sum, item) => sum + (item.grade ?? 0), 0) / grades.length : null,
      };
    });
  }, [data]);

  function changeSection(next: StudentSection) {
    setSection(next);
    setMobileMenuOpen(false);
    setError("");
    setSuccess("");
  }

  function signOut() {
    localStorage.removeItem("aluno-atleta-token");
    localStorage.removeItem("aluno-atleta-role");
    localStorage.removeItem("aluno-atleta-name");
    navigate("/login", { replace: true });
  }

  function openTask(task: StudentTask) {
    setTaskTarget(task);
    setTaskResponse(task.response?.content ?? "");
    setError("");
    setSuccess("");
  }

  async function submitTaskResponse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !taskTarget) return;
    setSaving(true);
    setError("");
    try {
      await adminRequest(`/student/tasks/${encodeURIComponent(taskTarget._id)}/response`, token, "POST", {
        content: taskResponse,
      });
      setTaskTarget(null);
      setSuccess("Resposta enviada.");
      await loadData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível enviar sua resposta.");
    } finally {
      setSaving(false);
    }
  }

  async function markNotificationRead(notificationId: string) {
    if (!token) return;
    setError("");
    try {
      await adminRequest(`/student/notifications/${encodeURIComponent(notificationId)}/read`, token, "PATCH");
      setSuccess("Notificação marcada como lida.");
      await loadData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível atualizar a notificação.");
    }
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    setError("");
    try {
      const result = await adminRequest<{ student: StudentDashboardData["student"] }>("/student/profile", token, "PATCH", {
        fullName: profileForm.fullName,
        ...(profileForm.age ? { age: Number(profileForm.age) } : {}),
        ...(profileForm.birthDate ? { birthDate: profileForm.birthDate } : {}),
        ...(profileForm.gender ? { gender: profileForm.gender } : {}),
        modality: profileForm.modality,
        school: profileForm.school,
        address: {
          neighborhood: profileForm.neighborhood,
          city: profileForm.city,
          street: profileForm.street,
          number: profileForm.number,
          complement: profileForm.complement,
        },
        guardian: { name: profileForm.guardianName, phone: profileForm.guardianPhone },
      });
      setData((current) => current ? { ...current, student: result.student } : current);
      localStorage.setItem("aluno-atleta-name", result.student.fullName);
      setSuccess("Perfil atualizado.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível atualizar seu perfil.");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    setError("");
    try {
      await adminRequest("/auth/password", token, "POST", passwordForm);
      setPasswordForm({ currentPassword: "", newPassword: "" });
      setSuccess("Senha alterada. Use a nova senha no próximo acesso.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível alterar sua senha.");
    } finally {
      setSaving(false);
    }
  }

  function exportCurrentSection() {
    if (!data) return;
    const sections: Partial<Record<StudentSection, { headers: string[]; rows: unknown[][] }>> = {
      tasks: {
        headers: ["Tarefa", "Turma", "Prazo", "Situação", "Nota", "Feedback"],
        rows: visibleTasks.map((task) => [task.title, getRelatedName(task.classId), task.dueDate, !task.response ? "Pendente" : task.response.grade === undefined ? "Entregue" : "Corrigida", task.response?.grade, task.response?.feedback]),
      },
      materials: {
        headers: ["Material", "Turma", "Tipo", "Descrição", "Conteúdo"],
        rows: data.materials.filter((item) => recordMatches(item, listSearch, classFilter)).map((item) => [item.title, getRelatedName(item.classId), item.type, item.description, item.content]),
      },
      "lesson-plans": {
        headers: ["Plano", "Turma", "Data", "Conteúdo"],
        rows: data.lessonPlans.filter((item) => recordMatches(item, listSearch, classFilter)).map((item) => [item.title, getRelatedName(item.classId), item.date, item.content]),
      },
      events: {
        headers: ["Evento", "Turma", "Data", "Descrição"],
        rows: data.events.filter((item) => recordMatches(item, listSearch, classFilter)).map((item) => [item.title, getRelatedName(item.classId), item.date, item.description]),
      },
      evaluations: {
        headers: ["Avaliação", "Turma", "Data", "Nota", "Feedback"],
        rows: data.evaluations.filter((item) => recordMatches(item, listSearch, classFilter)).map((item) => [item.title, getRelatedName(item.classId), item.date, item.grade, item.feedback]),
      },
      attendance: {
        headers: ["Data", "Turma", "Presença"],
        rows: data.attendance.filter((item) => recordMatches(item, listSearch, classFilter)).map((item) => [item.date, getRelatedName(item.classId), item.present ? "Presente" : "Ausente"]),
      },
      notifications: {
        headers: ["Notificação", "Turma", "Data", "Lida"],
        rows: visibleNotifications.map((item) => [item.title, getRelatedName(item.classId), item.createdAt, item.data?.read === true ? "Sim" : "Não"]),
      },
    };
    const sectionData = sections[section];
    if (!sectionData) return;
    const csv = [sectionData.headers, ...sectionData.rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `meus-${section}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function submitLgpdRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    setError("");
    try {
      const result = await adminRequest<{ request: StudentLgpdRequest }>("/student/lgpd-requests", token, "POST", {
        type: lgpdRequestType,
        description: lgpdDescription,
      });
      setData((current) => current
        ? { ...current, lgpdRequests: [result.request, ...current.lgpdRequests] }
        : current);
      setLgpdDescription("");
      setSuccess("Solicitação registrada. Você pode acompanhar o andamento nesta página.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível registrar sua solicitação.");
    } finally {
      setSaving(false);
    }
  }

  async function downloadApprovedPortability(requestId: string) {
    if (!token) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL ?? "/api/v1"}/student/lgpd-requests/${encodeURIComponent(requestId)}/export`,
        { credentials: "include", headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) {
        const text = await response.text();
        let message = "Não foi possível baixar os dados autorizados.";
        if (text) {
          try {
            const result = JSON.parse(text) as { message?: string };
            message = result.message ?? message;
          } catch {
            throw new Error(`A API retornou uma resposta inválida (HTTP ${response.status}).`);
          }
        }
        throw new Error(message);
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "meus-dados-aluno-atleta.json";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSuccess("Arquivo com seus dados baixado.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível baixar os dados autorizados.");
    } finally {
      setSaving(false);
    }
  }

  if (!token || getTokenRole(token) !== "ALUNO") {
    return (
      <main className="admin-access-denied">
        <section><SchoolRounded /><h1>Área do aluno</h1><p>Entre com uma conta de aluno aprovada para continuar.</p><Button component={Link} to="/login" variant="contained">Entrar</Button></section>
      </main>
    );
  }

  const currentSection = sectionInfo[section];
  const name = data?.student.fullName ?? localStorage.getItem("aluno-atleta-name") ?? "Aluno";
  const notificationRows = data?.notifications ?? [];
  const isListSection = ["tasks", "materials", "lesson-plans", "events", "evaluations", "attendance", "notifications"].includes(section);

  return (
    <main className="admin-shell student-dashboard-shell">
      {mobileMenuOpen && <button className="admin-sidebar-scrim" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)} />}
      <aside className={`admin-sidebar${mobileMenuOpen ? " is-open" : ""}`}>
        <Link to="/" className="admin-brand" aria-label="Voltar ao site">
          <BrandLogo className="brand-logo admin-logo" /><span>ÁREA <b>ALUNO</b></span>
        </Link>
        <span className="admin-nav-label">MINHA ÁREA</span>
        <nav className="admin-navigation" aria-label="Navegação do aluno">
          {navItems.slice(0, 1).map(({ key, label, Icon }) => <button key={key} className={section === key ? "active" : ""} onClick={() => changeSection(key)}><Icon />{label}</button>)}
        </nav>
        <span className="admin-nav-label admin-nav-label-secondary">APRENDIZAGEM</span>
        <nav className="admin-navigation admin-navigation-muted" aria-label="Atividades e conteúdos">
          {navItems.slice(1, 7).map(({ key, label, Icon }) => <button key={key} className={section === key ? "active" : ""} onClick={() => changeSection(key)}><Icon />{label}{key === "tasks" && pendingTasks.length > 0 && <span className="admin-nav-count">{pendingTasks.length}</span>}</button>)}
        </nav>
        <span className="admin-nav-label admin-nav-label-secondary">CONTA</span>
        <nav className="admin-navigation admin-navigation-muted">
          {navItems.slice(7).map(({ key, label, Icon }) => <button key={key} className={section === key ? "active" : ""} onClick={() => changeSection(key)}><Icon />{label}{key === "notifications" && unreadNotifications > 0 && <span className="admin-nav-count">{unreadNotifications}</span>}</button>)}
        </nav>
        <div className="admin-sidebar-bottom">
          <div className="admin-security-note"><CheckCircleRounded /><span><b>Área do aluno</b><small>Conteúdos das suas turmas</small></span></div>
          <button className="admin-signout" onClick={signOut}><LogoutRounded /> Sair</button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <button className="admin-mobile-menu" aria-label="Abrir menu" onClick={() => setMobileMenuOpen(true)}><MenuRounded /></button>
          <div className="admin-breadcrumb"><span>Aluno</span><b>/</b><strong>{currentSection.title}</strong></div>
          <div className="admin-topbar-actions">
            <Link to="/" className="admin-public-link">Ver site <SyncRounded /></Link>
            <button className="admin-icon-button" aria-label="Ver notificações" onClick={() => changeSection("notifications")}>
              <NotificationsNoneRounded />{unreadNotifications > 0 && <span className="admin-notification-count">{unreadNotifications}</span>}
            </button>
            <span className="admin-avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
          </div>
        </header>

        <div className="admin-content">
          <div className="admin-welcome">
            <div><span className="admin-eyebrow">PAINEL DO ALUNO</span><h1>{section === "overview" ? `Olá, ${name.split(" ")[0]}!` : currentSection.title}</h1><p>{currentSection.description}</p></div>
            <div className="student-page-actions">
              {isListSection && <Button variant="outlined" startIcon={<DownloadRounded />} onClick={exportCurrentSection}>Exportar CSV</Button>}
              <Button className="admin-refresh" variant="outlined" startIcon={<SyncRounded />} onClick={() => void loadData()}>Atualizar</Button>
            </div>
          </div>
          {error && <Alert severity="error" className="admin-alert">{error}</Alert>}
          {success && <Alert severity="success" className="admin-alert" onClose={() => setSuccess("")}>{success}</Alert>}
          {isListSection && (
            <div className="student-list-toolbar admin-panel">
              <TextField
                label="Buscar nesta lista"
                value={listSearch}
                onChange={(event) => setListSearch(event.target.value)}
                size="small"
                fullWidth
              />
              <select aria-label="Filtrar por turma" value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
                <option value="">Todas as turmas</option>
                {data?.classes.map((sportsClass) => <option key={sportsClass._id} value={sportsClass._id}>{sportsClass.name}</option>)}
              </select>
              {section === "tasks" && (
                <select aria-label="Filtrar tarefas por situação" value={taskFilter} onChange={(event) => setTaskFilter(event.target.value as TaskFilter)}>
                  <option value="all">Todas as situações</option>
                  <option value="pending">Pendentes</option>
                  <option value="submitted">Entregues</option>
                  <option value="graded">Corrigidas</option>
                </select>
              )}
              {section === "notifications" && (
                <select aria-label="Filtrar notificações" value={notificationFilter} onChange={(event) => setNotificationFilter(event.target.value as NotificationFilter)}>
                  <option value="all">Todas</option>
                  <option value="unread">Não lidas</option>
                  <option value="read">Lidas</option>
                </select>
              )}
            </div>
          )}
          {loading && !data ? <div className="admin-loading"><CircularProgress size={28} /><span>Carregando seu painel...</span></div> : data && (
            <>
              {section === "overview" && (
                <>
                  <section className="admin-stats-grid student-stats-grid">
                    <StudentStat Icon={FactCheckRounded} label="Frequência" value={attendanceRate === null ? "—" : `${attendanceRate}%`} detail={`${data.attendance.length} registros`} tone="approved" />
                    <StudentStat Icon={AssignmentRounded} label="Tarefas pendentes" value={pendingTasks.length} detail="Aguardando sua resposta" tone="pending" />
                    <StudentStat Icon={EventRounded} label="Próximo evento" value={nextEvent?.title ?? "—"} detail={nextEvent?.date ? formatStudentDate(nextEvent.date) : "Nenhum evento agendado"} tone="total" />
                    <StudentStat Icon={TaskAltRounded} label="Última avaliação" value={lastEvaluation?.grade === undefined ? "—" : `${lastEvaluation.grade}/10`} detail={lastEvaluation?.title ?? "Nenhuma nota registrada"} tone="rejected" />
                  </section>
                  <section className="admin-panel student-progress-panel">
                    <div className="admin-panel-heading">
                      <div><span className="admin-eyebrow">ACOMPANHAMENTO</span><h2>Sua evolução</h2><p>Frequência e médias das avaliações nos últimos seis meses.</p></div>
                    </div>
                    <div className="student-progress-chart" role="img" aria-label="Gráfico mensal de frequência e notas">
                      {monthlyAttendance.map((month) => (
                        <div className="student-progress-month" key={month.label}>
                          <div className="student-progress-bars">
                            <span className="student-progress-bar attendance" style={{ height: `${month.attendance ?? 0}%` }} title={month.attendance === null ? "Sem dados de frequência" : `Frequência ${month.attendance}%`} />
                            <span className="student-progress-bar grade" style={{ height: `${month.grade === null ? 0 : month.grade * 10}%` }} title={month.grade === null ? "Sem notas" : `Média ${month.grade.toFixed(1)}/10`} />
                          </div>
                          <small>{month.label}</small>
                        </div>
                      ))}
                    </div>
                    <div className="student-progress-legend"><span><i className="attendance" /> Frequência</span><span><i className="grade" /> Nota média</span></div>
                  </section>
                  <div className="student-dashboard-columns">
                    <section className="admin-panel">
                      <div className="admin-panel-heading"><div><span className="admin-eyebrow">ATIVIDADES</span><h2>Tarefas para responder</h2><p>Atividades com resposta pela plataforma.</p></div><Button onClick={() => changeSection("tasks")}>Ver tarefas</Button></div>
                      {pendingTasks.filter((task) => task.allowResponse).slice(0, 5).map((task) => <StudentRecordRow key={task._id} item={task} meta={`${getRelatedName(task.classId)} · ${formatStudentDate(task.dueDate)}`} Icon={AssignmentRounded} onView={() => setSelectedRecord(task)} action={<Button size="small" variant="outlined" onClick={() => openTask(task)}>Responder</Button>} />)}
                      {!pendingTasks.some((task) => task.allowResponse) && <EmptyMessage text="Nenhuma tarefa aguardando resposta." />}
                    </section>
                    <section className="admin-panel">
                      <div className="admin-panel-heading"><div><span className="admin-eyebrow">COMUNICADOS</span><h2>Notificações recentes</h2><p>Avisos enviados pelos professores.</p></div><Button onClick={() => changeSection("notifications")}>Ver todas</Button></div>
                      {notificationRows.slice(0, 5).map((item) => <StudentRecordRow key={item._id} item={item} meta={`${getRelatedName(item.classId)} · ${formatStudentDate(item.createdAt)}`} Icon={NotificationsRounded} onView={() => setSelectedRecord(item)} />)}
                      {!notificationRows.length && <EmptyMessage text="Nenhum comunicado recebido." />}
                    </section>
                    <section className="admin-panel">
                      <div className="admin-panel-heading"><div><span className="admin-eyebrow">AGENDA</span><h2>Próximos eventos</h2><p>Programação das suas turmas.</p></div><Button onClick={() => changeSection("events")}>Ver agenda</Button></div>
                      {(data.events.filter((item) => item.date && new Date(item.date) >= new Date()).slice(0, 5)).map((item) => <StudentRecordRow key={item._id} item={item} meta={`${getRelatedName(item.classId)} · ${formatStudentDate(item.date)}`} Icon={EventRounded} onView={() => setSelectedRecord(item)} />)}
                      {!data.events.some((item) => item.date && new Date(item.date) >= new Date()) && <EmptyMessage text="Nenhum evento próximo cadastrado." />}
                    </section>
                    <section className="admin-panel">
                      <div className="admin-panel-heading"><div><span className="admin-eyebrow">TURMAS</span><h2>Minhas turmas</h2><p>Modalidades em que você está inscrito.</p></div></div>
                      {data.classes.map((sportsClass) => <StudentRecordRow key={sportsClass._id} item={{ _id: sportsClass._id, title: sportsClass.name, type: sportsClass.modality }} meta={sportsClass.modality} Icon={ClassRounded} onView={() => setSelectedRecord({ _id: sportsClass._id, title: sportsClass.name, type: sportsClass.modality })} />)}
                      {!data.classes.length && <EmptyMessage text="Você ainda não está vinculado a uma turma." />}
                    </section>
                  </div>
                </>
              )}
              {section === "tasks" && <StudentRecordList items={visibleTasks} emptyText="Nenhuma tarefa corresponde aos filtros." render={(task) => (
                <StudentRecordRow key={task._id} item={task} meta={`${getRelatedName(task.classId)} · Prazo: ${formatStudentDate(task.dueDate)}`} Icon={AssignmentRounded}
                  onView={() => setSelectedRecord(task)}
                  detail={task.response ? <span className={`student-record-status${task.response.grade !== undefined ? " is-done" : ""}`}>{task.response.grade !== undefined ? `Nota ${task.response.grade}` : "Resposta enviada"}</span> : null}
                  action={task.allowResponse && task.response?.grade === undefined ? <Button size="small" variant="outlined" onClick={() => openTask(task)}>{task.response ? "Editar resposta" : "Responder"}</Button> : null}
                  extra={task.response?.feedback ? <small className="student-record-feedback">Feedback: {task.response.feedback}</small> : undefined}
                />
              )} />}
              {section === "materials" && <StudentRecordList items={data.materials.filter((item) => recordMatches(item, listSearch, classFilter))} emptyText="Nenhum material corresponde aos filtros." render={(item) => <StudentRecordRow key={item._id} item={item} meta={`${getRelatedName(item.classId)} · ${formatStudentDate(item.createdAt)}`} Icon={ArticleRounded} onView={() => setSelectedRecord(item)} contentLink />} />}
              {section === "lesson-plans" && <StudentRecordList items={data.lessonPlans.filter((item) => recordMatches(item, listSearch, classFilter))} emptyText="Nenhum plano de aula corresponde aos filtros." render={(item) => <StudentRecordRow key={item._id} item={item} meta={`${getRelatedName(item.classId)} · ${formatStudentDate(item.date)}`} Icon={CalendarMonthRounded} onView={() => setSelectedRecord(item)} showContent />} />}
              {section === "events" && <StudentRecordList items={data.events.filter((item) => recordMatches(item, listSearch, classFilter))} emptyText="Nenhum evento corresponde aos filtros." render={(item) => <StudentRecordRow key={item._id} item={item} meta={`${getRelatedName(item.classId)} · ${formatStudentDate(item.date)}`} Icon={EventRounded} onView={() => setSelectedRecord(item)} showContent />} />}
              {section === "evaluations" && <StudentRecordList items={data.evaluations.filter((item) => recordMatches(item, listSearch, classFilter))} emptyText="Nenhuma avaliação corresponde aos filtros." render={(item) => <StudentRecordRow key={item._id} item={item} meta={`${getRelatedName(item.classId)} · ${formatStudentDate(item.date)}`} Icon={TaskAltRounded} onView={() => setSelectedRecord(item)} detail={<span className="student-record-grade">{item.grade === undefined ? "Sem nota" : `${item.grade}/10`}</span>} extra={item.feedback ? <small className="student-record-feedback">Feedback: {item.feedback}</small> : undefined} showContent />} />}
              {section === "attendance" && <StudentRecordList items={data.attendance.filter((item) => recordMatches(item, listSearch, classFilter))} emptyText="Nenhum registro de frequência corresponde aos filtros." render={(item) => <StudentRecordRow key={item._id} item={{ ...item, title: item.present ? "Presente" : "Ausente" }} meta={`${getRelatedName(item.classId)} · ${formatStudentDate(item.date)}`} Icon={FactCheckRounded} onView={() => setSelectedRecord(item)} detail={<span className={`student-record-status${item.present ? " is-done" : " is-absent"}`}>{item.present ? "Presente" : "Ausente"}</span>} />} />}
              {section === "notifications" && <StudentRecordList items={visibleNotifications} emptyText="Nenhuma notificação corresponde aos filtros." render={(item) => <StudentRecordRow key={item._id} item={item} meta={`${getRelatedName(item.classId)} · ${formatStudentDate(item.createdAt)}`} Icon={NotificationsRounded} onView={() => setSelectedRecord(item)} showContent detail={item.data?.read !== true ? <span className="student-record-status">Não lida</span> : <span className="student-record-status is-done">Lida</span>} action={item.data?.read !== true ? <Button size="small" variant="outlined" startIcon={<DoneAllRounded />} onClick={() => void markNotificationRead(item._id)}>Marcar como lida</Button> : null} />} />}
              {section === "profile" && (
                <div className="student-dashboard-columns">
                  <section className="admin-panel">
                    <form className="student-profile-form" onSubmit={(event) => void saveProfile(event)}>
                      <div className="admin-panel-heading"><div><span className="admin-eyebrow">DADOS DA CONTA</span><h2>Meu perfil</h2><p>Atualize seus dados pessoais. Para alterar a foto, fale com a equipe do projeto.</p></div></div>
                      <TextField label="Nome completo" value={profileForm.fullName} onChange={(event) => setProfileForm({ ...profileForm, fullName: event.target.value })} required inputProps={{ maxLength: 140 }} />
                      <TextField label="E-mail" value={data.student.email} disabled helperText="Para alterar o e-mail, entre em contato com a equipe." />
                      <TextField label="Idade" type="number" value={profileForm.age} onChange={(event) => setProfileForm({ ...profileForm, age: event.target.value })} inputProps={{ min: 4, max: 99 }} />
                      <TextField label="Data de nascimento" type="date" value={profileForm.birthDate} onChange={(event) => setProfileForm({ ...profileForm, birthDate: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                      <TextField label="Gênero" select value={profileForm.gender} onChange={(event) => setProfileForm({ ...profileForm, gender: event.target.value })}>
                        <MenuItem value="">Não informado</MenuItem>
                        {["Feminino", "Masculino", "Outro", "Prefiro não informar"].map((gender) => <MenuItem key={gender} value={gender}>{gender}</MenuItem>)}
                      </TextField>
                      <TextField label="Modalidade" value={profileForm.modality} onChange={(event) => setProfileForm({ ...profileForm, modality: event.target.value })} inputProps={{ maxLength: 60 }} />
                      <TextField label="Escola" value={profileForm.school} onChange={(event) => setProfileForm({ ...profileForm, school: event.target.value })} inputProps={{ maxLength: 160 }} />
                      <TextField label="Bairro" value={profileForm.neighborhood} onChange={(event) => setProfileForm({ ...profileForm, neighborhood: event.target.value })} />
                      <TextField label="Cidade" value={profileForm.city} onChange={(event) => setProfileForm({ ...profileForm, city: event.target.value })} />
                      <TextField label="Rua" value={profileForm.street} onChange={(event) => setProfileForm({ ...profileForm, street: event.target.value })} />
                      <TextField label="Número" value={profileForm.number} onChange={(event) => setProfileForm({ ...profileForm, number: event.target.value })} />
                      <TextField label="Complemento" value={profileForm.complement} onChange={(event) => setProfileForm({ ...profileForm, complement: event.target.value })} />
                      <TextField label="Nome do responsável" value={profileForm.guardianName} onChange={(event) => setProfileForm({ ...profileForm, guardianName: event.target.value })} />
                      <TextField label="Telefone do responsável" value={profileForm.guardianPhone} onChange={(event) => setProfileForm({ ...profileForm, guardianPhone: event.target.value })} />
                      <Button type="submit" variant="contained" startIcon={<SaveRounded />} disabled={saving}>{saving ? "Salvando..." : "Salvar perfil"}</Button>
                    </form>
                  </section>
                  <section className="admin-panel">
                    <div className="admin-panel-heading"><div><span className="admin-eyebrow">VÍNCULOS</span><h2>Minhas turmas</h2><p>Turmas vinculadas à sua inscrição.</p></div></div>
                    {data.classes.map((sportsClass) => <StudentRecordRow key={sportsClass._id} item={{ _id: sportsClass._id, title: sportsClass.name, type: sportsClass.modality }} meta={sportsClass.modality} Icon={ClassRounded} onView={() => setSelectedRecord({ _id: sportsClass._id, title: sportsClass.name, type: sportsClass.modality })} />)}
                    {!data.classes.length && <EmptyMessage text="Você ainda não está vinculado a uma turma." />}
                    <div className="student-terms-summary">
                      <h3>Termos aceitos</h3>
                      <p>Versão {data.student.termsVersion ?? "não informada"}</p>
                      <small>{data.student.termsAcceptedAt ? `Aceitos em ${formatStudentDate(data.student.termsAcceptedAt)}` : "Não há registro de aceite."}</small>
                      <Link to="/termos">Consultar termos de uso</Link>
                      <Link to="/privacidade">Consultar política de privacidade</Link>
                    </div>
                    <form className="student-password-form" onSubmit={(event) => void changePassword(event)}>
                      <h3><KeyRounded /> Alterar senha</h3>
                      <TextField label="Senha atual" type="password" autoComplete="current-password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} required />
                      <TextField label="Nova senha" type="password" autoComplete="new-password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} required helperText="Mínimo de 10 caracteres." />
                      <Button type="submit" variant="outlined" disabled={saving}>{saving ? "Atualizando..." : "Atualizar senha"}</Button>
                    </form>
                  </section>
                </div>
              )}
              {section === "privacy" && (
                <div className="student-dashboard-columns">
                  <section className="admin-panel student-privacy-panel">
                    <div className="admin-panel-heading">
                      <div><span className="admin-eyebrow">PORTABILIDADE</span><h2>Seus dados pessoais</h2><p>Para baixar uma cópia dos seus dados, solicite a portabilidade. A administração analisará o pedido e liberará o arquivo se aprovado.</p></div>
                    </div>
                    <div className="student-privacy-summary">
                      <span>{data.classes.length} turmas</span>
                      <span>{data.tasks.length} tarefas</span>
                      <span>{data.attendance.length} presenças</span>
                      <span>{data.evaluations.length} avaliações</span>
                    </div>
                    <h3>Solicitar atendimento</h3>
                    <p className="student-privacy-copy">As solicitações ficam vinculadas à sua conta e registradas para acompanhamento pela equipe responsável. Se você for menor de idade, peça ajuda ao seu responsável.</p>
                    <form className="student-lgpd-form" onSubmit={(event) => void submitLgpdRequest(event)}>
                      <TextField label="Tipo de solicitação" select value={lgpdRequestType} onChange={(event) => setLgpdRequestType(event.target.value as LgpdRequestType)}>
                        {Object.entries(lgpdRequestLabels).map(([type, label]) => <MenuItem key={type} value={type}>{label}</MenuItem>)}
                      </TextField>
                      {lgpdRequestType === "portability" && <Alert severity="info">O arquivo ficará disponível nesta página somente após análise e aprovação da administração.</Alert>}
                      <TextField label="Detalhes (opcional)" value={lgpdDescription} onChange={(event) => setLgpdDescription(event.target.value)} multiline minRows={3} inputProps={{ maxLength: 2000 }} helperText={`${lgpdDescription.length}/2000`} />
                      <Button type="submit" variant="outlined" disabled={saving}>{saving ? "Enviando..." : lgpdRequestType === "portability" ? "Solicitar portabilidade" : "Registrar solicitação"}</Button>
                    </form>
                  </section>
                  <section className="admin-panel">
                    <div className="admin-panel-heading"><div><span className="admin-eyebrow">ACOMPANHAMENTO</span><h2>Histórico de solicitações</h2><p>Pedidos associados à sua conta.</p></div></div>
                    <div className="admin-management-list">
                      {data.lgpdRequests.map((item) => (
                        <article className="admin-management-row student-record-row" key={item._id}>
                          <span className="admin-management-icon"><PrivacyTipRounded /></span>
                          <span className="admin-management-identity"><b>{lgpdRequestLabels[item.type]}</b><small>{item.description || "Sem detalhes adicionais."}</small>{item.responseNote && <small>Resposta da administração: {item.responseNote}</small>}</span>
                          <span className="admin-management-detail">{lgpdRequestStatusLabel(item.status)}<small>{formatStudentDate(item.createdAt)}</small></span>
                          {item.type === "portability" && item.status === "completed" && <Button size="small" variant="contained" startIcon={<DownloadRounded />} disabled={saving} onClick={() => void downloadApprovedPortability(item._id)}>Baixar JSON</Button>}
                        </article>
                      ))}
                      {!data.lgpdRequests.length && <EmptyMessage text="Você ainda não registrou solicitações." />}
                    </div>
                  </section>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Dialog open={Boolean(taskTarget)} onClose={() => !saving && setTaskTarget(null)} fullWidth maxWidth="sm">
        <form onSubmit={(event) => void submitTaskResponse(event)}>
          <DialogTitle>{taskTarget?.response ? "Atualizar resposta" : "Responder tarefa"}</DialogTitle>
          <DialogContent className="admin-editor-fields">
            <p className="admin-dialog-copy">{taskTarget?.title} · {getRelatedName(taskTarget?.classId)}</p>
            {taskTarget?.description && <p className="admin-dialog-copy">{taskTarget.description}</p>}
            <TextField autoFocus label="Sua resposta" value={taskResponse} onChange={(event) => setTaskResponse(event.target.value)} required multiline minRows={5} inputProps={{ maxLength: 12000 }} helperText={`${taskResponse.length}/12000`} />
          </DialogContent>
          <DialogActions className="admin-dialog-actions"><Button onClick={() => setTaskTarget(null)} disabled={saving}>Cancelar</Button><Button type="submit" variant="contained" startIcon={<SendRounded />} disabled={saving}>{saving ? "Enviando..." : "Enviar resposta"}</Button></DialogActions>
        </form>
      </Dialog>
      <Dialog open={Boolean(selectedRecord)} onClose={() => setSelectedRecord(null)} fullWidth maxWidth="sm">
        <DialogTitle>Detalhes: {selectedRecord?.title ?? "Registro"}</DialogTitle>
        <DialogContent className="admin-editor-fields">
          {selectedRecord?.classId && <p className="admin-dialog-copy">Turma: {getRelatedName(selectedRecord.classId)}</p>}
          {selectedRecord?.date && <p className="admin-dialog-copy">Data: {formatStudentDate(selectedRecord.date)}</p>}
          {selectedRecord?.dueDate && <p className="admin-dialog-copy">Prazo: {formatStudentDate(selectedRecord.dueDate)}</p>}
          {selectedRecord?.type && <p className="admin-dialog-copy">Tipo: {selectedRecord.type}</p>}
          {selectedRecord?.description && <div className="admin-dialog-copy"><b>Descrição</b><p>{selectedRecord.description}</p></div>}
          {selectedRecord?.content && <div className="admin-dialog-copy"><b>Conteúdo</b><p>{selectedRecord.content}</p></div>}
          {selectedRecord?.allowResponse !== undefined && <p className="admin-dialog-copy">Resposta pela plataforma: {selectedRecord.allowResponse ? "Permitida" : "Não permitida"}</p>}
          {selectedRecord?.response && (
            <div className="admin-dialog-copy">
              <b>Sua resposta</b>
              <p>{selectedRecord.response.content || "Resposta enviada."}</p>
              {selectedRecord.response.grade !== undefined && <p>Nota: {selectedRecord.response.grade}/10</p>}
              {selectedRecord.response.feedback && <p>Feedback: {selectedRecord.response.feedback}</p>}
            </div>
          )}
          {selectedRecord?.grade !== undefined && <p className="admin-dialog-copy">Nota: {selectedRecord.grade}/10</p>}
          {selectedRecord?.feedback && <div className="admin-dialog-copy"><b>Feedback</b><p>{selectedRecord.feedback}</p></div>}
          {selectedRecord && "present" in selectedRecord && <p className="admin-dialog-copy">Presença: {selectedRecord.present ? "Presente" : "Ausente"}</p>}
          {selectedRecord?.data?.read !== undefined && <p className="admin-dialog-copy">Notificação: {selectedRecord.data.read ? "Lida" : "Não lida"}</p>}
          {!selectedRecord?.description && !selectedRecord?.content && !selectedRecord?.feedback && !selectedRecord?.type && !selectedRecord?.date && !selectedRecord?.dueDate && selectedRecord?.grade === undefined && !selectedRecord?.response && !selectedRecord?.present && <p className="admin-dialog-copy">Sem detalhes adicionais cadastrados.</p>}
        </DialogContent>
        <DialogActions className="admin-dialog-actions"><Button onClick={() => setSelectedRecord(null)}>Fechar</Button></DialogActions>
      </Dialog>
    </main>
  );
}

function StudentStat({ Icon, label, value, detail, tone }: {
  Icon: typeof ClassRounded;
  label: string;
  value: number | string;
  detail: string;
  tone: "total" | "pending" | "approved" | "rejected";
}) {
  return <article className="admin-stat-card"><span className={`admin-stat-icon stat-${tone}`}><Icon /></span><span className="admin-stat-label">{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function StudentRecordList<T extends StudentRecord>({ items, emptyText, render }: {
  items: T[];
  emptyText: string;
  render: (item: T) => React.ReactNode;
}) {
  return <section className="admin-panel admin-management-panel"><div className="admin-management-list">{items.map(render)}{!items.length && <EmptyMessage text={emptyText} />}</div></section>;
}

function StudentRecordRow({ item, meta, Icon, action, detail, extra, onView, showContent = false, contentLink = false }: {
  item: StudentRecord & { title?: string };
  meta: string;
  Icon: typeof ClassRounded;
  action?: React.ReactNode;
  detail?: React.ReactNode;
  extra?: React.ReactNode;
  onView?: () => void;
  showContent?: boolean;
  contentLink?: boolean;
}) {
  const content = item.content?.trim() ?? "";
  const link = contentLink && /^https?:\/\/\S+$/i.test(content);
  return (
    <article className="admin-management-row student-record-row">
      <span className="admin-management-icon"><Icon /></span>
      <span className="admin-management-identity"><b>{item.title ?? "Sem título"}</b><small>{item.description || (showContent && content && !link ? content : "")}</small>{extra}</span>
      <span className="admin-management-detail">{meta}{detail}</span>
      {(link || onView || action) && (
        <span className="student-record-tools">
          {link && <a className="student-record-link" href={content} target="_blank" rel="noreferrer"><VisibilityRounded /> Abrir</a>}
          {(onView || action) && <span className="admin-management-actions">{onView && <button aria-label={`Ver detalhes de ${item.title ?? "registro"}`} onClick={onView}><VisibilityRounded /></button>}{action}</span>}
        </span>
      )}
    </article>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return <div className="admin-management-empty"><SchoolRounded /><span>{text}</span></div>;
}
