import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AddRounded,
  BarChartRounded,
  DeleteOutlineRounded,
  EditOutlined,
  GroupsRounded,
  KeyRounded,
  PersonAddAltRounded,
  PrivacyTipRounded,
  SearchRounded,
  SportsSoccerRounded,
  SyncRounded,
  DownloadRounded,
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
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Tab,
  Tabs,
  TextField,
} from "@mui/material";
import { adminDownload, adminRequest } from "../services/admin";
import { modalityColor, modalityColorOptions, modalityIconOptions, ModalityIcon } from "../components/modalityIcons";
import { AdminPasswordDialog } from "../components/AdminPasswordDialog";
import { getClassRequirements } from "../lib/classEligibility";

export type ManagementSection = "team" | "modalities" | "classes" | "reports" | "lgpd";
type RecordKind = Exclude<ManagementSection, "reports" | "lgpd">;

interface Teacher {
  _id: string;
  fullName: string;
  email: string;
  classIds: string[];
  createdAt: string;
}

interface RegistrationCapacityStatus {
  open: boolean;
  limit: number;
  current: number;
}

interface ModalityItem {
  _id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}

interface ClassTeacher {
  _id: string;
  fullName: string;
  email: string;
}

interface SportsClass {
  _id: string;
  name: string;
  modality: string;
  teacherIds?: Array<ClassTeacher | null>;
  studentCount: number;
  enrollmentLimit: number;
  enrolledCount: number;
  registrationStartsAt?: string;
  registrationEndsAt?: string;
  requiresNeighborhoodSchool?: boolean;
  minimumAge?: number;
  maximumAge?: number;
  otherEligibilityRequirements?: string[];
  requirements?: string[];
}

interface Reports {
  generatedAt: string;
  students: {
    total: number;
    pendente: number;
    aprovado: number;
    recusado: number;
    byModality: Array<{ modality: string; count: number }>;
  };
  teachers: number;
  classes: number;
  attendance: { records: number; present: number; rate: number | null };
  registrationTimeline: Array<{ year: number; month: number; count: number }>;
}

type LgpdRequestStatus = "open" | "processing" | "completed" | "rejected";
type LgpdRequestType = "access" | "correction" | "deletion" | "portability" | "anonymization" | "revocation";

interface AdminLgpdRequest {
  _id: string;
  userId: string | { _id: string; fullName: string; email: string; role: string; status?: string } | null;
  type: LgpdRequestType;
  description?: string;
  status: LgpdRequestStatus;
  responseNote?: string;
  createdAt: string;
  reviewedAt?: string;
  isTestData?: boolean;
}

interface ReportField {
  key: string;
  label: string;
  sensitive?: boolean;
}

interface ReportDatasetOption {
  key: string;
  label: string;
  supportsClass: boolean;
  supportsModality: boolean;
  supportsStatus: boolean;
  supportsPresence: boolean;
  fields: ReportField[];
  defaults: string[];
}

interface ReportOptions {
  datasets: ReportDatasetOption[];
  classes: Array<{ id: string; name: string; modality: string }>;
  modalities: string[];
}

type ManagedRecord = Teacher | ModalityItem | SportsClass;
type EditorState = { kind: RecordKind; record: ManagedRecord | null } | null;
type RemovalState = { kind: RecordKind; id: string; label: string } | null;

interface AdminManagementPageProps {
  section: ManagementSection;
  token: string;
  onRefresh: () => void;
}

const sectionContent: Record<ManagementSection, { title: string; description: string }> = {
  team: { title: "Equipe do projeto", description: "Cadastre professores e organize os acessos da equipe." },
  modalities: { title: "Modalidades esportivas", description: "Mantenha atualizadas as modalidades oferecidas pelo projeto." },
  classes: { title: "Turmas e professores", description: "Organize as turmas e associe professores e modalidades." },
  reports: { title: "Relatórios do projeto", description: "Acompanhe inscrições, modalidades, equipe e frequência." },
  lgpd: { title: "Solicitações LGPD", description: "Analise pedidos de titulares e autorize a portabilidade de dados quando aprovada." },
};

function recordId(record: ManagedRecord) {
  return record._id;
}

function getClassTeachers(sportsClass: SportsClass) {
  return Array.isArray(sportsClass.teacherIds)
    ? sportsClass.teacherIds.filter((teacher): teacher is ClassTeacher => Boolean(teacher && typeof teacher === "object"))
    : [];
}

function dateTimeLocalValue(value?: string) {
  const date = value ? new Date(value) : new Date();
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function registrationWindowLabel(startsAt?: string, endsAt?: string) {
  if (!startsAt || !endsAt) return "Período não definido";
  const format = (value: string) => new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
  return `${format(startsAt)} até ${format(endsAt)}`;
}

function lgpdRequestTypeLabel(type: LgpdRequestType) {
  const labels: Record<LgpdRequestType, string> = {
    access: "Acesso",
    correction: "Correção",
    deletion: "Exclusão",
    portability: "Portabilidade",
    anonymization: "Anonimização",
    revocation: "Revogação",
  };
  return labels[type];
}

function lgpdRequestStatusLabel(status: LgpdRequestStatus) {
  if (status === "open") return "Aguardando análise";
  if (status === "processing") return "Em análise";
  if (status === "completed") return "Concluída";
  return "Recusada";
}

export function AdminManagementPage({ section, token, onRefresh }: AdminManagementPageProps) {
  const [reportView, setReportView] = useState<"report" | "stats">("report");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherCapacity, setTeacherCapacity] = useState<RegistrationCapacityStatus | null>(null);
  const [modalities, setModalities] = useState<ModalityItem[]>([]);
  const [classes, setClasses] = useState<SportsClass[]>([]);
  const [lgpdRequests, setLgpdRequests] = useState<AdminLgpdRequest[]>([]);
  const [reports, setReports] = useState<Reports | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editor, setEditor] = useState<EditorState>(null);
  const [removal, setRemoval] = useState<RemovalState>(null);
  const [passwordTarget, setPasswordTarget] = useState<Teacher | null>(null);
  const [lgpdReviewTarget, setLgpdReviewTarget] = useState<AdminLgpdRequest | null>(null);
  const [lgpdReviewForm, setLgpdReviewForm] = useState<{ status: LgpdRequestStatus; responseNote: string }>({ status: "processing", responseNote: "" });
  const [lgpdStatusFilter, setLgpdStatusFilter] = useState<"all" | LgpdRequestStatus>("all");
  const [lgpdTypeFilter, setLgpdTypeFilter] = useState<"all" | LgpdRequestType>("all");
  const [formError, setFormError] = useState("");
  const [teacherForm, setTeacherForm] = useState({ fullName: "", email: "", password: "" });
  const [modalityForm, setModalityForm] = useState({ name: "", description: "", icon: "soccer", color: "#DBEAFE" });
  const [classForm, setClassForm] = useState({
    name: "",
    modality: "",
    teacherIds: [] as string[],
    enrollmentLimit: "30",
    registrationStartsAt: dateTimeLocalValue(),
    registrationEndsAt: dateTimeLocalValue(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()),
    requirements: [] as string[],
  });
  const [search, setSearch] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (section === "team") {
        const [teacherRows, registrationSettings] = await Promise.all([
          adminRequest<Teacher[]>("/admin/teachers", token),
          adminRequest<{ teachers: RegistrationCapacityStatus }>("/admin/registration-settings", token),
        ]);
        setTeachers(teacherRows);
        setTeacherCapacity(registrationSettings.teachers);
      } else if (section === "modalities") {
        setModalities(await adminRequest<ModalityItem[]>("/admin/modalities", token));
      } else if (section === "classes") {
        const [classRows, teacherRows, modalityRows] = await Promise.all([
          adminRequest<SportsClass[]>("/admin/classes", token),
          adminRequest<Teacher[]>("/admin/teachers", token),
          adminRequest<ModalityItem[]>("/admin/modalities", token),
        ]);
        setClasses(classRows);
        setTeachers(teacherRows);
        setModalities(modalityRows);
      } else if (section === "lgpd") {
        setLgpdRequests(await adminRequest<AdminLgpdRequest[]>("/admin/lgpd-requests", token));
      } else {
        setReports(await adminRequest<Reports>("/admin/reports/summary", token));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar esta área.");
    } finally {
      setLoading(false);
    }
  }, [section, token]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredTeachers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return teachers.filter((teacher) => !query || `${teacher.fullName} ${teacher.email}`.toLocaleLowerCase("pt-BR").includes(query));
  }, [search, teachers]);
  const filteredModalities = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return modalities.filter((modality) => !query || `${modality.name} ${modality.description ?? ""}`.toLocaleLowerCase("pt-BR").includes(query));
  }, [modalities, search]);
  const filteredClasses = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return classes.filter((sportsClass) =>
      !query || `${sportsClass.name} ${sportsClass.modality} ${getClassTeachers(sportsClass).map(({ fullName }) => fullName).join(" ")}`.toLocaleLowerCase("pt-BR").includes(query),
    );
  }, [classes, search]);
  const filteredLgpdRequests = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return lgpdRequests.filter((item) => {
      const fullName = typeof item.userId === "object" && item.userId ? item.userId.fullName : "";
      const email = typeof item.userId === "object" && item.userId ? item.userId.email : "";
      const matchesSearch = !query || `${fullName} ${email} ${item.description ?? ""} ${item.type}`.toLocaleLowerCase("pt-BR").includes(query);
      return matchesSearch &&
        (lgpdStatusFilter === "all" || item.status === lgpdStatusFilter) &&
        (lgpdTypeFilter === "all" || item.type === lgpdTypeFilter);
    });
  }, [lgpdRequests, lgpdStatusFilter, lgpdTypeFilter, search]);

  function openEditor(kind: RecordKind, record: ManagedRecord | null = null) {
    setFormError("");
    setEditor({ kind, record });
    if (kind === "team") {
      const teacher = record as Teacher | null;
      setTeacherForm({
        fullName: teacher?.fullName ?? "",
        email: teacher?.email ?? "",
        password: "",
      });
    } else if (kind === "modalities") {
      const modality = record as ModalityItem | null;
      setModalityForm({
        name: modality?.name ?? "",
        description: modality?.description ?? "",
        icon: modality?.icon ?? "soccer",
        color: modalityColor(modality?.color ?? "#DBEAFE").value,
      });
    } else {
      const sportsClass = record as SportsClass | null;
      setClassForm({
        name: sportsClass?.name ?? "",
        modality: sportsClass?.modality ?? modalities[0]?.name ?? "",
        teacherIds: sportsClass ? getClassTeachers(sportsClass).map(({ _id }) => _id) : [],
        enrollmentLimit: String(sportsClass?.enrollmentLimit ?? 30),
        registrationStartsAt: dateTimeLocalValue(sportsClass?.registrationStartsAt),
        registrationEndsAt: dateTimeLocalValue(sportsClass?.registrationEndsAt),
        requirements: sportsClass ? getClassRequirements(sportsClass) : [],
      });
    }
  }

  function closeEditor() {
    if (!saving) {
      setEditor(null);
      setFormError("");
    }
  }

  async function submitEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    setSaving(true);
    setFormError("");
    const updating = Boolean(editor.record);
    const id = editor.record ? recordId(editor.record) : "";
    const path = editor.kind === "team" ? "/admin/teachers" : editor.kind === "modalities" ? "/admin/modalities" : "/admin/classes";
    const payload = editor.kind === "team"
      ? { ...teacherForm, ...(updating ? { password: undefined } : {}) }
      : editor.kind === "modalities"
        ? modalityForm
        : {
          ...classForm,
          enrollmentLimit: Number(classForm.enrollmentLimit),
          registrationStartsAt: new Date(classForm.registrationStartsAt).toISOString(),
          registrationEndsAt: new Date(classForm.registrationEndsAt).toISOString(),
        };
    try {
      await adminRequest(
        updating ? `${path}/${encodeURIComponent(id)}` : path,
        token,
        updating ? "PATCH" : "POST",
        payload,
      );
      setEditor(null);
      await loadData();
      onRefresh();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Não foi possível salvar as alterações.");
    } finally {
      setSaving(false);
    }
  }

  async function removeRecord() {
    if (!removal) return;
    setSaving(true);
    setFormError("");
    const path = removal.kind === "team" ? "/admin/teachers" : removal.kind === "modalities" ? "/admin/modalities" : "/admin/classes";
    try {
      await adminRequest(`${path}/${encodeURIComponent(removal.id)}`, token, "DELETE");
      setRemoval(null);
      await loadData();
      onRefresh();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Não foi possível remover este cadastro.");
    } finally {
      setSaving(false);
    }
  }

  async function submitLgpdReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lgpdReviewTarget) return;
    setSaving(true);
    setFormError("");
    try {
      await adminRequest(
        `/admin/lgpd-requests/${encodeURIComponent(lgpdReviewTarget._id)}`,
        token,
        "PATCH",
        lgpdReviewForm,
      );
      setLgpdReviewTarget(null);
      setSuccess(lgpdReviewForm.status === "completed" && lgpdReviewTarget.type === "portability"
        ? "Solicitação concluída. O download foi liberado para o aluno."
        : "Análise da solicitação salva.");
      await loadData();
      onRefresh();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Não foi possível salvar a análise.");
    } finally {
      setSaving(false);
    }
  }

  const content = sectionContent[section];
  const createLabel = section === "team" ? "Novo professor" : section === "modalities" ? "Nova modalidade" : "Nova turma";

  return (
    <>
      <div className="admin-management-heading">
        <div><h1>{content.title}</h1><p>{content.description}</p></div>
        <div>
          <Button className="admin-refresh" variant="outlined" startIcon={<SyncRounded />} onClick={() => void loadData()}>Atualizar</Button>
          {section !== "reports" && section !== "lgpd" && (
            <Button
              variant="contained"
              startIcon={<AddRounded />}
              onClick={() => openEditor(section)}
              disabled={section === "team" && Boolean(teacherCapacity && (!teacherCapacity.open || teacherCapacity.current >= teacherCapacity.limit))}
            >
              {createLabel}
            </Button>
          )}
        </div>
      </div>

      {error && <Alert severity="error" className="admin-alert">{error}</Alert>}
      {success && <Alert severity="success" className="admin-alert" onClose={() => setSuccess("")}>{success}</Alert>}
      {loading ? (
        <div className="admin-loading" role="status"><CircularProgress size={26} /><span>Carregando dados...</span></div>
      ) : section === "team" ? (
        <section className="admin-panel admin-management-panel">
          {teacherCapacity && (
            <Alert severity={teacherCapacity.open && teacherCapacity.current < teacherCapacity.limit ? "info" : "warning"}>
              Cadastro de professores {teacherCapacity.open ? "aberto" : "encerrado"} · {teacherCapacity.current}/{teacherCapacity.limit} vagas utilizadas.
            </Alert>
          )}
          <ManagementSearch value={search} onChange={setSearch} label="Buscar professor por nome ou e-mail" />
          <div className="admin-management-list">
            {filteredTeachers.map((teacher) => (
              <article className="admin-management-row" key={teacher._id}>
                <span className="admin-management-icon"><PersonAddAltRounded /></span>
                <span className="admin-management-identity"><b>{teacher.fullName}</b><small>{teacher.email}</small></span>
                <span className="admin-management-detail">{teacher.classIds.length} {teacher.classIds.length === 1 ? "turma" : "turmas"}</span>
                <span className="admin-management-actions">
                  <button aria-label={`Editar ${teacher.fullName}`} onClick={() => openEditor("team", teacher)}><EditOutlined /></button>
                  <button aria-label={`Alterar senha de ${teacher.fullName}`} onClick={() => setPasswordTarget(teacher)}><KeyRounded /></button>
                  <button aria-label={`Desativar ${teacher.fullName}`} onClick={() => { setFormError(""); setRemoval({ kind: "team", id: teacher._id, label: teacher.fullName }); }}><DeleteOutlineRounded /></button>
                </span>
              </article>
            ))}
            {!filteredTeachers.length && <ManagementEmpty text="Nenhum professor encontrado." />}
          </div>
        </section>
      ) : section === "modalities" ? (
        <section className="admin-panel admin-management-panel">
          <ManagementSearch value={search} onChange={setSearch} label="Buscar modalidade" />
          <div className="admin-modality-grid">
            {filteredModalities.map((modality) => (
              <article className="admin-modality-card" key={modality._id}>
                <span style={{ color: modalityColor(modality.color ?? "#DBEAFE").foreground, background: modalityColor(modality.color ?? "#DBEAFE").value }}><ModalityIcon name={modality.icon ?? "soccer"} /></span>
                <h3>{modality.name}</h3>
                <p>{modality.description || "Sem descrição cadastrada."}</p>
                <div><button onClick={() => openEditor("modalities", modality)}><EditOutlined /> Editar</button><button onClick={() => { setFormError(""); setRemoval({ kind: "modalities", id: modality._id, label: modality.name }); }}><DeleteOutlineRounded /> Remover</button></div>
              </article>
            ))}
            {!filteredModalities.length && <ManagementEmpty text="Nenhuma modalidade cadastrada." />}
          </div>
        </section>
      ) : section === "classes" ? (
        <section className="admin-panel admin-management-panel">
          <ManagementSearch value={search} onChange={setSearch} label="Buscar turma, modalidade ou professor" />
          <div className="admin-management-list">
            {filteredClasses.map((sportsClass) => (
              <article className="admin-management-row" key={sportsClass._id}>
                <span className="admin-management-icon"><GroupsRounded /></span>
                <span className="admin-management-identity"><b>{sportsClass.name}</b><small>{sportsClass.modality}</small></span>
                <span className="admin-management-detail">
                  {getClassTeachers(sportsClass).map(({ fullName }) => fullName).join(", ") || "Sem professor"}
                  <small>{sportsClass.studentCount} alunos · {sportsClass.enrolledCount}/{sportsClass.enrollmentLimit} vagas reservadas</small>
                  <small>Inscrições: {registrationWindowLabel(sportsClass.registrationStartsAt, sportsClass.registrationEndsAt)}</small>
                  <small>Requisitos: {getClassRequirements(sportsClass).join(" · ") || "Nenhum requisito adicional"}</small>
                </span>
                <span className="admin-management-actions">
                  <button aria-label={`Editar turma ${sportsClass.name}`} onClick={() => openEditor("classes", sportsClass)}><EditOutlined /></button>
                  <button aria-label={`Remover turma ${sportsClass.name}`} onClick={() => { setFormError(""); setRemoval({ kind: "classes", id: sportsClass._id, label: sportsClass.name }); }}><DeleteOutlineRounded /></button>
                </span>
              </article>
            ))}
            {!filteredClasses.length && <ManagementEmpty text="Nenhuma turma cadastrada." />}
          </div>
        </section>
      ) : section === "lgpd" ? (
        <section className="admin-panel admin-management-panel">
          <div className="admin-list-toolbar">
            <div><h2>Pedidos recebidos</h2><p>{filteredLgpdRequests.length} de {lgpdRequests.length} solicitações</p></div>
            <ManagementSearch value={search} onChange={setSearch} label="Buscar por titular, e-mail ou descrição" />
          </div>
          <div className="admin-report-filters">
            <TextField select label="Tipo" value={lgpdTypeFilter} onChange={(event) => setLgpdTypeFilter(event.target.value as "all" | LgpdRequestType)}>
              <MenuItem value="all">Todos os tipos</MenuItem>
              <MenuItem value="access">Acesso</MenuItem>
              <MenuItem value="correction">Correção</MenuItem>
              <MenuItem value="deletion">Exclusão</MenuItem>
              <MenuItem value="portability">Portabilidade</MenuItem>
              <MenuItem value="anonymization">Anonimização</MenuItem>
              <MenuItem value="revocation">Revogação</MenuItem>
            </TextField>
            <TextField select label="Status" value={lgpdStatusFilter} onChange={(event) => setLgpdStatusFilter(event.target.value as "all" | LgpdRequestStatus)}>
              <MenuItem value="all">Todos os status</MenuItem>
              <MenuItem value="open">Aguardando análise</MenuItem>
              <MenuItem value="processing">Em análise</MenuItem>
              <MenuItem value="completed">Concluída</MenuItem>
              <MenuItem value="rejected">Recusada</MenuItem>
            </TextField>
          </div>
          <div className="admin-management-list">
            {filteredLgpdRequests.map((item) => {
              const titular = typeof item.userId === "object" && item.userId ? item.userId : null;
              return (
                <article className="admin-management-row" key={item._id}>
                  <span className="admin-management-icon"><PrivacyTipRounded /></span>
                  <span className="admin-management-identity">
                    <b>{titular?.fullName ?? "Titular indisponível"} · {lgpdRequestTypeLabel(item.type)}</b>
                    <small>{titular?.email ?? "Conta não encontrada"}</small>
                    <small>{item.description || "Sem detalhes adicionais."}</small>
                    {item.isTestData && <small>Solicitação de dados de teste</small>}
                  </span>
                  <span className="admin-management-detail">{lgpdRequestStatusLabel(item.status)}<small>{new Date(item.createdAt).toLocaleString("pt-BR")}</small></span>
                  <span className="admin-management-actions">
                    <Button size="small" variant="outlined" onClick={() => {
                      setFormError("");
                      setLgpdReviewTarget(item);
                      setLgpdReviewForm({ status: item.status === "open" ? "processing" : item.status, responseNote: item.responseNote ?? "" });
                    }}>Analisar</Button>
                  </span>
                </article>
              );
            })}
            {!filteredLgpdRequests.length && <ManagementEmpty text="Nenhuma solicitação LGPD encontrada com esses filtros." />}
          </div>
        </section>
      ) : (
        reports && (
          <div className="admin-report-workspace">
            <Tabs
              value={reportView}
              onChange={(_event, value: "report" | "stats") => setReportView(value)}
              aria-label="Relatórios e painel estatístico"
              className="admin-report-tabs"
            >
              <Tab value="report" label="Relatórios" />
              <Tab value="stats" label="Painel estatístico" />
            </Tabs>
            {reportView === "report"
              ? <ReportBuilder token={token} />
              : <ReportsPanel reports={reports} token={token} />}
          </div>
        )
      )}

      <Dialog open={Boolean(lgpdReviewTarget)} onClose={() => !saving && setLgpdReviewTarget(null)} fullWidth maxWidth="sm">
        <form onSubmit={(event) => void submitLgpdReview(event)}>
          <DialogTitle>Analisar solicitação LGPD</DialogTitle>
          <DialogContent className="admin-editor-fields">
            {formError && <Alert severity="error">{formError}</Alert>}
            <p className="admin-dialog-copy">
              Titular: {typeof lgpdReviewTarget?.userId === "object" && lgpdReviewTarget.userId
                ? `${lgpdReviewTarget.userId.fullName} · ${lgpdReviewTarget.userId.email}`
                : "Conta não encontrada"}
            </p>
            <p className="admin-dialog-copy">Tipo: {lgpdReviewTarget ? lgpdRequestTypeLabel(lgpdReviewTarget.type) : ""}</p>
            <p className="admin-dialog-copy">Solicitação: {lgpdReviewTarget?.description || "Sem detalhes adicionais."}</p>
            {lgpdReviewTarget?.isTestData && <Alert severity="warning">Este registro está marcado como dado de teste.</Alert>}
            <TextField
              select
              label="Decisão / status"
              value={lgpdReviewForm.status}
              onChange={(event) => setLgpdReviewForm({ ...lgpdReviewForm, status: event.target.value as LgpdRequestStatus })}
            >
              <MenuItem value="open">Aguardando análise</MenuItem>
              <MenuItem value="processing">Em análise</MenuItem>
              <MenuItem value="completed">Concluir solicitação{lgpdReviewTarget?.type === "portability" ? " e liberar download" : ""}</MenuItem>
              <MenuItem value="rejected">Recusar solicitação</MenuItem>
            </TextField>
            <TextField
              label="Parecer para o titular"
              value={lgpdReviewForm.responseNote}
              onChange={(event) => setLgpdReviewForm({ ...lgpdReviewForm, responseNote: event.target.value })}
              required={lgpdReviewForm.status === "rejected"}
              multiline
              minRows={3}
              inputProps={{ maxLength: 2000 }}
              helperText={lgpdReviewForm.status === "rejected" ? "Obrigatório ao recusar." : "Opcional · será exibido ao aluno."}
            />
            {lgpdReviewTarget?.type === "portability" && lgpdReviewForm.status === "completed" &&
              <Alert severity="info">Ao concluir, o aluno poderá baixar o JSON apenas pela própria conta.</Alert>}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setLgpdReviewTarget(null)} disabled={saving}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={saving}>{saving ? "Salvando..." : "Salvar análise"}</Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={Boolean(editor)} onClose={closeEditor} fullWidth maxWidth="sm">
        <form onSubmit={submitEditor}>
          <DialogTitle>{editor?.record ? `Editar ${editor.kind === "team" ? "professor" : editor.kind === "modalities" ? "modalidade" : "turma"}` : createLabel}</DialogTitle>
          <DialogContent className="admin-editor-fields">
            {formError && <Alert severity="error">{formError}</Alert>}
            {editor?.kind === "team" && (
              <>
                <TextField autoFocus label="Nome completo" value={teacherForm.fullName} onChange={(event) => setTeacherForm({ ...teacherForm, fullName: event.target.value })} required inputProps={{ maxLength: 140 }} />
                <TextField label="E-mail de acesso" type="email" value={teacherForm.email} onChange={(event) => setTeacherForm({ ...teacherForm, email: event.target.value })} required inputProps={{ maxLength: 254 }} />
                {!editor.record && <TextField label="Senha inicial" type="password" autoComplete="new-password" value={teacherForm.password} onChange={(event) => setTeacherForm({ ...teacherForm, password: event.target.value })} required helperText="Mínimo de 10 caracteres, com pelo menos três tipos de caracteres." />}
              </>
            )}
            {editor?.kind === "modalities" && (
              <>
                <TextField autoFocus label="Nome da modalidade" value={modalityForm.name} onChange={(event) => setModalityForm({ ...modalityForm, name: event.target.value })} required inputProps={{ maxLength: 60 }} />
                <TextField label="Descrição" value={modalityForm.description} onChange={(event) => setModalityForm({ ...modalityForm, description: event.target.value })} multiline minRows={3} inputProps={{ maxLength: 300 }} />
                <FormControl fullWidth>
                  <InputLabel id="modality-icon-label">Ícone exibido no site</InputLabel>
                  <Select
                    labelId="modality-icon-label"
                    label="Ícone exibido no site"
                    value={modalityForm.icon}
                    onChange={(event) => setModalityForm({ ...modalityForm, icon: event.target.value })}
                  >
                    {modalityIconOptions.map(({ key, label, Icon }) => (
                      <MenuItem value={key} key={key}><Icon sx={{ mr: 1, verticalAlign: "middle" }} />{label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl fullWidth>
                  <InputLabel id="modality-color-label">Paleta acessível</InputLabel>
                  <Select
                    labelId="modality-color-label"
                    label="Paleta acessível"
                    value={modalityForm.color}
                    onChange={(event) => setModalityForm({ ...modalityForm, color: event.target.value })}
                  >
                    {modalityColorOptions.map(({ value, label, foreground }) => (
                      <MenuItem value={value} key={value}>
                        <span className="modality-palette-swatch" style={{ background: value, color: foreground }} aria-hidden="true" />
                        {label}
                      </MenuItem>
                    ))}
                  </Select>
                  <small className="modality-palette-help">Cores pastéis predefinidas com contraste acessível no texto e no ícone.</small>
                </FormControl>
              </>
            )}
            {editor?.kind === "classes" && (
              <>
                <TextField autoFocus label="Nome da turma" value={classForm.name} onChange={(event) => setClassForm({ ...classForm, name: event.target.value })} required inputProps={{ maxLength: 100 }} />
                <FormControl fullWidth required>
                  <InputLabel id="class-modality-label">Modalidade</InputLabel>
                  <Select
                    labelId="class-modality-label"
                    label="Modalidade"
                    value={classForm.modality}
                    onChange={(event) => setClassForm({ ...classForm, modality: event.target.value })}
                  >
                    {modalities.map((modality) => <MenuItem key={modality._id} value={modality.name}>{modality.name}</MenuItem>)}
                  </Select>
                </FormControl>
                <TextField
                  label="Limite de alunos"
                  type="number"
                  required
                  value={classForm.enrollmentLimit}
                  onChange={(event) => setClassForm({ ...classForm, enrollmentLimit: event.target.value })}
                  slotProps={{ htmlInput: { min: 1, max: 10000, step: 1 } }}
                  helperText={editor.record && "O limite não pode ser menor que as inscrições pendentes e os alunos aprovados."}
                />
                <TextField
                  label="Início das inscrições"
                  type="datetime-local"
                  required
                  value={classForm.registrationStartsAt}
                  onChange={(event) => setClassForm({ ...classForm, registrationStartsAt: event.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  label="Encerramento das inscrições"
                  type="datetime-local"
                  required
                  value={classForm.registrationEndsAt}
                  onChange={(event) => setClassForm({ ...classForm, registrationEndsAt: event.target.value })}
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: classForm.registrationStartsAt } }}
                />
                <fieldset className="teacher-eligibility-fieldset">
                  <legend>Requisitos para inscrição de alunos</legend>
                  <div className="teacher-extra-requirements">
                    <b>Adicione e descreva os requisitos da turma</b>
                    {classForm.requirements.map((requirement, index) => (
                      <div className="teacher-extra-requirement" key={index}>
                        <TextField label={`Requisito ${index + 1}`} value={requirement} onChange={(event) => setClassForm({
                          ...classForm,
                          requirements: classForm.requirements.map((item, current) => current === index ? event.target.value : item),
                        })} required multiline inputProps={{ maxLength: 240 }} />
                        <Button type="button" color="error" onClick={() => setClassForm({ ...classForm, requirements: classForm.requirements.filter((_, current) => current !== index) })}>Excluir</Button>
                      </div>
                    ))}
                    <Button type="button" onClick={() => setClassForm({ ...classForm, requirements: [...classForm.requirements, ""] })} disabled={classForm.requirements.length >= 20}>Adicionar requisito</Button>
                  </div>
                </fieldset>
                <fieldset className="admin-teacher-picker"><legend>Professores da turma</legend>
                  {!teachers.length && <span>Cadastre professores antes de associá-los a uma turma.</span>}
                  {teachers.map((teacher) => (
                    <label key={teacher._id}><input type="checkbox" checked={classForm.teacherIds.includes(teacher._id)} onChange={(event) => setClassForm({
                      ...classForm,
                      teacherIds: event.target.checked
                        ? [...classForm.teacherIds, teacher._id]
                        : classForm.teacherIds.filter((id) => id !== teacher._id),
                    })} />{teacher.fullName}</label>
                  ))}
                </fieldset>
              </>
            )}
          </DialogContent>
          <DialogActions className="admin-dialog-actions">
            <Button onClick={closeEditor} disabled={saving}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={Boolean(removal)} onClose={() => !saving && setRemoval(null)} fullWidth maxWidth="xs">
        <DialogTitle>{removal?.kind === "team" ? "Desativar professor?" : "Remover cadastro?"}</DialogTitle>
        <DialogContent>
          {formError && <Alert severity="error">{formError}</Alert>}
          <p className="admin-dialog-copy">
            {removal?.kind === "team"
              ? `A conta de ${removal.label} será desativada. Essa ação será bloqueada se ele estiver associado a uma turma.`
              : `Confirma a remoção de “${removal?.label}”? O sistema impedirá a remoção se houver vínculos ativos.`}
          </p>
        </DialogContent>
        <DialogActions className="admin-dialog-actions">
          <Button onClick={() => setRemoval(null)} disabled={saving}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={() => void removeRecord()} disabled={saving}>{saving ? "Processando..." : removal?.kind === "team" ? "Desativar" : "Remover"}</Button>
        </DialogActions>
      </Dialog>
      <AdminPasswordDialog
        open={Boolean(passwordTarget)}
        userName={passwordTarget?.fullName ?? ""}
        onClose={() => setPasswordTarget(null)}
        onSubmit={async (newPassword) => {
          if (!passwordTarget) return;
          await adminRequest(
            `/admin/users/${encodeURIComponent(passwordTarget._id)}/password`,
            token,
            "PATCH",
            { newPassword },
          );
        }}
      />
    </>
  );
}

function ManagementSearch({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return (
    <div className="admin-search-field admin-management-search">
      <SearchRounded aria-hidden="true" />
      <input type="search" aria-label={label} placeholder={label} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function ManagementEmpty({ text }: { text: string }) {
  return <div className="admin-management-empty"><GroupsRounded /><span>{text}</span></div>;
}

function ReportBuilder({ token }: { token: string }) {
  const [options, setOptions] = useState<ReportOptions | null>(null);
  const [datasets, setDatasets] = useState<string[]>(["students"]);
  const [columns, setColumns] = useState<Record<string, string[]>>({});
  const [format, setFormat] = useState<"csv" | "xlsx" | "pdf">("xlsx");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [classId, setClassId] = useState("");
  const [modality, setModality] = useState("");
  const [status, setStatus] = useState("");
  const [presence, setPresence] = useState("");
  const [search, setSearch] = useState("");
  const [includeTestData, setIncludeTestData] = useState(true);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    adminRequest<ReportOptions>("/admin/reports/options", token)
      .then((result) => {
        if (!active) return;
        setOptions(result);
        setColumns(Object.fromEntries(result.datasets.map((dataset) => [dataset.key, dataset.defaults])));
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Não foi possível carregar as opções do relatório.");
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });
    return () => { active = false; };
  }, [token]);

  const selectedOptions = options?.datasets.filter((dataset) => datasets.includes(dataset.key)) ?? [];
  const selectedDatasetSummary = selectedOptions.length === 1
    ? selectedOptions[0].label
    : `${selectedOptions.length} conjuntos selecionados`;
  const supports = (key: "supportsClass" | "supportsModality" | "supportsStatus" | "supportsPresence") =>
    selectedOptions.some((dataset) => dataset[key]);
  const selectedSensitiveCount = selectedOptions.reduce((count, dataset) =>
    count + dataset.fields.filter((field) => field.sensitive && columns[dataset.key]?.includes(field.key)).length, 0);
  const activeFilterCount = [
    Boolean(from || to),
    Boolean(classId),
    Boolean(modality),
    Boolean(status),
    Boolean(presence),
    Boolean(search.trim()),
    !includeTestData,
  ].filter(Boolean).length;

  function toggleDataset(key: string) {
    setDatasets((current) => current.includes(key)
      ? current.filter((value) => value !== key)
      : [...current, key]);
  }

  function toggleColumn(datasetKey: string, fieldKey: string) {
    setColumns((current) => {
      const selected = current[datasetKey] ?? [];
      return {
        ...current,
        [datasetKey]: selected.includes(fieldKey)
          ? selected.filter((key) => key !== fieldKey)
          : [...selected, fieldKey],
      };
    });
  }

  async function generateReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!datasets.length) {
      setError("Selecione ao menos um conjunto de dados.");
      return;
    }
    if (from && to && from > to) {
      setError("A data inicial deve ser anterior ou igual à data final.");
      return;
    }
    if (selectedOptions.some((dataset) => !columns[dataset.key]?.length)) {
      setError("Selecione ao menos uma coluna para cada conjunto escolhido.");
      return;
    }
    setGenerating(true);
    try {
      const blob = await adminDownload("/admin/reports/export", token, {
        datasets,
        columns: Object.fromEntries(datasets.map((key) => [key, columns[key] ?? []])),
        format,
        filters: {
          ...(from && { from }),
          ...(to && { to }),
          ...(classId && { classId }),
          ...(modality && { modality }),
          ...(status && { status }),
          ...(presence && { presence }),
          ...(search.trim() && { search: search.trim() }),
          includeTestData,
        },
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `relatorio-aluno-atleta-${new Date().toISOString().slice(0, 10)}.${format}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSuccess(`Relatório ${format.toUpperCase()} gerado. O arquivo inclui a contagem de registros por conjunto.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível gerar o relatório.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="admin-panel admin-report-builder">
      <div className="admin-panel-heading">
        <div><h2>Montar relatório</h2><p>Escolha os dados, aplique filtros e selecione as colunas da exportação.</p></div>
      </div>
      {error && <Alert severity="error" className="admin-alert">{error}</Alert>}
      {success && <Alert severity="success" className="admin-alert">{success}</Alert>}
      {loadingOptions ? (
        <div className="admin-loading" role="status"><CircularProgress size={22} /><span>Carregando opções...</span></div>
      ) : options && (
        <form className="admin-report-form" onSubmit={generateReport}>
          <details className="admin-report-collapsible">
            <summary>
              <span>Conjuntos de dados</span>
              <span>{selectedOptions.length ? selectedDatasetSummary : "Nenhum conjunto selecionado"}</span>
            </summary>
            <fieldset className="admin-report-fieldset">
              <legend>Dados para incluir</legend>
              <div className="admin-report-datasets">
                {options.datasets.map((dataset) => (
                  <label key={dataset.key} className="admin-report-choice">
                    <input type="checkbox" checked={datasets.includes(dataset.key)} onChange={() => toggleDataset(dataset.key)} />
                    <span>{dataset.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </details>

          {selectedOptions.map((dataset) => (
            <details className="admin-report-columns" key={dataset.key}>
              <summary>{dataset.label} <span>{columns[dataset.key]?.length ?? 0} colunas selecionadas</span></summary>
              <div className="admin-report-column-grid">
                {dataset.fields.map((field) => (
                  <label key={field.key} className="admin-report-choice">
                    <input
                      type="checkbox"
                      checked={columns[dataset.key]?.includes(field.key) ?? false}
                      onChange={() => toggleColumn(dataset.key, field.key)}
                    />
                    <span>{field.label}</span>
                    {field.sensitive && <small>pessoal</small>}
                  </label>
                ))}
              </div>
            </details>
          ))}

          {selectedSensitiveCount > 0 && (
            <Alert severity="warning">O relatório incluirá {selectedSensitiveCount} {selectedSensitiveCount === 1 ? "coluna com dado pessoal" : "colunas com dados pessoais"}. Proteja o arquivo após baixá-lo.</Alert>
          )}

          <details className="admin-report-collapsible">
            <summary>
              <span>Filtros opcionais</span>
              <span>{activeFilterCount ? `${activeFilterCount} ${activeFilterCount === 1 ? "filtro aplicado" : "filtros aplicados"}` : "Nenhum aplicado"}</span>
            </summary>
            <fieldset className="admin-report-fieldset">
              <legend>Refine os dados do relatório</legend>
              <Button
                type="button"
                className="admin-report-clear-filters"
                onClick={() => {
                  setFrom("");
                  setTo("");
                  setClassId("");
                  setModality("");
                  setStatus("");
                  setPresence("");
                  setSearch("");
                  setIncludeTestData(true);
                }}
              >
                Limpar filtros
              </Button>
              <div className="admin-report-filters">
                <TextField label="Data inicial" type="date" value={from} onChange={(event) => setFrom(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField label="Data final" type="date" value={to} onChange={(event) => setTo(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                {supports("supportsClass") && (
                  <FormControl className="admin-report-mui-select admin-report-filter-select">
                    <InputLabel id="report-class-label">Turma</InputLabel>
                    <Select labelId="report-class-label" label="Turma" value={classId} onChange={(event) => setClassId(event.target.value)} MenuProps={{ PaperProps: { className: "admin-report-filter-menu" } }}>
                      <MenuItem value="">Todas as turmas</MenuItem>
                      {options.classes.map((sportsClass) => <MenuItem key={sportsClass.id} value={sportsClass.id}>{sportsClass.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                )}
                {supports("supportsModality") && (
                  <FormControl className="admin-report-mui-select admin-report-filter-select">
                    <InputLabel id="report-modality-label">Modalidade</InputLabel>
                    <Select labelId="report-modality-label" label="Modalidade" value={modality} onChange={(event) => setModality(event.target.value)} MenuProps={{ PaperProps: { className: "admin-report-filter-menu" } }}>
                      <MenuItem value="">Todas as modalidades</MenuItem>
                      {options.modalities.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
                    </Select>
                  </FormControl>
                )}
                {supports("supportsStatus") && (
                  <FormControl className="admin-report-mui-select admin-report-filter-select">
                    <InputLabel id="report-status-label">Situação da inscrição</InputLabel>
                    <Select labelId="report-status-label" label="Situação da inscrição" value={status} onChange={(event) => setStatus(event.target.value)} MenuProps={{ PaperProps: { className: "admin-report-filter-menu" } }}>
                      <MenuItem value="">Todas</MenuItem>
                      <MenuItem value="pendente">Em análise</MenuItem>
                      <MenuItem value="aprovado">Aprovados</MenuItem>
                      <MenuItem value="recusado">Recusados</MenuItem>
                    </Select>
                  </FormControl>
                )}
                {supports("supportsPresence") && (
                  <FormControl className="admin-report-mui-select admin-report-filter-select">
                    <InputLabel id="report-presence-label">Presença</InputLabel>
                    <Select labelId="report-presence-label" label="Presença" value={presence} onChange={(event) => setPresence(event.target.value)} MenuProps={{ PaperProps: { className: "admin-report-filter-menu" } }}>
                      <MenuItem value="">Todas</MenuItem>
                      <MenuItem value="present">Presente</MenuItem>
                      <MenuItem value="absent">Ausente</MenuItem>
                    </Select>
                  </FormControl>
                )}
                <TextField label="Busca textual" placeholder="Nome, título ou descrição" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
              <FormControlLabel
                className="admin-report-test-data"
                control={<Checkbox checked={includeTestData} onChange={(event) => setIncludeTestData(event.target.checked)} />}
                label="Incluir dados de teste"
              />
              <small className="admin-report-hint">O período usa a data correspondente a cada conjunto. Limite de 5.000 registros por arquivo.</small>
            </fieldset>
          </details>

          <div className="admin-report-export">
            <FormControl className="admin-report-mui-select admin-report-format-select">
              <InputLabel id="report-format-label">Formato</InputLabel>
              <Select
                labelId="report-format-label"
                label="Formato"
                value={format}
                onChange={(event) => setFormat(event.target.value as "csv" | "xlsx" | "pdf")}
              >
                <MenuItem value="xlsx">Excel (.xlsx)</MenuItem>
                <MenuItem value="csv">CSV (.csv)</MenuItem>
                <MenuItem value="pdf">PDF (.pdf)</MenuItem>
              </Select>
            </FormControl>
            <Button type="submit" variant="contained" startIcon={generating ? <CircularProgress size={16} color="inherit" /> : <DownloadRounded />} disabled={generating || loadingOptions}>
              {generating ? "Gerando..." : "Gerar relatório"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

function ReportsPanel({ reports, token }: { reports: Reports; token: string }) {
  const maxCount = Math.max(1, ...reports.students.byModality.map(({ count }) => count));
  const [exportingTimeline, setExportingTimeline] = useState<"png" | "pdf" | null>(null);
  const [timelineError, setTimelineError] = useState("");
  const timeline = Array.from({ length: 12 }, (_, index) => {
    const date = new Date();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - 11 + index);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    return {
      year,
      month,
      count: reports.registrationTimeline.find((point) => point.year === year && point.month === month)?.count ?? 0,
      label: date.toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }),
    };
  });

  async function exportTimeline(format: "png" | "pdf") {
    setExportingTimeline(format);
    setTimelineError("");
    try {
      const fileDate = new Date().toISOString().slice(0, 10);
      let blob: Blob;
      if (format === "pdf") {
        blob = await adminDownload("/admin/reports/registration-timeline/pdf", token, {});
      } else {
        const svg = document.getElementById("student-registration-timeline");
        if (!(svg instanceof SVGSVGElement)) throw new Error("O gráfico ainda não está disponível para exportação.");
        const serialized = new XMLSerializer().serializeToString(svg);
        const svgUrl = URL.createObjectURL(new Blob([serialized], { type: "image/svg+xml;charset=utf-8" }));
        try {
          const image = new Image();
          image.src = svgUrl;
          await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error("Não foi possível converter o gráfico em imagem."));
          });
          const canvas = document.createElement("canvas");
          canvas.width = 1800;
          canvas.height = 680;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Não foi possível preparar a imagem do gráfico.");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Não foi possível exportar a imagem do gráfico.")), "image/png");
          });
        } finally {
          URL.revokeObjectURL(svgUrl);
        }
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `inscricoes-por-mes-${fileDate}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setTimelineError(reason instanceof Error ? reason.message : "Não foi possível exportar o gráfico.");
    } finally {
      setExportingTimeline(null);
    }
  }

  return (
    <div className="admin-reports">
      <section className="admin-stats-grid admin-report-stats">
        <article className="admin-stat-card"><span className="admin-stat-icon stat-total"><GroupsRounded /></span><span className="admin-stat-label">Total de alunos</span><strong>{reports.students.total}</strong><small>Todos os status</small></article>
        <article className="admin-stat-card"><span className="admin-stat-icon stat-pending"><PersonAddAltRounded /></span><span className="admin-stat-label">Professores ativos</span><strong>{reports.teachers}</strong><small>Contas habilitadas</small></article>
        <article className="admin-stat-card"><span className="admin-stat-icon stat-approved"><SportsSoccerRounded /></span><span className="admin-stat-label">Turmas ativas</span><strong>{reports.classes}</strong><small>Em todas as modalidades</small></article>
        <article className="admin-stat-card"><span className="admin-stat-icon stat-rejected"><BarChartRounded /></span><span className="admin-stat-label">Frequência no ano</span><strong>{reports.attendance.rate === null ? "—" : `${reports.attendance.rate}%`}</strong><small>{reports.attendance.records} registros de presença</small></article>
      </section>
      <section className="admin-panel admin-report-panel">
        <div className="admin-panel-heading"><div><h2>Alunos por modalidade</h2><p>Distribuição de alunos inscritos em cada esporte.</p></div></div>
        {reports.students.byModality.length ? (
          <div className="admin-report-bars">
            {reports.students.byModality.map(({ modality, count }) => (
              <div className="admin-report-bar-row" key={modality}>
                <span>{modality}</span><div><i style={{ width: `${Math.max(4, (count / maxCount) * 100)}%` }} /></div><b>{count}</b>
              </div>
            ))}
          </div>
        ) : <ManagementEmpty text="Ainda não há alunos registrados." />}
      </section>
      <section className="admin-panel admin-report-panel admin-timeline-panel">
        <div className="admin-panel-heading">
          <div><h2>Inscrições por período</h2><p>Quantidade de novas inscrições em cada mês nos últimos 12 meses.</p></div>
          <div className="admin-timeline-actions">
            <Button variant="outlined" size="small" onClick={() => void exportTimeline("png")} disabled={Boolean(exportingTimeline)}>
              {exportingTimeline === "png" ? "Exportando..." : "Baixar imagem"}
            </Button>
            <Button variant="outlined" size="small" onClick={() => void exportTimeline("pdf")} disabled={Boolean(exportingTimeline)}>
              {exportingTimeline === "pdf" ? "Gerando PDF..." : "Baixar PDF"}
            </Button>
          </div>
        </div>
        {timelineError && <Alert severity="error">{timelineError}</Alert>}
        <div className="admin-registration-chart-scroll">
          <svg
            id="student-registration-timeline"
            className="admin-registration-chart"
            viewBox="0 0 900 340"
            role="img"
            aria-label="Gráfico de inscrições de alunos por mês nos últimos 12 meses"
          >
            <text x="12" y="18" className="admin-chart-axis-title">Inscrições</text>
            {Array.from({ length: 5 }, (_, tick) => {
              const chartMax = Math.max(1, ...timeline.map(({ count }) => count));
              const value = Math.ceil(chartMax * (4 - tick) / 4);
              const y = 38 + tick * 54;
              return (
                <g key={tick}>
                  <text x="42" y={y + 4} textAnchor="end" className="admin-chart-label">{value}</text>
                  <line x1="52" x2="880" y1={y} y2={y} className="admin-chart-gridline" />
                </g>
              );
            })}
            {(() => {
              const chartMax = Math.max(1, ...timeline.map(({ count }) => count));
              const points = timeline.map((point, index) => {
                const x = 70 + index * 69;
                const y = 254 - (point.count / chartMax) * 208;
                return `${x},${y}`;
              }).join(" ");
              return <polyline points={points} className="admin-chart-line" />;
            })()}
            {timeline.map((point, index) => {
              const chartMax = Math.max(1, ...timeline.map(({ count }) => count));
              const x = 70 + index * 69;
              const y = 254 - (point.count / chartMax) * 208;
              return (
                <g key={`${point.year}-${point.month}`}>
                  <circle cx={x} cy={y} r="4" className="admin-chart-point" />
                  <text x={x} y={y - 10} textAnchor="middle" className="admin-chart-value">{point.count}</text>
                  <text x={x} y="278" textAnchor="middle" className="admin-chart-label">{point.label}</text>
                  <text x={x} y="294" textAnchor="middle" className="admin-chart-label">{String(point.year).slice(-2)}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </section>
      <section className="admin-panel admin-report-panel">
        <div className="admin-panel-heading"><div><h2>Situação das inscrições</h2><p>Resumo dos cadastros no sistema.</p></div></div>
        <div className="admin-report-status">
          <div><span className="status-pendente"><i /> Em análise</span><b>{reports.students.pendente}</b></div>
          <div><span className="status-aprovado"><i /> Aprovados</span><b>{reports.students.aprovado}</b></div>
          <div><span className="status-recusado"><i /> Recusados</span><b>{reports.students.recusado}</b></div>
        </div>
        <small className="admin-report-generated">Atualizado em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(reports.generatedAt))}</small>
      </section>
    </div>
  );
}
