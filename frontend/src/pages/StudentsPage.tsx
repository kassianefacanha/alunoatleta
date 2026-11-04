import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Badge, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, Grid, IconButton, InputLabel, MenuItem, Paper, Select, Stack, TextField, Tooltip, Typography, useMediaQuery
} from '@mui/material';
import FilterListRoundedIcon from '@mui/icons-material/FilterListRounded';
import { DataGrid, type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { ptBR } from '@mui/x-data-grid/locales';
import { DashboardLayout } from '../components/templates/DashboardLayout';
import { apiRequest } from '../lib/api';
import { hasPermission } from '../lib/permissions';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';

type EnrollmentStatus = 'pending' | 'approved' | 'rejected';

interface StudentRecord {
  _id: string;
  fullName: string;
  age: number;
  birthDate: string;
  sex: string;
  modality: string;
  school: string;
  address: { neighborhood: string; city: string; street: string; number: string; complement?: string };
  guardian: { name: string; phone: string };
  studentPhotoKey: string;
  signedFormPdfKey: string;
  enrollmentStatus: EnrollmentStatus;
  classIds?: string[];
  isArchived?: boolean;
  rejectionReason?: string;
  createdAt: string;
  userId: { email: string } | string;
}

interface SportsClass {
  _id: string;
  name: string;
  modality: string;
  capacity: number;
  studentIds: string[];
  isActive: boolean;
}

interface StudentFilters {
  name: string;
  status: string;
  modality: string;
  from: string;
  to: string;
}

interface StudentDraft {
  fullName: string;
  email: string;
  birthDate: string;
  sex: string;
  modality: string;
  school: string;
  address: { neighborhood: string; city: string; street: string; number: string; complement: string };
  guardian: { name: string; phone: string };
}

const emptyFilters: StudentFilters = { name: '', status: '', modality: '', from: '', to: '' };
const statusLabels: Record<EnrollmentStatus, string> = {
  pending: 'Pendente',
  approved: 'Aprovada',
  rejected: 'Recusada'
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR');
}

function localDateStart(value: string) {
  return new Date(`${value}T00:00:00`).toISOString();
}

function localDateEnd(value: string) {
  return new Date(`${value}T23:59:59.999`).toISOString();
}

function getEmail(student: StudentRecord) {
  return typeof student.userId === 'string' ? '' : student.userId.email;
}

export function StudentsPage() {
  const navigate = useNavigate();
  const user = JSON.parse(sessionStorage.getItem('user') ?? '{"email":"Usuário","role":"teacher"}') as { email: string; role: string };
  const canReview = user.role === 'admin' || (user.role === 'teacher' && hasPermission('students:write'));
  const isAdmin = user.role === 'admin';
  const [filters, setFilters] = useState<StudentFilters>(emptyFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [studentsTotal, setStudentsTotal] = useState(0);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 10 });
  const studentRequestId = useRef(0);
  const [archivedStudents, setArchivedStudents] = useState<StudentRecord[]>([]);
  const [archivedClassSelection, setArchivedClassSelection] = useState<Record<string, string>>({});
  const [classes, setClasses] = useState<SportsClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentRecord | null>(null);
  const [reviewStatus, setReviewStatus] = useState<'approved' | 'rejected'>('approved');
  const [reviewClassId, setReviewClassId] = useState('');
  const [reviewReason, setReviewReason] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [documentLoading, setDocumentLoading] = useState<'photo' | 'form' | null>(null);
  const [editingStudent, setEditingStudent] = useState<StudentRecord | null>(null);
  const [studentDraft, setStudentDraft] = useState<StudentDraft>({
    fullName: '', email: '', birthDate: '', sex: 'Prefiro não informar', modality: '', school: '',
    address: { neighborhood: '', city: '', street: '', number: '', complement: '' },
    guardian: { name: '', phone: '' }
  });
  const [savingStudent, setSavingStudent] = useState(false);
  const [archivingStudent, setArchivingStudent] = useState<StudentRecord | null>(null);
  const [archiving, setArchiving] = useState(false);
  const isMobile = useMediaQuery('(max-width:599px)');

  async function loadStudents(
    activeFilters: StudentFilters = filters,
    page = paginationModel.page,
    pageSize = paginationModel.pageSize
  ) {
    const requestId = ++studentRequestId.current;
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams();
      if (activeFilters.name.trim()) query.set('name', activeFilters.name.trim());
      if (activeFilters.status) query.set('status', activeFilters.status);
      if (activeFilters.modality) query.set('modality', activeFilters.modality);
      if (activeFilters.from) query.set('from', localDateStart(activeFilters.from));
      if (activeFilters.to) query.set('to', localDateEnd(activeFilters.to));
      query.set('page', String(page + 1));
      query.set('pageSize', String(pageSize));
      const result = await apiRequest<{ students: StudentRecord[]; total: number; page: number }>(`/students?${query.toString()}`);
      if (requestId !== studentRequestId.current) return;
      setStudents(result.students);
      setStudentsTotal(result.total);
      if (result.page - 1 !== page) setPaginationModel({ page: result.page - 1, pageSize });
    } catch (reason) {
      if (requestId !== studentRequestId.current) return;
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os alunos.');
    } finally {
      if (requestId === studentRequestId.current) setLoading(false);
    }
  }

  async function loadArchivedStudents() {
    if (!isAdmin) return;
    try {
      const result = await apiRequest<{ students: StudentRecord[] }>('/students/archived');
      setArchivedStudents(result.students);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os cadastros arquivados.');
    }
  }

  useEffect(() => {
    void loadStudents(emptyFilters, 0, paginationModel.pageSize);
    void loadArchivedStudents();
    apiRequest<{ classes: SportsClass[] }>('/classes')
      .then((result) => setClasses(result.classes))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as turmas.'));
  }, []);

  async function openDocument(student: StudentRecord, kind: 'photo' | 'form') {
    const popup = window.open('about:blank', '_blank');
    if (!popup) {
      setError('Permita a abertura de janelas pop-up para visualizar os documentos.');
      return;
    }
    popup.opener = null;
    setDocumentLoading(kind);
    setError('');
    try {
      const key = kind === 'photo' ? student.studentPhotoKey : student.signedFormPdfKey;
      const result = await apiRequest<{ downloadUrl: string }>('/uploads/download?key=' + encodeURIComponent(key));
      popup.location.href = result.downloadUrl;
    } catch (reason) {
      popup.close();
      setError(reason instanceof Error ? reason.message : 'Não foi possível abrir o documento.');
    } finally {
      setDocumentLoading(null);
    }
  }

  async function submitReview() {
    if (!selectedStudent) return;
    if (reviewStatus === 'approved' && !reviewClassId) {
      setError('Selecione uma turma para aprovar a inscrição.');
      return;
    }
    if (reviewStatus === 'rejected' && !reviewReason.trim()) {
      setError('Informe o motivo da recusa.');
      return;
    }
    setReviewLoading(true);
    setError('');
    try {
      await apiRequest(`/students/${selectedStudent._id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: reviewStatus,
          ...(reviewStatus === 'approved' ? { classId: reviewClassId } : { reason: reviewReason.trim() })
        })
      });
      setNotice(`Inscrição de ${selectedStudent.fullName} ${reviewStatus === 'approved' ? 'aprovada' : 'recusada'}.`);
      setSelectedStudent(null);
      setReviewReason('');
      setReviewClassId('');
      await loadStudents(filters);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível analisar a inscrição.');
    } finally {
      setReviewLoading(false);
    }
  }

  function openEditor(student: StudentRecord) {
    setEditingStudent(student);
    setStudentDraft({
      fullName: student.fullName,
      email: getEmail(student),
      birthDate: student.birthDate.slice(0, 10),
      sex: student.sex,
      modality: student.modality,
      school: student.school,
      address: {
        neighborhood: student.address.neighborhood,
        city: student.address.city,
        street: student.address.street,
        number: student.address.number,
        complement: student.address.complement ?? ''
      },
      guardian: { ...student.guardian }
    });
    setError('');
  }

  async function saveStudent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingStudent) return;
    setSavingStudent(true);
    setError('');
    try {
      await apiRequest(`/students/${editingStudent._id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...studentDraft,
          fullName: studentDraft.fullName.trim(),
          email: studentDraft.email.trim(),
          birthDate: studentDraft.birthDate,
          sex: studentDraft.sex,
          modality: studentDraft.modality.trim(),
          school: studentDraft.school.trim(),
          address: {
            neighborhood: studentDraft.address.neighborhood.trim(),
            city: studentDraft.address.city.trim(),
            street: studentDraft.address.street.trim(),
            number: studentDraft.address.number.trim(),
            ...(studentDraft.address.complement.trim() ? { complement: studentDraft.address.complement.trim() } : {})
          },
          guardian: {
            name: studentDraft.guardian.name.trim(),
            phone: studentDraft.guardian.phone.trim()
          }
        })
      });
      setNotice(`Cadastro de ${studentDraft.fullName.trim()} atualizado.`);
      setEditingStudent(null);
      await loadStudents(filters);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar o cadastro.');
    } finally {
      setSavingStudent(false);
    }
  }

  async function archiveStudent() {
    if (!archivingStudent) return;
    setArchiving(true);
    setError('');
    try {
      await apiRequest(`/students/${archivingStudent._id}`, { method: 'DELETE' });
      setNotice(`Cadastro de ${archivingStudent.fullName} arquivado; o histórico foi preservado.`);
      setArchivingStudent(null);
      await Promise.all([loadStudents(filters), loadArchivedStudents()]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível arquivar o cadastro.');
    } finally {
      setArchiving(false);
    }
  }

  async function restoreStudent(student: StudentRecord) {
    setError('');
    try {
      const classId = archivedClassSelection[student._id];
      await apiRequest(`/students/${student._id}/restore`, {
        method: 'PATCH',
        body: JSON.stringify(classId ? { classId } : {})
      });
      setNotice(`Cadastro de ${student.fullName} restaurado.`);
      setArchivedClassSelection((current) => {
        const next = { ...current };
        delete next[student._id];
        return next;
      });
      await Promise.all([loadStudents(filters), loadArchivedStudents()]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível restaurar o cadastro.');
    }
  }

  const matchingClasses = classes.filter((sportsClass) =>
    sportsClass.isActive && sportsClass.modality === selectedStudent?.modality
  );
  const activeFilterCount = [filters.status, filters.modality, filters.from, filters.to].filter(Boolean).length;
  const columns: GridColDef<StudentRecord>[] = [
    {
      field: 'fullName',
      headerName: 'Aluno',
      minWidth: isMobile ? 140 : 220,
      flex: 1.4,
      renderCell: ({ row }) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" fontWeight={700} noWrap>{row.fullName}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: { xs: 'none', sm: 'block' } }}>{getEmail(row)}</Typography>
        </Box>
      )
    },
    { field: 'modality', headerName: 'Modalidade', minWidth: 120, flex: 0.7 },
    {
      field: 'createdAt',
      headerName: 'Inscrição',
      minWidth: 115,
      valueFormatter: (value) => formatDate(String(value))
    },
    {
      field: 'enrollmentStatus',
      headerName: 'Situação',
      minWidth: isMobile ? 105 : 120,
      renderCell: ({ row }) => (
        <Chip
          size="small"
          label={statusLabels[row.enrollmentStatus]}
          color={row.enrollmentStatus === 'approved' ? 'success' : row.enrollmentStatus === 'rejected' ? 'error' : 'warning'}
        />
      )
    },
    {
      field: 'actions',
      headerName: 'Ações',
      sortable: false,
      filterable: false,
      minWidth: isAdmin ? (isMobile ? 155 : 175) : canReview ? 90 : 55,
      renderCell: ({ row }) => (
        <Stack direction="row" spacing={0.25}>
          <Tooltip title="Ver detalhes">
            <IconButton size="small" aria-label={`Ver detalhes de ${row.fullName}`} onClick={() => openStudent(row)}>
              <InfoOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {canReview && row.enrollmentStatus === 'pending' && (
            <Tooltip title="Analisar inscrição">
              <IconButton size="small" color="primary" aria-label={`Analisar inscrição de ${row.fullName}`} onClick={() => openStudent(row)}>
                <FactCheckOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {isAdmin && (
            <>
              <Tooltip title="Editar cadastro">
                <IconButton size="small" aria-label={`Editar cadastro de ${row.fullName}`} onClick={() => openEditor(row)}>
                  <EditOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Arquivar cadastro">
                <IconButton size="small" color="warning" aria-label={`Arquivar cadastro de ${row.fullName}`} onClick={() => { setError(''); setArchivingStudent(row); }}>
                  <ArchiveOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Stack>
      )
    }
  ];

  function openStudent(student: StudentRecord) {
    setSelectedStudent(student);
    setReviewStatus('approved');
    setReviewClassId('');
    setReviewReason('');
    setError('');
  }

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFiltersOpen(false);
    setPaginationModel((current) => ({ ...current, page: 0 }));
    void loadStudents(filters, 0, paginationModel.pageSize);
  }

  const logout = () => {
    sessionStorage.clear();
    navigate('/login');
  };

  return (
    <DashboardLayout name={user.email} onLogout={logout}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="overline" color="primary" fontWeight={800}>GESTÃO</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {canReview ? 'Consulte cadastros e analise as inscrições da sua equipe.' : 'Consulte os cadastros e documentos das inscrições.'}
          </Typography>
        </Box>

        {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Stack component="form" onSubmit={applyFilters} direction="row" spacing={1} alignItems="center">
            <TextField
              label="Buscar aluno por nome"
              size="small"
              value={filters.name}
              onChange={(event) => setFilters({ ...filters, name: event.target.value })}
              sx={{ maxWidth: 440, flex: 1 }}
            />
            <Button type="submit" variant="contained" disabled={loading}>Buscar</Button>
            <Tooltip title="Filtros avançados">
              <IconButton aria-label="Abrir filtros avançados" onClick={() => setFiltersOpen(true)}>
                <Badge badgeContent={activeFilterCount} color="primary"><FilterListRoundedIcon /></Badge>
              </IconButton>
            </Tooltip>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <DataGrid
            rows={students}
            columns={columns}
            getRowId={(row) => row._id}
            loading={loading}
            paginationMode="server"
            rowCount={studentsTotal}
            localeText={ptBR.components.MuiDataGrid.defaultProps.localeText}
            disableRowSelectionOnClick
            columnVisibilityModel={isMobile ? { modality: false, createdAt: false } : undefined}
            pageSizeOptions={[10, 25, 50]}
            paginationModel={paginationModel}
            onPaginationModelChange={(model) => {
              setPaginationModel(model);
              void loadStudents(filters, model.page, model.pageSize);
            }}
            autoHeight
            sx={{
              minHeight: 360,
              border: 0,
              '& .MuiDataGrid-columnHeaders': { bgcolor: 'action.hover' },
              '& .MuiDataGrid-cell': { py: 1 }
            }}
          />
        </Paper>
        {isAdmin && (
          <Accordion disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
              <Box>
                <Typography fontWeight={750}>Cadastros de alunos arquivados</Typography>
                <Typography variant="body2" color="text.secondary">
                  {archivedStudents.length} cadastro(s) — até 200 mais recentes
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              {archivedStudents.length === 0 ? (
                <Typography color="text.secondary">Não há cadastros arquivados.</Typography>
              ) : (
                <Stack spacing={1}>
                  {archivedStudents.map((student) => (
                    <Paper key={student._id} variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Box sx={{ flex: 1, minWidth: 180 }}>
                        <Typography fontWeight={700}>{student.fullName}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {getEmail(student)} · {statusLabels[student.enrollmentStatus]}
                        </Typography>
                      </Box>
                      {student.enrollmentStatus === 'approved' && (
                        <TextField
                          select
                          size="small"
                          label="Turma para restauração"
                          value={archivedClassSelection[student._id] ?? ''}
                          onChange={(event) => setArchivedClassSelection((current) => ({ ...current, [student._id]: event.target.value }))}
                          sx={{ minWidth: { xs: '100%', sm: 220 } }}
                        >
                          {classes
                            .filter((sportsClass) => sportsClass.modality === student.modality && sportsClass.isActive)
                            .map((sportsClass) => {
                              const alreadyLinked = sportsClass.studentIds.includes(student._id);
                              const available = alreadyLinked || sportsClass.studentIds.length < sportsClass.capacity;
                              return (
                                <MenuItem key={sportsClass._id} value={sportsClass._id} disabled={!available}>
                                  {sportsClass.name} · {sportsClass.studentIds.length}/{sportsClass.capacity}
                                </MenuItem>
                              );
                            })}
                        </TextField>
                      )}
                      <Button
                        variant="outlined"
                        disabled={student.enrollmentStatus === 'approved' && !archivedClassSelection[student._id]}
                        onClick={() => void restoreStudent(student)}
                      >
                        Restaurar cadastro
                      </Button>
                    </Paper>
                  ))}
                </Stack>
              )}
            </AccordionDetails>
          </Accordion>
        )}
      </Stack>

      <Dialog open={filtersOpen} onClose={() => setFiltersOpen(false)} fullWidth maxWidth="xs">
        <Box component="form" onSubmit={applyFilters}>
          <DialogTitle>Filtros avançados</DialogTitle>
          <DialogContent sx={{ display: 'grid', gap: 2, pt: '12px !important' }}>
            <FormControl size="small">
              <InputLabel id="student-status-label">Situação</InputLabel>
              <Select
                labelId="student-status-label"
                label="Situação"
                value={filters.status}
                onChange={(event) => setFilters({ ...filters, status: event.target.value })}
              >
                <MenuItem value="">Todas</MenuItem>
                <MenuItem value="pending">Pendente</MenuItem>
                <MenuItem value="approved">Aprovada</MenuItem>
                <MenuItem value="rejected">Recusada</MenuItem>
              </Select>
            </FormControl>
            <TextField label="Modalidade" value={filters.modality} onChange={(event) => setFilters({ ...filters, modality: event.target.value })} />
            <TextField label="Inscrita a partir de" type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} InputLabelProps={{ shrink: true }} inputProps={{ max: filters.to || undefined }} />
            <TextField label="Inscrita até" type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} InputLabelProps={{ shrink: true }} inputProps={{ min: filters.from || undefined }} />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button
              onClick={() => {
                setFilters(emptyFilters);
                setFiltersOpen(false);
                void loadStudents(emptyFilters);
              }}
              disabled={loading}
            >
              Limpar filtros
            </Button>
            <Button onClick={() => setFiltersOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={loading}>Aplicar</Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog open={Boolean(selectedStudent)} onClose={() => !reviewLoading && setSelectedStudent(null)} fullWidth maxWidth="md">
        <DialogTitle>Dados da inscrição</DialogTitle>
        <DialogContent dividers>
          {selectedStudent && (
            <Stack spacing={2.5}>
              {error && <Alert severity="error">{error}</Alert>}
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}><Typography variant="caption" color="text.secondary">Aluno</Typography><Typography>{selectedStudent.fullName}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography variant="caption" color="text.secondary">E-mail</Typography><Typography>{getEmail(selectedStudent)}</Typography></Grid>
                <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Idade</Typography><Typography>{selectedStudent.age} anos</Typography></Grid>
                <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Nascimento</Typography><Typography>{formatDate(selectedStudent.birthDate)}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography variant="caption" color="text.secondary">Modalidade</Typography><Typography>{selectedStudent.modality}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography variant="caption" color="text.secondary">Escola</Typography><Typography>{selectedStudent.school}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography variant="caption" color="text.secondary">Responsável</Typography><Typography>{selectedStudent.guardian.name} · {selectedStudent.guardian.phone}</Typography></Grid>
                <Grid item xs={12}><Typography variant="caption" color="text.secondary">Endereço</Typography><Typography>{selectedStudent.address.street}, {selectedStudent.address.number}{selectedStudent.address.complement ? `, ${selectedStudent.address.complement}` : ''} · {selectedStudent.address.neighborhood}, {selectedStudent.address.city}</Typography></Grid>
                {selectedStudent.rejectionReason && <Grid item xs={12}><Alert severity="warning">Motivo da recusa anterior: {selectedStudent.rejectionReason}</Alert></Grid>}
              </Grid>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button variant="outlined" disabled={Boolean(documentLoading)} onClick={() => void openDocument(selectedStudent, 'photo')}>
                  {documentLoading === 'photo' ? 'Abrindo foto...' : 'Ver foto do aluno'}
                </Button>
                <Button variant="outlined" disabled={Boolean(documentLoading)} onClick={() => void openDocument(selectedStudent, 'form')}>
                  {documentLoading === 'form' ? 'Abrindo ficha...' : 'Ver ficha assinada'}
                </Button>
              </Stack>

              {selectedStudent.enrollmentStatus === 'pending' && canReview && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="h6" fontWeight={750} sx={{ mb: 2 }}>Analisar inscrição</Typography>
                  <Stack spacing={2}>
                    <FormControl size="small">
                      <InputLabel id="review-status-label">Decisão</InputLabel>
                      <Select
                        labelId="review-status-label"
                        label="Decisão"
                        value={reviewStatus}
                        onChange={(event) => setReviewStatus(event.target.value as 'approved' | 'rejected')}
                      >
                        <MenuItem value="approved">Aprovar</MenuItem>
                        <MenuItem value="rejected">Recusar</MenuItem>
                      </Select>
                    </FormControl>
                    {reviewStatus === 'approved' ? (
                      <FormControl size="small" required>
                        <InputLabel id="review-class-label">Turma</InputLabel>
                        <Select
                          labelId="review-class-label"
                          label="Turma"
                          value={reviewClassId}
                          onChange={(event) => setReviewClassId(event.target.value)}
                        >
                          {matchingClasses.map((sportsClass) => (
                            <MenuItem key={sportsClass._id} value={sportsClass._id} disabled={sportsClass.studentIds.length >= sportsClass.capacity}>
                              {sportsClass.name} · {sportsClass.studentIds.length}/{sportsClass.capacity} vagas
                            </MenuItem>
                          ))}
                        </Select>
                        {matchingClasses.length === 0 && <Typography variant="caption" color="error" sx={{ mt: 1 }}>Não há turma cadastrada para {selectedStudent.modality}.</Typography>}
                      </FormControl>
                    ) : (
                      <TextField
                        label="Motivo da recusa"
                        value={reviewReason}
                        onChange={(event) => setReviewReason(event.target.value)}
                        multiline
                        minRows={3}
                        inputProps={{ maxLength: 1000 }}
                        required
                      />
                    )}
                  </Stack>
                </Paper>
              )}
              {selectedStudent.enrollmentStatus === 'pending' && !canReview && (
                <Alert severity="info">Acesso somente para consulta. Você não tem permissão para analisar inscrições.</Alert>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setSelectedStudent(null)} disabled={reviewLoading}>Fechar</Button>
          {selectedStudent?.enrollmentStatus === 'pending' && canReview && (
            <Button
              variant="contained"
              onClick={() => void submitReview()}
              disabled={reviewLoading || (reviewStatus === 'approved' && matchingClasses.length === 0)}
              startIcon={reviewLoading ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              {reviewStatus === 'approved' ? 'Aprovar inscrição' : 'Registrar recusa'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
      <Dialog open={Boolean(editingStudent)} onClose={() => !savingStudent && setEditingStudent(null)} fullWidth maxWidth="sm">
        <Box component="form" onSubmit={(event) => void saveStudent(event)}>
          <DialogTitle>Editar cadastro do aluno</DialogTitle>
          <DialogContent sx={{ display: 'grid', gap: 2, pt: '12px !important' }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="Nome completo" value={studentDraft.fullName} onChange={(event) => setStudentDraft({ ...studentDraft, fullName: event.target.value })} inputProps={{ maxLength: 150 }} required />
            <TextField label="E-mail de acesso" type="email" value={studentDraft.email} onChange={(event) => setStudentDraft({ ...studentDraft, email: event.target.value })} inputProps={{ maxLength: 254 }} required />
            <TextField label="Data de nascimento" type="date" value={studentDraft.birthDate} onChange={(event) => setStudentDraft({ ...studentDraft, birthDate: event.target.value })} InputLabelProps={{ shrink: true }} required />
            <FormControl>
              <InputLabel id="student-edit-sex-label">Sexo</InputLabel>
              <Select
                labelId="student-edit-sex-label"
                label="Sexo"
                value={studentDraft.sex}
                onChange={(event) => setStudentDraft({ ...studentDraft, sex: event.target.value })}
              >
                {['Feminino', 'Masculino', 'Outro', 'Prefiro não informar'].map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField
              label="Modalidade"
              value={studentDraft.modality}
              onChange={(event) => setStudentDraft({ ...studentDraft, modality: event.target.value })}
              inputProps={{ maxLength: 80 }}
              helperText={editingStudent?.enrollmentStatus === 'approved' && editingStudent.classIds?.length ? 'Não pode ser alterada enquanto houver vínculo com turma.' : undefined}
              disabled={Boolean(editingStudent?.enrollmentStatus === 'approved' && editingStudent.classIds?.length)}
              required
            />
            <TextField label="Escola" value={studentDraft.school} onChange={(event) => setStudentDraft({ ...studentDraft, school: event.target.value })} inputProps={{ maxLength: 160 }} required />
            <TextField label="Rua" value={studentDraft.address.street} onChange={(event) => setStudentDraft({ ...studentDraft, address: { ...studentDraft.address, street: event.target.value } })} inputProps={{ maxLength: 180 }} required />
            <TextField label="Número" value={studentDraft.address.number} onChange={(event) => setStudentDraft({ ...studentDraft, address: { ...studentDraft.address, number: event.target.value } })} inputProps={{ maxLength: 20 }} required />
            <TextField label="Complemento" value={studentDraft.address.complement} onChange={(event) => setStudentDraft({ ...studentDraft, address: { ...studentDraft.address, complement: event.target.value } })} inputProps={{ maxLength: 120 }} />
            <TextField label="Bairro" value={studentDraft.address.neighborhood} onChange={(event) => setStudentDraft({ ...studentDraft, address: { ...studentDraft.address, neighborhood: event.target.value } })} inputProps={{ maxLength: 120 }} required />
            <TextField label="Cidade" value={studentDraft.address.city} onChange={(event) => setStudentDraft({ ...studentDraft, address: { ...studentDraft.address, city: event.target.value } })} inputProps={{ maxLength: 120 }} required />
            <TextField label="Nome do responsável" value={studentDraft.guardian.name} onChange={(event) => setStudentDraft({ ...studentDraft, guardian: { ...studentDraft.guardian, name: event.target.value } })} inputProps={{ maxLength: 150 }} required />
            <TextField label="Telefone do responsável" value={studentDraft.guardian.phone} onChange={(event) => setStudentDraft({ ...studentDraft, guardian: { ...studentDraft.guardian, phone: event.target.value } })} placeholder="(00) 00000-0000" required />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setEditingStudent(null)} disabled={savingStudent}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={savingStudent}>{savingStudent ? 'Salvando...' : 'Salvar alterações'}</Button>
          </DialogActions>
        </Box>
      </Dialog>
      <Dialog open={Boolean(archivingStudent)} onClose={() => !archiving && setArchivingStudent(null)} fullWidth maxWidth="xs">
        <DialogTitle>Arquivar cadastro?</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Typography>
            {archivingStudent?.fullName} perderá o acesso ao sistema e sairá das listas ativas. Chamadas, avaliações e demais registros serão preservados.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setArchivingStudent(null)} disabled={archiving}>Cancelar</Button>
          <Button color="warning" variant="contained" onClick={() => void archiveStudent()} disabled={archiving}>
            {archiving ? 'Arquivando...' : 'Arquivar cadastro'}
          </Button>
        </DialogActions>
      </Dialog>
    </DashboardLayout>
  );
}
