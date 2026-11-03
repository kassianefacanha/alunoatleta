import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Checkbox, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Grid, MenuItem, Paper, Stack, TextField, Typography, useMediaQuery
} from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { ptBR } from '@mui/x-data-grid/locales';
import { DashboardLayout } from '../components/templates/DashboardLayout';
import { apiRequest } from '../lib/api';

const availablePermissions = [
  { value: 'students:read', label: 'Consultar alunos e inscrições' },
  { value: 'students:write', label: 'Analisar inscrições' },
  { value: 'attendance:write', label: 'Registrar presença' },
  { value: 'assignments:read', label: 'Consultar tarefas' },
  { value: 'assignments:write', label: 'Criar tarefas' },
  { value: 'materials:write', label: 'Publicar materiais' },
  { value: 'notifications:write', label: 'Enviar notificações' },
  { value: 'events:write', label: 'Criar eventos e planos de aula' },
  { value: 'evaluations:write', label: 'Avaliar alunos' },
  { value: 'social:read', label: 'Consultar rede social' },
  { value: 'social:write', label: 'Publicar e interagir na rede social' },
  { value: 'exports:read', label: 'Exportar lista de alunos' }
] as const;

type Permission = typeof availablePermissions[number]['value'];

interface TeacherRecord {
  _id: string;
  email: string;
  isActive: boolean;
  teacherPermissions: Permission[];
  createdAt: string;
}

interface SportsClass {
  _id: string;
  name: string;
  modality: string;
  location?: string;
  isActive: boolean;
  studentIds: string[];
  teacherId: { _id: string; email: string } | string;
}

interface ClassDraft {
  name: string;
  modality: string;
  location: string;
  teacherId: string;
}

export function ClassesPage() {
  const navigate = useNavigate();
  const user = JSON.parse(sessionStorage.getItem('user') ?? '{"email":"Usuário","role":"teacher"}') as { email: string; role: string };
  const isAdmin = user.role === 'admin';
  const [classes, setClasses] = useState<SportsClass[]>([]);
  const [teachers, setTeachers] = useState<TeacherRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingClass, setSavingClass] = useState(false);
  const [savingTeacher, setSavingTeacher] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState<string | null>(null);
  const [savingTeacherStatus, setSavingTeacherStatus] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [classDialogOpen, setClassDialogOpen] = useState(false);
  const [teacherDialogOpen, setTeacherDialogOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [className, setClassName] = useState('');
  const [modality, setModality] = useState('Futsal');
  const [location, setLocation] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [teacherEmail, setTeacherEmail] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [permissionDrafts, setPermissionDrafts] = useState<Record<string, Permission[]>>({});
  const [editingClass, setEditingClass] = useState<SportsClass | null>(null);
  const [classDraft, setClassDraft] = useState<ClassDraft>({ name: '', modality: '', location: '', teacherId: '' });
  const isMobile = useMediaQuery('(max-width:599px)');

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [classResult, teacherResult] = await Promise.all([
        apiRequest<{ classes: SportsClass[] }>('/classes'),
        isAdmin ? apiRequest<{ teachers: TeacherRecord[] }>('/teachers') : Promise.resolve({ teachers: [] })
      ]);
      setClasses(classResult.classes);
      setTeachers(teacherResult.teachers);
      setPermissionDrafts(Object.fromEntries(teacherResult.teachers.map((teacher) => [teacher._id, teacher.teacherPermissions])));
      if (!teacherId && teacherResult.teachers.length) setTeacherId(teacherResult.teachers[0]._id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar turmas e professores.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function createClass(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingClass(true);
    setError('');
    try {
      await apiRequest('/classes', {
        method: 'POST',
        body: JSON.stringify({
          name: className.trim(),
          modality: modality.trim(),
          location: location.trim() || undefined,
          ...(isAdmin ? { teacherId } : {})
        })
      });
      setClassName('');
      setLocation('');
      setClassDialogOpen(false);
      setNotice('Turma criada com sucesso.');
      await loadData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar a turma.');
    } finally {
      setSavingClass(false);
    }
  }

  function openClassEditor(sportsClass: SportsClass) {
    setEditingClass(sportsClass);
    setClassDraft({
      name: sportsClass.name,
      modality: sportsClass.modality,
      location: sportsClass.location ?? '',
      teacherId: typeof sportsClass.teacherId === 'string' ? sportsClass.teacherId : sportsClass.teacherId._id
    });
  }

  async function saveClass(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingClass) return;
    setSavingEdit(true);
    setError('');
    setNotice('');
    try {
      await apiRequest(`/classes/${editingClass._id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: classDraft.name.trim(),
          modality: classDraft.modality.trim(),
          location: classDraft.location.trim() || undefined,
          ...(isAdmin ? { teacherId: classDraft.teacherId } : {})
        })
      });
      setEditingClass(null);
      setNotice(`Turma ${classDraft.name.trim()} atualizada.`);
      await loadData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar a turma.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function createTeacher(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingTeacher(true);
    setError('');
    try {
      await apiRequest('/teachers', {
        method: 'POST',
        body: JSON.stringify({ email: teacherEmail, password: teacherPassword })
      });
      setTeacherEmail('');
      setTeacherPassword('');
      setTeacherDialogOpen(false);
      setNotice('Professor cadastrado. Compartilhe a senha inicial por um canal seguro.');
      await loadData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível cadastrar o professor.');
    } finally {
      setSavingTeacher(false);
    }
  }

  async function savePermissions(teacher: TeacherRecord) {
    const permissions = permissionDrafts[teacher._id] ?? [];
    setSavingPermissions(teacher._id);
    setError('');
    try {
      await apiRequest(`/teachers/${teacher._id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissions })
      });
      setNotice(`Permissões de ${teacher.email} atualizadas.`);
      await loadData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar as permissões.');
    } finally {
      setSavingPermissions(null);
    }
  }

  async function toggleTeacherStatus(teacher: TeacherRecord) {
    setSavingTeacherStatus(teacher._id);
    setError('');
    setNotice('');
    try {
      await apiRequest(`/teachers/${teacher._id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !teacher.isActive })
      });
      setNotice(`Professor ${teacher.email} ${teacher.isActive ? 'desativado' : 'ativado'}.`);
      await loadData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível alterar o status do professor.');
    } finally {
      setSavingTeacherStatus(null);
    }
  }

  function togglePermission(teacherIdValue: string, permission: Permission, checked: boolean) {
    setPermissionDrafts((current) => {
      const currentPermissions = current[teacherIdValue] ?? [];
      return {
        ...current,
        [teacherIdValue]: checked
          ? [...new Set([...currentPermissions, permission])]
          : currentPermissions.filter((item) => item !== permission)
      };
    });
  }

  const logout = () => {
    sessionStorage.clear();
    navigate('/login');
  };

  const classColumns: GridColDef<SportsClass>[] = [
    { field: 'name', headerName: 'Turma', minWidth: isMobile ? 145 : 170, flex: 1 },
    { field: 'modality', headerName: 'Modalidade', minWidth: 130 },
    {
      field: 'teacher',
      headerName: 'Professor',
      minWidth: 200,
      flex: 1,
      valueGetter: (_value, row) => typeof row.teacherId === 'string' ? 'Professor' : row.teacherId.email
    },
    { field: 'location', headerName: 'Local', minWidth: 120, valueGetter: (_value, row) => row.location || '—' },
    { field: 'studentCount', headerName: 'Alunos', minWidth: 90, valueGetter: (_value, row) => row.studentIds.length },
    {
      field: 'status',
      headerName: 'Status',
      minWidth: isMobile ? 85 : 100,
      renderCell: ({ row }) => <Chip size="small" label={row.isActive ? 'Ativa' : 'Inativa'} color={row.isActive ? 'success' : 'default'} />
    },
    {
      field: 'actions',
      headerName: 'Ações',
      sortable: false,
      filterable: false,
      minWidth: isMobile ? 85 : 110,
      renderCell: ({ row }) => <Button size="small" sx={{ px: 0.5, minWidth: 0 }} onClick={() => openClassEditor(row)}>Editar</Button>
    }
  ];

  return (
    <DashboardLayout name={user.email} onLogout={logout}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="overline" color="primary" fontWeight={800}>GESTÃO</Typography>
          <Typography variant="h4" fontWeight={800}>Turmas e professores</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {isAdmin ? 'Cadastre professores e organize as turmas esportivas.' : 'Crie e consulte as turmas sob sua responsabilidade.'}
          </Typography>
        </Box>

        {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          <Button variant="contained" onClick={() => setClassDialogOpen(true)}>Nova turma</Button>
          {isAdmin && <Button variant="outlined" onClick={() => setTeacherDialogOpen(true)}>Cadastrar professor</Button>}
        </Stack>

        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <DataGrid
            rows={classes}
            columns={classColumns}
            getRowId={(row) => row._id}
            loading={loading}
            localeText={ptBR.components.MuiDataGrid.defaultProps.localeText}
            disableRowSelectionOnClick
            columnVisibilityModel={isMobile ? { modality: false, teacher: false, location: false, studentCount: false } : undefined}
            pageSizeOptions={[10, 25, 50]}
            initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
            autoHeight
            sx={{ minHeight: 320, border: 0, '& .MuiDataGrid-columnHeaders': { bgcolor: 'action.hover' } }}
          />
        </Paper>

        {isAdmin && (
          <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h6" fontWeight={750} sx={{ mb: 2 }}>Professores e permissões</Typography>
            {loading ? <CircularProgress size={24} /> : teachers.length === 0 ? (
              <Typography color="text.secondary">Nenhum professor cadastrado.</Typography>
            ) : teachers.map((teacher) => {
              const draft = permissionDrafts[teacher._id] ?? [];
              const changed = draft.length !== teacher.teacherPermissions.length ||
                draft.some((permission) => !teacher.teacherPermissions.includes(permission));
              return (
                <Accordion key={teacher._id} disableGutters>
                  <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                    <Box>
                      <Typography fontWeight={700}>{teacher.email}</Typography>
                      <Typography variant="body2" color="text.secondary">{teacher.isActive ? 'Ativo' : 'Inativo'} · {teacher.teacherPermissions.length} permissões</Typography>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Grid container spacing={1}>
                      {availablePermissions.map(({ value, label }) => (
                        <Grid item xs={12} sm={6} key={value}>
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={draft.includes(value)}
                                onChange={(event) => togglePermission(teacher._id, value, event.target.checked)}
                              />
                            }
                            label={label}
                          />
                        </Grid>
                      ))}
                    </Grid>
                    <Button
                      variant="contained"
                      sx={{ mt: 2 }}
                      disabled={!changed || savingPermissions === teacher._id}
                      onClick={() => void savePermissions(teacher)}
                    >
                      {savingPermissions === teacher._id ? 'Salvando...' : 'Salvar permissões'}
                    </Button>
                    <Button
                      color={teacher.isActive ? 'warning' : 'success'}
                      sx={{ mt: 2, ml: 1 }}
                      disabled={savingTeacherStatus === teacher._id}
                      onClick={() => void toggleTeacherStatus(teacher)}
                    >
                      {savingTeacherStatus === teacher._id
                        ? 'Atualizando...'
                        : teacher.isActive ? 'Desativar professor' : 'Ativar professor'}
                    </Button>
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </Paper>
        )}

        <Dialog open={classDialogOpen} onClose={() => !savingClass && setClassDialogOpen(false)} fullWidth maxWidth="sm">
          <Box component="form" onSubmit={createClass}>
            <DialogTitle>Nova turma</DialogTitle>
            <DialogContent sx={{ display: 'grid', gap: 2, pt: '12px !important' }}>
              <TextField label="Nome da turma" value={className} onChange={(event) => setClassName(event.target.value)} inputProps={{ maxLength: 120 }} required />
              <TextField label="Modalidade" value={modality} onChange={(event) => setModality(event.target.value)} inputProps={{ maxLength: 80 }} required />
              <TextField label="Local (opcional)" value={location} onChange={(event) => setLocation(event.target.value)} inputProps={{ maxLength: 200 }} />
              {isAdmin && (
                <TextField
                  label="Professor responsável"
                  select
                  value={teacherId}
                  onChange={(event) => setTeacherId(event.target.value)}
                  required
                  disabled={!teachers.length}
                >
                  {teachers.filter((teacher) => teacher.isActive).map((teacher) => (
                    <MenuItem key={teacher._id} value={teacher._id}>{teacher.email}</MenuItem>
                  ))}
                </TextField>
              )}
              {isAdmin && teachers.length === 0 && <Alert severity="info">Cadastre um professor ativo antes de criar a turma.</Alert>}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={() => setClassDialogOpen(false)} disabled={savingClass}>Cancelar</Button>
              <Button type="submit" variant="contained" disabled={savingClass || loading || (isAdmin && !teacherId)}>
                {savingClass ? 'Criando...' : 'Criar turma'}
              </Button>
            </DialogActions>
          </Box>
        </Dialog>

        <Dialog open={teacherDialogOpen} onClose={() => !savingTeacher && setTeacherDialogOpen(false)} fullWidth maxWidth="sm">
          <Box component="form" onSubmit={createTeacher}>
            <DialogTitle>Cadastrar professor</DialogTitle>
            <DialogContent sx={{ display: 'grid', gap: 2, pt: '12px !important' }}>
              <TextField label="E-mail do professor" type="email" autoComplete="email" value={teacherEmail} onChange={(event) => setTeacherEmail(event.target.value)} required />
              <TextField label="Senha inicial" type="password" autoComplete="new-password" value={teacherPassword} onChange={(event) => setTeacherPassword(event.target.value)} inputProps={{ minLength: 12, maxLength: 128 }} helperText="Mínimo de 12 caracteres." required />
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={() => setTeacherDialogOpen(false)} disabled={savingTeacher}>Cancelar</Button>
              <Button type="submit" variant="contained" disabled={savingTeacher}>{savingTeacher ? 'Cadastrando...' : 'Cadastrar professor'}</Button>
            </DialogActions>
          </Box>
        </Dialog>

        <Dialog open={Boolean(editingClass)} onClose={() => !savingEdit && setEditingClass(null)} fullWidth maxWidth="sm">
          <Box component="form" onSubmit={saveClass}>
            <DialogTitle>Editar turma</DialogTitle>
            <DialogContent sx={{ display: 'grid', gap: 2, pt: '12px !important' }}>
              <TextField
                label="Nome da turma"
                value={classDraft.name}
                onChange={(event) => setClassDraft({ ...classDraft, name: event.target.value })}
                inputProps={{ maxLength: 120 }}
                required
              />
              <TextField
                label="Modalidade"
                value={classDraft.modality}
                onChange={(event) => setClassDraft({ ...classDraft, modality: event.target.value })}
                inputProps={{ maxLength: 80 }}
                helperText={editingClass?.studentIds.length ? 'Não pode ser alterada enquanto houver alunos vinculados.' : undefined}
                disabled={Boolean(editingClass?.studentIds.length)}
                required
              />
              <TextField
                label="Local"
                value={classDraft.location}
                onChange={(event) => setClassDraft({ ...classDraft, location: event.target.value })}
                inputProps={{ maxLength: 200 }}
              />
              {isAdmin && (
                <TextField
                  label="Professor responsável"
                  select
                  value={classDraft.teacherId}
                  onChange={(event) => setClassDraft({ ...classDraft, teacherId: event.target.value })}
                  required
                >
                  {teachers.filter((teacher) => teacher.isActive).map((teacher) => (
                    <MenuItem key={teacher._id} value={teacher._id}>{teacher.email}</MenuItem>
                  ))}
                </TextField>
              )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={() => setEditingClass(null)} disabled={savingEdit}>Cancelar</Button>
              <Button type="submit" variant="contained" disabled={savingEdit}>
                {savingEdit ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            </DialogActions>
          </Box>
        </Dialog>
      </Stack>
    </DashboardLayout>
  );
}
