import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  ArrowForwardRounded,
  AssignmentTurnedInRounded,
  ArticleRounded,
  CheckCircleRounded,
  ClassRounded,
  CloseRounded,
  DashboardRounded,
  GroupsRounded,
  InsightsRounded,
  KeyRounded,
  LogoutRounded,
  MenuRounded,
  ManageSearchRounded,
  NotificationsNoneRounded,
  PersonAddAltRounded,
  PrivacyTipRounded,
  SearchRounded,
  ShieldRounded,
  SportsSoccerRounded,
  SyncRounded,
  VisibilityOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Switch,
  TextField,
} from "@mui/material";
import { BrandLogo } from "../components/BrandLogo";
import { AdminPasswordDialog } from "../components/AdminPasswordDialog";
import { AdminManagementPage, type ManagementSection } from "./AdminManagementPage";
import { AdminContentPage } from "./AdminContentPage";
import { SystemLogsPage } from "./SystemLogsPage";
import { StudentDashboardPage } from "./StudentDashboardPage";
import { TeacherClassesPage } from "./TeacherClassesPage";

type StudentStatus = "pendente" | "aprovado" | "recusado";
type StatusFilter = "todos" | StudentStatus;
type AdminSection = "overview" | "registrations" | "students" | "password-requests" | "content" | "logs" | ManagementSection;

interface Student {
  _id: string;
  fullName: string;
  email: string;
  status?: StudentStatus;
  age?: number;
  modality?: string;
  createdAt: string;
}

interface StudentDetails extends Student {
  birthDate?: string;
  gender?: string;
  school?: string;
  address?: {
    neighborhood?: string;
    city?: string;
    street?: string;
    number?: string;
    complement?: string;
  };
  guardian?: { name?: string; phone?: string };
  classes: Array<{ id: string; name: string; requirements: string[] }>;
  documents: { photoUrl: string | null; signedFormUrl: string | null };
  termsAcceptedAt?: string;
  termsVersion?: string;
  rejectionReason?: string;
  rejectionReasons?: string[];
  rejectionOtherReason?: string;
}

interface StudentList {
  rows: Student[];
  total: number;
  page: number;
  pageSize: number;
}

interface PasswordResetRequest {
  id: string;
  status: "pending" | "completed" | "rejected";
  requestedAt: string;
  resolvedAt?: string;
  user: { id: string; fullName: string; email: string; active: boolean } | null;
}

interface PasswordResetRequestList {
  pendingCount: number;
  requests: PasswordResetRequest[];
}

interface ApiError {
  message?: string;
}

const API_BASE = import.meta.env.VITE_API_URL ?? "/api/v1";
const pageSize = 12;

async function adminRequest<T>(path: string, token: string, method: "GET" | "PATCH" = "GET", body?: unknown) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let result: (T & ApiError) | undefined;
  if (text) {
    try {
      result = JSON.parse(text) as T & ApiError;
    } catch {
      throw new Error(`A API retornou uma resposta inválida (HTTP ${response.status}).`);
    }
  }
  if (!result) {
    throw new Error(`A API retornou uma resposta vazia (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(result.message ?? "Não foi possível concluir a solicitação.");
  }
  return result;
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

const statusNames: Record<StudentStatus, string> = {
  pendente: "Em análise",
  aprovado: "Aprovado",
  recusado: "Recusado",
};

export function DashboardPage() {
  const token = localStorage.getItem("aluno-atleta-token");
  if (token && getTokenRole(token) === "PROFESSOR") return <TeacherClassesPage />;
  if (token && getTokenRole(token) === "ALUNO") return <StudentDashboardPage />;
  return <AdminDashboardPage />;
}

function AdminDashboardPage() {
  const token = localStorage.getItem("aluno-atleta-token");
  const role = token ? getTokenRole(token) : undefined;
  const navigate = useNavigate();
  const [section, setSection] = useState<AdminSection>("overview");
  const isManagementSection = section === "team" || section === "modalities" || section === "classes" ||
    section === "reports" || section === "content" || section === "logs" || section === "lgpd";
  const [activeFilter, setActiveFilter] = useState<StatusFilter>("todos");
  const [list, setList] = useState<StudentList>({ rows: [], total: 0, page: 1, pageSize });
  const [counts, setCounts] = useState({ total: 0, pendente: 0, aprovado: 0, recusado: 0 });
  const [passwordRequests, setPasswordRequests] = useState<PasswordResetRequest[]>([]);
  const [passwordRequestCount, setPasswordRequestCount] = useState(0);
  const [searchText, setSearchText] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState("");
  const [reviewTarget, setReviewTarget] = useState<StudentDetails | null>(null);
  const [reviewEnabled, setReviewEnabled] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedRejectionReasons, setSelectedRejectionReasons] = useState<string[]>([]);
  const [otherRejectionReason, setOtherRejectionReason] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<Pick<Student, "_id" | "fullName"> | null>(null);
  const [resetRequestTarget, setResetRequestTarget] = useState<PasswordResetRequest | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const loadRows = useCallback(async (filter: StatusFilter, search: string, page: number) => {
    if (!token) return;
    setListLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (filter !== "todos") params.set("status", filter);
      if (search) params.set("search", search);
      const result = await adminRequest<StudentList>(`/students?${params.toString()}`, token);
      setList(result);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar os alunos.");
    } finally {
      setListLoading(false);
    }
  }, [token]);

  const loadSummary = useCallback(async () => {
    if (!token) return;
    const getCount = async (status: StudentStatus) => {
      const query = new URLSearchParams({ status, page: "1", pageSize: "1" });
      const result = await adminRequest<StudentList>(`/students?${query}`, token);
      return result.total;
    };
    const [pendente, aprovado, recusado] = await Promise.all([
      getCount("pendente"),
      getCount("aprovado"),
      getCount("recusado"),
    ]);
    setCounts({ total: pendente + aprovado + recusado, pendente, aprovado, recusado });
  }, [token]);

  const loadPasswordRequests = useCallback(async () => {
    if (!token) return;
    try {
      const result = await adminRequest<PasswordResetRequestList>("/admin/password-reset-requests", token);
      setPasswordRequests(result.requests);
      setPasswordRequestCount(result.pendingCount);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar as solicitações de senha.");
    }
  }, [token]);

  useEffect(() => {
    let active = true;
    async function initialize() {
      setLoading(true);
      try {
        await Promise.all([
          loadSummary(),
          loadRows("todos", "", 1),
          loadPasswordRequests(),
        ]);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Não foi possível carregar os dados administrativos.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialize();
    return () => { active = false; };
  }, [loadPasswordRequests, loadRows, loadSummary]);

  useEffect(() => {
    const intervalId = window.setInterval(() => { void loadPasswordRequests(); }, 60_000);
    return () => window.clearInterval(intervalId);
  }, [loadPasswordRequests]);

  const pendingRows = useMemo(() => list.rows.filter((student) => student.status === "pendente"), [list.rows]);
  const greetingName = localStorage.getItem("aluno-atleta-name")?.split(" ")[0] || "Administração";

  function changeSection(next: AdminSection) {
    setSection(next);
    setMobileMenuOpen(false);
    const nextFilter = next === "registrations" ? "pendente" : "todos";
    setActiveFilter(nextFilter);
    setAppliedSearch("");
    setSearchText("");
    if (next === "overview" || next === "registrations" || next === "students") {
      void loadRows(nextFilter, "", 1);
    }
    if (next === "password-requests") void loadPasswordRequests();
  }

  function changeFilter(filter: StatusFilter) {
    setActiveFilter(filter);
    void loadRows(filter, appliedSearch, 1);
  }

  function searchStudents(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedSearch(searchText.trim());
    void loadRows(activeFilter, searchText.trim(), 1);
  }

  async function reviewStudent(status: "aprovado" | "recusado") {
    if (!token || !reviewTarget) return;
    setReviewing(true);
    setReviewError("");
    try {
      await adminRequest<Student>(
        `/students/${encodeURIComponent(reviewTarget._id)}/review`,
        token,
        "PATCH",
        {
          status,
          ...(status === "recusado" ? {
            rejectionReasons: selectedRejectionReasons,
            otherReason: otherRejectionReason.trim(),
          } : {}),
        },
      );
      setReviewTarget(null);
      setSelectedRejectionReasons([]);
      setOtherRejectionReason("");
      setReviewEnabled(false);
      await Promise.all([loadSummary(), loadRows(activeFilter, appliedSearch, list.page)]);
    } catch (reason) {
      setReviewError(reason instanceof Error ? reason.message : "Não foi possível analisar a inscrição.");
    } finally {
      setReviewing(false);
    }
  }

  async function openStudentDetails(student: Student, enableReview = false) {
    if (!token) return;
    setReviewTarget(null);
    setReviewEnabled(enableReview);
    setDetailLoading(true);
    setReviewError("");
    setSelectedRejectionReasons([]);
    setOtherRejectionReason("");
    try {
      const details = await adminRequest<StudentDetails>(
        `/students/${encodeURIComponent(student._id)}/details`,
        token,
      );
      setReviewTarget(details);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar os dados do aluno.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function changeStudentPassword(password: string) {
    if (!token || !passwordTarget) return;
    await adminRequest(
      `/admin/users/${encodeURIComponent(passwordTarget._id)}/password`,
      token,
      "PATCH",
      { newPassword: password },
    );
    setPasswordTarget(null);
  }

  async function completePasswordRequest(password: string) {
    if (!token || !resetRequestTarget) return;
    await adminRequest(
      `/admin/password-reset-requests/${encodeURIComponent(resetRequestTarget.id)}/complete`,
      token,
      "PATCH",
      { newPassword: password },
    );
    setResetRequestTarget(null);
    await loadPasswordRequests();
  }

  async function rejectPasswordRequest(requestId: string) {
    if (!token) return;
    await adminRequest(
      `/admin/password-reset-requests/${encodeURIComponent(requestId)}/reject`,
      token,
      "PATCH",
      {},
    );
    await loadPasswordRequests();
  }

  function signOut() {
    localStorage.removeItem("aluno-atleta-token");
    localStorage.removeItem("aluno-atleta-role");
    localStorage.removeItem("aluno-atleta-name");
    navigate("/login", { replace: true });
  }

  if (!token) return <Navigate to="/login" replace />;
  if (role !== "ADM") {
    return (
      <main className="admin-access-denied">
        <section>
          <ShieldRounded />
          <h1>Acesso administrativo</h1>
          <p>Esta área é exclusiva para contas de administração. Entre com uma conta ADM para continuar.</p>
          <Button component={Link} to="/" variant="contained">Voltar ao início</Button>
          <Button onClick={signOut}>Sair da conta</Button>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      {mobileMenuOpen && <button className="admin-sidebar-scrim" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)} />}
      <aside className={`admin-sidebar${mobileMenuOpen ? " is-open" : ""}`}>
        <Link to="/" className="admin-brand" aria-label="Voltar ao site">
          <BrandLogo className="brand-logo admin-logo" />
          <span>PAINEL <b>ADMIN</b></span>
        </Link>
        <span className="admin-nav-label">MENU PRINCIPAL</span>
        <nav className="admin-navigation" aria-label="Navegação administrativa">
          <button className={section === "overview" ? "active" : ""} onClick={() => changeSection("overview")}><DashboardRounded /> Visão geral</button>
          <button className={section === "registrations" ? "active" : ""} onClick={() => changeSection("registrations")}><AssignmentTurnedInRounded /> Inscrições <span className="admin-nav-count">{counts.pendente}</span></button>
          <button className={section === "students" ? "active" : ""} onClick={() => changeSection("students")}><GroupsRounded /> Alunos</button>
          <button className={section === "password-requests" ? "active" : ""} onClick={() => changeSection("password-requests")}><KeyRounded /> Solicitações de senha {passwordRequestCount > 0 && <span className="admin-nav-count">{passwordRequestCount}</span>}</button>
        </nav>
        <span className="admin-nav-label admin-nav-label-secondary">GESTÃO</span>
        <nav className="admin-navigation admin-navigation-muted" aria-label="Outras áreas de gestão">
          <button className={section === "team" ? "active" : ""} onClick={() => changeSection("team")}><PersonAddAltRounded /> Equipe</button>
          <button className={section === "modalities" ? "active" : ""} onClick={() => changeSection("modalities")}><SportsSoccerRounded /> Modalidades</button>
          <button className={section === "classes" ? "active" : ""} onClick={() => changeSection("classes")}><ClassRounded /> Turmas</button>
          <button className={section === "reports" ? "active" : ""} onClick={() => changeSection("reports")}><InsightsRounded /> Relatórios</button>
          <button className={section === "lgpd" ? "active" : ""} onClick={() => changeSection("lgpd")}><PrivacyTipRounded /> Solicitações LGPD</button>
          <button className={section === "content" ? "active" : ""} onClick={() => changeSection("content")}><ArticleRounded /> Conteúdo do site</button>
          <button className={section === "logs" ? "active" : ""} onClick={() => changeSection("logs")}><ManageSearchRounded /> Log do sistema</button>
        </nav>
        <div className="admin-sidebar-bottom">
          <div className="admin-security-note"><ShieldRounded /><span><b>Ambiente protegido</b><small>Acesso administrativo</small></span></div>
          <button className="admin-signout" onClick={signOut}><LogoutRounded /> Sair do painel</button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <button className="admin-mobile-menu" aria-label="Abrir menu" onClick={() => setMobileMenuOpen(true)}><MenuRounded /></button>
          <div className="admin-breadcrumb"><span>Painel</span><b>/</b><strong>{section === "overview" ? "Visão geral" : section === "registrations" ? "Inscrições" : section === "students" ? "Alunos" : section === "password-requests" ? "Solicitações de senha" : section === "team" ? "Equipe" : section === "modalities" ? "Modalidades" : section === "classes" ? "Turmas" : section === "reports" ? "Relatórios" : section === "lgpd" ? "Solicitações LGPD" : section === "content" ? "Conteúdo do site" : "Log do sistema"}</strong></div>
          <div className="admin-topbar-actions">
            <Link to="/" className="admin-public-link">Ver site <ArrowForwardRounded /></Link>
            <button className="admin-icon-button" aria-label={`${passwordRequestCount} solicitações de troca de senha`} onClick={() => changeSection("password-requests")}>
              <NotificationsNoneRounded />
              {passwordRequestCount > 0 && <span className="admin-notification-count">{passwordRequestCount > 99 ? "99+" : passwordRequestCount}</span>}
            </button>
            <span className="admin-avatar" aria-hidden="true">{greetingName.slice(0, 1).toUpperCase()}</span>
          </div>
        </header>

        <div className="admin-content">
          {!isManagementSection && (
            <div className="admin-welcome">
              <div>
                <span className="admin-eyebrow">PROJETO ALUNO / ATLETA</span>
                <h1>{section === "overview" ? `Olá, ${greetingName}!` : section === "registrations" ? "Análise de inscrições" : section === "students" ? "Gestão de alunos" : "Solicitações de troca de senha"}</h1>
                <p>{section === "overview" ? "Acompanhe os principais indicadores e as atividades do projeto." : section === "registrations" ? "Revise os cadastros pendentes e acompanhe cada solicitação." : section === "students" ? "Consulte e filtre os alunos cadastrados no projeto." : "Pedidos recebidos de alunos que precisam recuperar o acesso."}</p>
              </div>
              <Button className="admin-refresh" variant="outlined" startIcon={<SyncRounded />} onClick={() => {
                if (section === "password-requests") void loadPasswordRequests();
                else { void loadSummary(); void loadRows(activeFilter, appliedSearch, list.page); }
              }}>Atualizar</Button>
            </div>
          )}

          {error && <Alert severity="error" className="admin-alert">{error}</Alert>}
          {loading ? (
            <div className="admin-loading" role="status"><CircularProgress size={28} /><span>Carregando dados administrativos...</span></div>
          ) : (
            <>
              {section === "overview" && (
                <>
                  <section className="admin-stats-grid" aria-label="Indicadores de alunos">
                    <article className="admin-stat-card"><span className="admin-stat-icon stat-total"><GroupsRounded /></span><span className="admin-stat-label">Alunos cadastrados</span><strong>{counts.total}</strong><small>Inscrições em todos os status</small></article>
                    <article className="admin-stat-card"><span className="admin-stat-icon stat-pending"><AssignmentTurnedInRounded /></span><span className="admin-stat-label">Aguardando análise</span><strong>{counts.pendente}</strong><small>Precisam de revisão</small></article>
                    <article className="admin-stat-card"><span className="admin-stat-icon stat-approved"><CheckCircleRounded /></span><span className="admin-stat-label">Alunos aprovados</span><strong>{counts.aprovado}</strong><small>Com acesso liberado</small></article>
                    <article className="admin-stat-card"><span className="admin-stat-icon stat-rejected"><CloseRounded /></span><span className="admin-stat-label">Inscrições recusadas</span><strong>{counts.recusado}</strong><small>Precisam de ajustes</small></article>
                  </section>
                  <section className="admin-panel">
                    <div className="admin-panel-heading">
                      <div><span className="admin-eyebrow">ACOMPANHAMENTO</span><h2>Inscrições recentes</h2><p>Cadastros que aguardam a avaliação da equipe.</p></div>
                      <Button endIcon={<ArrowForwardRounded />} onClick={() => changeSection("registrations")}>Ver inscrições</Button>
                    </div>
                    <StudentTable rows={pendingRows.slice(0, 6)} loading={listLoading} onReview={(student) => void openStudentDetails(student, true)} onView={(student) => void openStudentDetails(student)} onSetPassword={(student) => setPasswordTarget(student)} emptyText="Tudo em dia! Não há inscrições pendentes." />
                  </section>
                  <section className="admin-shortcuts">
                    <button onClick={() => changeSection("registrations")}><span><AssignmentTurnedInRounded /></span><b>Analisar inscrições</b><small>{counts.pendente} aguardando revisão</small><ArrowForwardRounded /></button>
                    <button onClick={() => changeSection("students")}><span><GroupsRounded /></span><b>Consultar alunos</b><small>Buscar e filtrar cadastros</small><ArrowForwardRounded /></button>
                  </section>
                </>
              )}

              {(section === "registrations" || section === "students") && (
                <>
                  {section === "registrations" && token && <RegistrationCapacityPanel token={token} />}
                  <section className="admin-panel admin-list-panel">
                    <div className="admin-list-toolbar">
                      <div>
                        <h2>{section === "registrations" ? "Inscrições recebidas" : "Todos os alunos"}</h2>
                        <p>{list.total} {list.total === 1 ? "cadastro encontrado" : "cadastros encontrados"}</p>
                      </div>
                      <form className="admin-search-field admin-search" onSubmit={searchStudents}>
                        <SearchRounded aria-hidden="true" />
                        <input type="search" aria-label="Buscar aluno por nome ou e-mail" placeholder="Buscar aluno..." value={searchText} onChange={(event) => setSearchText(event.target.value)} />
                        <button type="submit">Buscar</button>
                      </form>
                    </div>
                    <div className="admin-filter-tabs" role="group" aria-label="Filtrar alunos por status">
                      {(["todos", "pendente", "aprovado", "recusado"] as const).map((filter) => (
                        <button key={filter} className={activeFilter === filter ? "active" : ""} onClick={() => changeFilter(filter)}>
                          {filter === "todos" ? "Todos" : statusNames[filter]}
                          {filter === "pendente" && counts.pendente > 0 && <span>{counts.pendente}</span>}
                        </button>
                      ))}
                    </div>
                    <StudentTable rows={list.rows} loading={listLoading} onReview={(student) => void openStudentDetails(student, true)} onView={(student) => void openStudentDetails(student)} onSetPassword={(student) => setPasswordTarget(student)} emptyText={section === "registrations" ? "Nenhuma inscrição encontrada com esses filtros." : "Nenhum aluno encontrado com esses filtros."} />
                    <div className="admin-pagination">
                      <span>Exibindo {list.rows.length ? (list.page - 1) * list.pageSize + 1 : 0}–{Math.min(list.page * list.pageSize, list.total)} de {list.total}</span>
                      <div>
                        <Button variant="outlined" disabled={list.page <= 1 || listLoading} onClick={() => void loadRows(activeFilter, appliedSearch, list.page - 1)}>Anterior</Button>
                        <span>Página {list.page} de {Math.max(1, Math.ceil(list.total / list.pageSize))}</span>
                        <Button variant="outlined" disabled={list.page * list.pageSize >= list.total || listLoading} onClick={() => void loadRows(activeFilter, appliedSearch, list.page + 1)}>Próxima</Button>
                      </div>
                    </div>
                  </section>
                </>
              )}
              {section === "password-requests" && (
                <PasswordRequestsPanel
                  requests={passwordRequests}
                  onSetPassword={setResetRequestTarget}
                  onReject={rejectPasswordRequest}
                />
              )}
              {section === "content" && token && <AdminContentPage token={token} />}
              {section === "logs" && token && <SystemLogsPage token={token} />}
              {(section === "team" || section === "modalities" || section === "classes" || section === "reports" || section === "lgpd") && token && (
                <AdminManagementPage
                  section={section}
                  token={token}
                  onRefresh={() => { void loadSummary(); }}
                />
              )}
            </>
          )}
          <footer className="admin-footer">© 2026 Projeto Aluno / Atleta <span>•</span> Painel administrativo</footer>
        </div>
      </div>

      <Dialog open={detailLoading || Boolean(reviewTarget)} onClose={() => !reviewing && !detailLoading && setReviewTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>{reviewTarget?.fullName ? (reviewEnabled ? `Analisar inscrição de ${reviewTarget.fullName}` : `Dados de ${reviewTarget.fullName}`) : "Carregando dados do aluno"}</DialogTitle>
        <DialogContent>
          {detailLoading && <div className="admin-table-loading"><CircularProgress size={20} /> Carregando ficha do aluno...</div>}
          {reviewError && <Alert severity="error">{reviewError}</Alert>}
          {reviewTarget && <StudentDetailsContent student={reviewTarget} />}
          {reviewEnabled && reviewTarget?.status === "pendente" && (
            <section className="student-review-reasons">
              <h3>Requisitos para esta turma</h3>
              <p>Marque os critérios que não foram atendidos. Se nenhum se aplicar, informe outro motivo.</p>
              {reviewTarget.classes.flatMap(({ requirements }) => requirements)
                .filter((requirement, index, all) => all.indexOf(requirement) === index)
                .map((requirement) => (
                  <FormControlLabel
                    key={requirement}
                    control={
                      <Checkbox
                        checked={selectedRejectionReasons.includes(requirement)}
                        onChange={(event) => setSelectedRejectionReasons((current) =>
                          event.target.checked
                            ? [...current, requirement]
                            : current.filter((item) => item !== requirement))}
                      />
                    }
                    label={requirement}
                  />
                ))}
              {!reviewTarget.classes.some(({ requirements }) => requirements.length > 0) && (
                <p>Esta turma não possui requisitos cadastrados. Use “Outro motivo” se precisar recusar a inscrição.</p>
              )}
              <TextField
                label={selectedRejectionReasons.length ? "Outro motivo (opcional)" : "Outro motivo"}
                placeholder="Descreva outro motivo para solicitar ajustes"
                value={otherRejectionReason}
                onChange={(event) => setOtherRejectionReason(event.target.value)}
                fullWidth
                multiline
                minRows={2}
                slotProps={{ htmlInput: { maxLength: 500 } }}
                helperText={`${otherRejectionReason.length}/500 caracteres${selectedRejectionReasons.length ? "" : " · obrigatório se nenhum requisito for marcado"}`}
              />
            </section>
          )}
        </DialogContent>
        <DialogActions className="admin-dialog-actions">
          <Button onClick={() => setReviewTarget(null)} disabled={reviewing || detailLoading}>{reviewEnabled ? "Cancelar" : "Fechar"}</Button>
          {reviewEnabled && reviewTarget?.status === "pendente" && (
            <>
              <Button color="error" variant="outlined" onClick={() => void reviewStudent("recusado")} disabled={reviewing || (!selectedRejectionReasons.length && otherRejectionReason.trim().length < 3)}>Recusar</Button>
              <Button variant="contained" onClick={() => void reviewStudent("aprovado")} disabled={reviewing}>{reviewing ? "Salvando..." : "Aprovar"}</Button>
            </>
          )}
        </DialogActions>
      </Dialog>
      <AdminPasswordDialog
        open={Boolean(passwordTarget)}
        userName={passwordTarget?.fullName ?? ""}
        onClose={() => setPasswordTarget(null)}
        onSubmit={changeStudentPassword}
      />
      <AdminPasswordDialog
        open={Boolean(resetRequestTarget)}
        userName={resetRequestTarget?.user?.fullName ?? "aluno"}
        onClose={() => setResetRequestTarget(null)}
        onSubmit={completePasswordRequest}
      />
    </main>
  );
}

function StudentTable({
  rows,
  loading,
  onReview,
  onView,
  onSetPassword,
  emptyText,
}: {
  rows: Student[];
  loading: boolean;
  onReview: (student: Student) => void;
  onView: (student: Student) => void;
  onSetPassword: (student: Pick<Student, "_id" | "fullName">) => void;
  emptyText: string;
}) {
  if (loading) return <div className="admin-table-loading"><CircularProgress size={22} /> Atualizando lista...</div>;
  if (!rows.length) return <div className="admin-empty-state"><AssignmentTurnedInRounded /><b>{emptyText}</b><span>Novos cadastros aparecerão aqui.</span></div>;
  return (
    <div className="admin-table-scroll">
      <table className="admin-student-table">
        <thead><tr><th>ALUNO</th><th>MODALIDADE</th><th>IDADE</th><th>DATA DA INSCRIÇÃO</th><th>STATUS</th><th>AÇÕES</th></tr></thead>
        <tbody>
          {rows.map((student) => (
            <tr key={student._id}>
              <td data-label="Aluno"><span className="admin-student-avatar">{student.fullName.trim().slice(0, 1).toUpperCase()}</span><span className="admin-student-identity"><b>{student.fullName}</b><small>{student.email}</small></span></td>
              <td data-label="Modalidade">{student.modality || "—"}</td>
              <td data-label="Idade">{student.age ? `${student.age} anos` : "—"}</td>
              <td data-label="Data da inscrição">{formatDate(student.createdAt)}</td>
              <td data-label="Status"><span className={`admin-status status-${student.status ?? "pendente"}`}><i />{statusNames[student.status ?? "pendente"]}</span></td>
              <td className="admin-student-actions" data-label="Ações">
                <Button size="small" variant="text" aria-label={`Ver informações de ${student.fullName}`} onClick={() => onView(student)}><VisibilityOutlined /></Button>
                {student.status === "pendente" && <Button size="small" variant="outlined" onClick={() => onReview(student)}>Analisar</Button>}
                <Button size="small" variant="text" startIcon={<KeyRounded />} onClick={() => onSetPassword(student)}>Senha</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StudentDetailsContent({ student }: { student: StudentDetails }) {
  const address = student.address
    ? [student.address.street, student.address.number, student.address.complement, student.address.neighborhood, student.address.city].filter(Boolean).join(", ")
    : "";
  const fullName = student.guardian?.name || "—";
  const shownRejection = student.rejectionReasons?.length || student.rejectionOtherReason
    ? [...(student.rejectionReasons ?? []), student.rejectionOtherReason].filter(Boolean).join(" ")
    : student.rejectionReason;

  return (
    <div className="student-details-content">
      <dl className="student-details-grid">
        <div><dt>E-mail</dt><dd>{student.email}</dd></div>
        <div><dt>Status</dt><dd>{statusNames[student.status ?? "pendente"]}</dd></div>
        <div><dt>Nascimento</dt><dd>{student.birthDate ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(student.birthDate)) : "—"}</dd></div>
        <div><dt>Idade</dt><dd>{student.age ? `${student.age} anos` : "—"}</dd></div>
        <div><dt>Gênero</dt><dd>{student.gender ?? "—"}</dd></div>
        <div><dt>Modalidade</dt><dd>{student.modality ?? "—"}</dd></div>
        <div><dt>Escola</dt><dd>{student.school ?? "—"}</dd></div>
        <div><dt>Endereço</dt><dd>{address || "—"}</dd></div>
        <div><dt>Responsável</dt><dd>{fullName}</dd></div>
        <div><dt>Telefone do responsável</dt><dd>{student.guardian?.phone ?? "—"}</dd></div>
        <div><dt>Inscrito em</dt><dd>{formatDate(student.createdAt)}</dd></div>
        <div><dt>Turma(s)</dt><dd>{student.classes.map(({ name }) => name).join(", ") || "—"}</dd></div>
      </dl>
      {student.classes.map((sportsClass) => (
        <section className="student-details-class" key={sportsClass.id}>
          <h3>Requisitos da turma {sportsClass.name}</h3>
          {sportsClass.requirements.length
            ? <ul>{sportsClass.requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ul>
            : <p>Nenhum requisito adicional cadastrado.</p>}
        </section>
      ))}
      {shownRejection && student.status === "recusado" && (
        <Alert severity="warning"><b>Motivo da recusa:</b> {shownRejection}</Alert>
      )}
      <div className="student-detail-documents">
        {student.documents.photoUrl && <a href={student.documents.photoUrl} target="_blank" rel="noreferrer">Abrir foto do aluno</a>}
        {student.documents.signedFormUrl && <a href={student.documents.signedFormUrl} target="_blank" rel="noreferrer">Abrir ficha assinada (PDF)</a>}
      </div>
    </div>
  );
}

interface RegistrationCapacity {
  open: boolean;
  limit: string;
  current: number;
}

interface RegistrationCapacityResponse {
  students: { open: boolean; limit: number; current: number };
  teachers: { open: boolean; limit: number; current: number };
}

function RegistrationCapacityPanel({ token }: { token: string }) {
  const [settings, setSettings] = useState<{
    students: RegistrationCapacity;
    teachers: RegistrationCapacity;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    adminRequest<RegistrationCapacityResponse>("/admin/registration-settings", token)
      .then((result) => {
        if (active) {
          setSettings({
            students: { ...result.students, limit: String(result.students.limit) },
            teachers: { ...result.teachers, limit: String(result.teachers.limit) },
          });
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Não foi possível carregar os limites.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [token]);

  function updateCapacity(kind: "students" | "teachers", value: Partial<RegistrationCapacity>) {
    setSettings((current) => current ? {
      ...current,
      [kind]: { ...current[kind], ...value },
    } : current);
    setSuccess("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const result = await adminRequest<RegistrationCapacityResponse>(
        "/admin/registration-settings",
        token,
        "PATCH",
        {
          students: { open: settings.students.open, limit: Number(settings.students.limit) },
          teachers: { open: settings.teachers.open, limit: Number(settings.teachers.limit) },
        },
      );
      setSettings({
        students: { ...result.students, limit: String(result.students.limit) },
        teachers: { ...result.teachers, limit: String(result.teachers.limit) },
      });
      setSuccess("Limites e situação das inscrições atualizados.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar as configurações.");
    } finally {
      setSaving(false);
    }
  }

  const validLimit = (value: string) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100000;

  return (
    <form className="admin-panel admin-registration-capacity" onSubmit={(event) => void save(event)}>
      <div className="admin-panel-heading">
        <div>
          <h2>Controle de novas inscrições</h2>
          <p>Defina o limite total e abra ou encerre cada tipo de cadastro.</p>
        </div>
      </div>
      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}
      {loading ? (
        <div className="admin-table-loading"><CircularProgress size={22} /> Carregando configurações...</div>
      ) : settings ? (
        <>
          <div className="admin-registration-capacity-grid">
            {(["students", "teachers"] as const).map((kind) => {
              const label = kind === "students" ? "Alunos" : "Professores";
              const item = settings[kind];
              const isFull = item.current >= Number(item.limit);
              const stateLabel = !item.open ? "Encerradas" : isFull ? "Limite atingido" : "Abertas";
              return (
                <article className="admin-registration-capacity-card" key={kind}>
                  <div className="admin-registration-capacity-title">
                    <div><h3>{label}</h3><span>{item.current} de {item.limit} vagas utilizadas</span></div>
                    <span className={`admin-registration-state${item.open && !isFull ? " is-open" : ""}`}>{stateLabel}</span>
                  </div>
                  <TextField
                    label={`Limite total de ${label.toLocaleLowerCase("pt-BR")}`}
                    type="number"
                    value={item.limit}
                    onChange={(event) => updateCapacity(kind, { limit: event.target.value })}
                    inputProps={{ min: 1, max: 100000, step: 1 }}
                    helperText={kind === "students"
                      ? "Conta inscrições pendentes e alunos aprovados."
                      : "Conta professores ativos cadastrados pela administração."}
                    required
                    fullWidth
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={item.open}
                        onChange={(event) => updateCapacity(kind, { open: event.target.checked })}
                      />
                    }
                    label={`Inscrições de ${label.toLocaleLowerCase("pt-BR")} abertas`}
                  />
                </article>
              );
            })}
          </div>
          <div className="admin-registration-capacity-actions">
            <span>Recusados e cadastros desativados não ocupam vagas. Ao atingir o limite, novos cadastros são bloqueados.</span>
            <Button
              type="submit"
              variant="contained"
              disabled={saving || !validLimit(settings.students.limit) || !validLimit(settings.teachers.limit)}
            >
              {saving ? "Salvando..." : "Salvar configurações"}
            </Button>
          </div>
        </>
      ) : null}
    </form>
  );
}

function PasswordRequestsPanel({
  requests,
  onSetPassword,
  onReject,
}: {
  requests: PasswordResetRequest[];
  onSetPassword: (request: PasswordResetRequest) => void;
  onReject: (requestId: string) => Promise<void>;
}) {
  const [rejectTarget, setRejectTarget] = useState<PasswordResetRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function reject() {
    if (!rejectTarget) return;
    setBusy(true);
    setError("");
    try {
      await onReject(rejectTarget.id);
      setRejectTarget(null);
      setSuccess("Solicitação recusada.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível recusar a solicitação.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="admin-panel admin-password-requests">
        <div className="admin-panel-heading">
          <div><h2>Solicitações recebidas</h2><p>Confirme a identidade do aluno antes de definir uma nova senha.</p></div>
          <span className="admin-password-request-count">{requests.filter(({ status }) => status === "pending").length} pendentes</span>
        </div>
        {error && <Alert severity="error" className="admin-alert">{error}</Alert>}
        {success && <Alert severity="success" className="admin-alert">{success}</Alert>}
        <div className="admin-management-list">
          {requests.map((request) => (
            <article className="admin-management-row admin-password-request-row" key={request.id}>
              <span className="admin-management-icon"><KeyRounded /></span>
              <span className="admin-management-identity">
                <b>{request.user?.fullName ?? "Conta não disponível"}</b>
                <small>{request.user?.email ?? "Aluno removido ou indisponível"}</small>
              </span>
              <span className="admin-management-detail">
                {request.status === "pending" ? "Aguardando análise" : request.status === "completed" ? "Concluída" : "Recusada"}
                <small>Solicitada em {formatDate(request.requestedAt)}</small>
              </span>
              {request.status === "pending" && (
                <span className="admin-management-actions">
                  <Button
                    size="small"
                    variant="contained"
                    disabled={!request.user?.active}
                    onClick={() => onSetPassword(request)}
                  >
                    Definir senha
                  </Button>
                  <Button size="small" color="error" onClick={() => setRejectTarget(request)}>Recusar</Button>
                </span>
              )}
            </article>
          ))}
          {!requests.length && <div className="admin-management-empty"><KeyRounded /><span>Nenhuma solicitação de senha recebida.</span></div>}
        </div>
      </section>
      <Dialog open={Boolean(rejectTarget)} onClose={() => !busy && setRejectTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Recusar solicitação?</DialogTitle>
        <DialogContent>
          <p className="admin-dialog-copy">A solicitação de {rejectTarget?.user?.fullName ?? "este aluno"} será encerrada sem alterar a senha.</p>
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions className="admin-dialog-actions">
          <Button onClick={() => setRejectTarget(null)} disabled={busy}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={() => void reject()} disabled={busy}>{busy ? "Processando..." : "Recusar solicitação"}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
