import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Badge, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, Grid, IconButton, InputLabel, MenuItem, Paper, Select, Stack, TextField, Tooltip, Typography, useMediaQuery
} from '@mui/material';
import FilterListRoundedIcon from '@mui/icons-material/FilterListRounded';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { ptBR } from '@mui/x-data-grid/locales';
import { DashboardLayout } from '../components/templates/DashboardLayout';
import { apiRequest } from '../lib/api';

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
  rejectionReason?: string;
  createdAt: string;
  userId: { email: string } | string;
}

interface SportsClass {
  _id: string;
  name: string;
  modality: string;
}

interface StudentFilters {
  name: string;
  status: string;
  modality: string;
  from: string;
  to: string;
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
  const user = JSON.parse(sessionStorage.getItem('user') ?? '{"email":"Usuário","role":"teacher"}') as { email: string };
  const [filters, setFilters] = useState<StudentFilters>(emptyFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [students, setStudents] = useState<StudentRecord[]>([]);
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
  const isMobile = useMediaQuery('(max-width:599px)');

  async function loadStudents(activeFilters: StudentFilters = emptyFilters) {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams();
      if (activeFilters.name.trim()) query.set('name', activeFilters.name.trim());
      if (activeFilters.status) query.set('status', activeFilters.status);
      if (activeFilters.modality) query.set('modality', activeFilters.modality);
      if (activeFilters.from) query.set('from', localDateStart(activeFilters.from));
      if (activeFilters.to) query.set('to', localDateEnd(activeFilters.to));
      const suffix = query.size ? `?${query.toString()}` : '';
      const result = await apiRequest<{ students: StudentRecord[] }>(`/students${suffix}`);
      setStudents(result.students);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os alunos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStudents();
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

  const matchingClasses = classes.filter((sportsClass) => sportsClass.modality === selectedStudent?.modality);
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
      minWidth: isMobile ? 85 : 165,
      renderCell: ({ row }) => (
        <Stack direction="row" spacing={0.5}>
          <Button size="small" sx={{ px: 0.5, minWidth: 0 }} onClick={() => openStudent(row)}>Detalhes</Button>
          {!isMobile && row.enrollmentStatus === 'pending' && (
            <Button size="small" variant="contained" onClick={() => openStudent(row)}>Analisar</Button>
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
    void loadStudents(filters);
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
          <Typography variant="h4" fontWeight={800}>Alunos e inscrições</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>Consulte cadastros e analise as inscrições da sua equipe.</Typography>
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
            localeText={ptBR.components.MuiDataGrid.defaultProps.localeText}
            disableRowSelectionOnClick
            columnVisibilityModel={isMobile ? { modality: false, createdAt: false } : undefined}
            pageSizeOptions={[10, 25, 50]}
            initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
            autoHeight
            sx={{
              minHeight: 360,
              border: 0,
              '& .MuiDataGrid-columnHeaders': { bgcolor: 'action.hover' },
              '& .MuiDataGrid-cell': { py: 1 }
            }}
          />
        </Paper>
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

              {selectedStudent.enrollmentStatus === 'pending' && (
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
                            <MenuItem key={sportsClass._id} value={sportsClass._id}>{sportsClass.name}</MenuItem>
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
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setSelectedStudent(null)} disabled={reviewLoading}>Fechar</Button>
          {selectedStudent?.enrollmentStatus === 'pending' && (
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
    </DashboardLayout>
  );
}
