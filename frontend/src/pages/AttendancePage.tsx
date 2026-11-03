import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, Grid, IconButton, InputLabel, MenuItem, Paper, Select, Stack, TextField, Tooltip, Typography,
  useMediaQuery
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { ptBR } from '@mui/x-data-grid/locales';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import { DashboardLayout } from '../components/templates/DashboardLayout';
import { apiRequest } from '../lib/api';

type AttendanceStatus = '' | 'present' | 'absent' | 'excused';
type SavedAttendanceStatus = Exclude<AttendanceStatus, ''>;

interface SportsClass {
  _id: string;
  name: string;
  modality: string;
}

interface RosterEntry {
  studentId: string;
  fullName: string;
  age: number;
  attendance: { status: SavedAttendanceStatus; note: string } | null;
}

interface AttendanceEntry {
  studentId: string;
  fullName: string;
  age: number;
  status: AttendanceStatus;
  note: string;
}

function todayLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const statusLabels: Record<SavedAttendanceStatus, string> = {
  present: 'Presente',
  absent: 'Ausente',
  excused: 'Justificada'
};

export function AttendancePage() {
  const navigate = useNavigate();
  const user = JSON.parse(sessionStorage.getItem('user') ?? '{"email":"Usuário"}') as { email: string };
  const [classes, setClasses] = useState<SportsClass[]>([]);
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(todayLocal);
  const [roster, setRoster] = useState<AttendanceEntry[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [noteStudentId, setNoteStudentId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const isMobile = useMediaQuery('(max-width:599px)');

  useEffect(() => {
    let active = true;
    apiRequest<{ classes: SportsClass[] }>('/classes')
      .then(({ classes: result }) => {
        if (!active) return;
        setClasses(result);
        if (result.length) setClassId(result[0]._id);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as turmas.');
      })
      .finally(() => {
        if (active) setClassesLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!classId || !date) {
      setRoster([]);
      return;
    }
    let active = true;
    setAttendanceLoading(true);
    setError('');
    const query = new URLSearchParams({ classId, date });
    apiRequest<{ students: RosterEntry[] }>(`/attendance?${query.toString()}`)
      .then(({ students }) => {
        if (!active) return;
        setRoster(students.map((student) => ({
          studentId: student.studentId,
          fullName: student.fullName,
          age: student.age,
          status: student.attendance?.status ?? '',
          note: student.attendance?.note ?? ''
        })));
      })
      .catch((reason: unknown) => {
        if (active) {
          setRoster([]);
          setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a chamada.');
        }
      })
      .finally(() => {
        if (active) setAttendanceLoading(false);
      });
    return () => { active = false; };
  }, [classId, date]);

  function updateEntry(studentId: string, values: Partial<Pick<AttendanceEntry, 'status' | 'note'>>) {
    setRoster((current) => current.map((entry) => entry.studentId === studentId ? { ...entry, ...values } : entry));
  }

  async function saveAttendance() {
    if (!classId || !roster.length || roster.some((entry) => !entry.status)) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await apiRequest<{ saved: number }>('/attendance', {
        method: 'POST',
        body: JSON.stringify({
          classId,
          date: `${date}T00:00:00.000Z`,
          records: roster.map((entry) => ({
            studentId: entry.studentId,
            status: entry.status,
            ...(entry.note.trim() ? { note: entry.note.trim() } : {})
          }))
        })
      });
      setNotice(`Chamada salva: ${result.saved} ${result.saved === 1 ? 'aluno atualizado' : 'alunos atualizados'}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a chamada.');
    } finally {
      setSaving(false);
    }
  }

  const presentCount = roster.filter((entry) => entry.status === 'present').length;
  const absentCount = roster.filter((entry) => entry.status === 'absent').length;
  const excusedCount = roster.filter((entry) => entry.status === 'excused').length;
  const unmarkedCount = roster.filter((entry) => !entry.status).length;
  const columns: GridColDef<AttendanceEntry>[] = [
    {
      field: 'fullName',
      headerName: 'Aluno',
      minWidth: isMobile ? 135 : 200,
      flex: 1.1,
      renderCell: ({ row }) => (
        <Box>
          <Typography variant="body2" fontWeight={700}>{row.fullName}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>{row.age} anos</Typography>
        </Box>
      )
    },
    {
      field: 'status',
      headerName: 'Situação',
      minWidth: isMobile ? 145 : 180,
      flex: 0.8,
      sortable: false,
      renderCell: ({ row }) => (
        <FormControl fullWidth size="small" required>
          <Select
            value={row.status}
            displayEmpty
            inputProps={{ 'aria-label': `Situação de ${row.fullName}` }}
            onChange={(event) => updateEntry(row.studentId, { status: event.target.value as AttendanceStatus })}
          >
            <MenuItem value=""><em>Selecione</em></MenuItem>
            {Object.entries(statusLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </Select>
        </FormControl>
      )
    },
    {
      field: 'note',
      headerName: 'Observação (opcional)',
      minWidth: 260,
      flex: 1.2,
      sortable: false,
      renderCell: ({ row }) => (
        <TextField
          size="small"
          aria-label={`Observação para ${row.fullName}`}
          value={row.note}
          onChange={(event) => updateEntry(row.studentId, { note: event.target.value })}
          inputProps={{ maxLength: 500 }}
        />
      )
    },
    {
      field: 'noteAction',
      headerName: 'Observação',
      minWidth: 56,
      maxWidth: 56,
      sortable: false,
      filterable: false,
      renderCell: ({ row }) => (
        <Tooltip title={row.note ? 'Editar observação' : 'Adicionar observação'}>
          <IconButton
            aria-label={`${row.note ? 'Editar' : 'Adicionar'} observação de ${row.fullName}`}
            onClick={() => {
              setNoteDraft(row.note);
              setNoteStudentId(row.studentId);
            }}
          >
            <EditNoteRoundedIcon />
          </IconButton>
        </Tooltip>
      )
    }
  ];
  const logout = () => {
    sessionStorage.clear();
    navigate('/login');
  };

  return (
    <DashboardLayout name={user.email} onLogout={logout}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="overline" color="primary" fontWeight={800}>GESTÃO DA TURMA</Typography>
          <Typography variant="h4" fontWeight={800}>Chamada e presenças</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>Escolha a turma e a data; marque a situação de cada aluno e salve.</Typography>
        </Box>

        {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Grid container spacing={1.5} alignItems="center">
            <Grid item xs={12} sm={8} md={9}>
              <FormControl fullWidth size="small" disabled={classesLoading || classes.length === 0}>
                <InputLabel id="attendance-class-label">Turma</InputLabel>
                <Select
                  labelId="attendance-class-label"
                  label="Turma"
                  value={classId}
                  onChange={(event) => setClassId(event.target.value)}
                >
                  {classes.map((sportsClass) => (
                    <MenuItem key={sportsClass._id} value={sportsClass._id}>{sportsClass.name} · {sportsClass.modality}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4} md={3}>
              <TextField
                label="Data da chamada"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{ max: todayLocal() }}
              />
            </Grid>
          </Grid>
        </Paper>

        {classesLoading || attendanceLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}><CircularProgress /></Box>
        ) : classes.length === 0 ? (
          <Alert severity="info">Nenhuma turma disponível. Cadastre uma turma antes de registrar a chamada.</Alert>
        ) : roster.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">Esta turma não tem alunos aprovados vinculados para a chamada.</Typography>
          </Paper>
        ) : (
          <>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Chip color="success" label={`Presentes: ${presentCount}`} />
              <Chip color="error" label={`Ausentes: ${absentCount}`} />
              <Chip color="warning" label={`Justificadas: ${excusedCount}`} />
              {unmarkedCount > 0 && <Chip label={`Sem marcar: ${unmarkedCount}`} />}
            </Stack>

            <Paper variant="outlined" sx={{ overflow: 'hidden', width: '100%' }}>
              <DataGrid
                rows={roster}
                columns={columns}
                getRowId={(row) => row.studentId}
                localeText={ptBR.components.MuiDataGrid.defaultProps.localeText}
                disableRowSelectionOnClick
                hideFooterSelectedRowCount
                columnVisibilityModel={isMobile ? { note: false, noteAction: true } : { note: true, noteAction: false }}
                pageSizeOptions={[10, 25, 50]}
                initialState={{ pagination: { paginationModel: { pageSize: 25, page: 0 } } }}
                autoHeight
                sx={{
                  minHeight: 360,
                  border: 0,
                  '& .MuiDataGrid-columnHeaders': { bgcolor: 'action.hover' },
                  '& .MuiDataGrid-cell': { py: 1 }
                }}
              />
            </Paper>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="contained" size="large" disabled={saving || unmarkedCount > 0} onClick={() => void saveAttendance()}>
                {saving ? 'Salvando chamada...' : unmarkedCount ? `Marque os ${unmarkedCount} alunos restantes` : 'Salvar chamada'}
              </Button>
            </Box>
          </>
        )}
      </Stack>
      <Dialog open={Boolean(noteStudentId)} onClose={() => setNoteStudentId(null)} fullWidth maxWidth="xs">
        <DialogTitle>Observação da chamada</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <TextField
            autoFocus
            label={roster.find((entry) => entry.studentId === noteStudentId)?.fullName ?? 'Aluno'}
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            multiline
            minRows={3}
            inputProps={{ maxLength: 500 }}
            helperText="A observação será salva junto com a chamada."
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setNoteStudentId(null)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (noteStudentId) updateEntry(noteStudentId, { note: noteDraft });
              setNoteStudentId(null);
            }}
          >
            Aplicar
          </Button>
        </DialogActions>
      </Dialog>
    </DashboardLayout>
  );
}
