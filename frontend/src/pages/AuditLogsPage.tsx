import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Badge, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl,
  IconButton, InputLabel, MenuItem, Paper, Select, Stack, TextField, Tooltip, Typography, useMediaQuery
} from '@mui/material';
import FilterListRoundedIcon from '@mui/icons-material/FilterListRounded';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { ptBR } from '@mui/x-data-grid/locales';
import { DashboardLayout } from '../components/templates/DashboardLayout';
import { apiRequest } from '../lib/api';

type AuditAction =
  | 'student.enrollment.approved'
  | 'student.enrollment.rejected'
  | 'student.update'
  | 'student.archive'
  | 'student.restore'
  | 'teacher.permissions.update'
  | 'teacher.create'
  | 'teacher.update'
  | 'teacher.archive'
  | 'teacher.restore'
  | 'teacher.activate'
  | 'teacher.deactivate'
  | 'class.create'
  | 'class.update'
  | 'enrollment.limit.update';

interface AuditLogRecord {
  _id: string;
  actorId?: { email: string } | string;
  action: AuditAction;
  resource: 'Student' | 'User' | 'SportsClass' | 'SystemSetting';
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  createdAt: string;
}

interface AuditFilters {
  action: string;
  resource: string;
  from: string;
  to: string;
}

const emptyFilters: AuditFilters = { action: '', resource: '', from: '', to: '' };
const actionLabels: Record<AuditAction, string> = {
  'student.enrollment.approved': 'Inscrição aprovada',
  'student.enrollment.rejected': 'Inscrição recusada',
  'student.update': 'Cadastro de aluno alterado',
  'student.archive': 'Aluno arquivado',
  'student.restore': 'Aluno restaurado',
  'teacher.permissions.update': 'Permissões de professor alteradas',
  'teacher.create': 'Professor cadastrado',
  'teacher.update': 'Cadastro de professor alterado',
  'teacher.archive': 'Professor arquivado',
  'teacher.restore': 'Professor restaurado',
  'teacher.activate': 'Professor ativado',
  'teacher.deactivate': 'Professor desativado',
  'class.create': 'Turma cadastrada',
  'class.update': 'Turma alterada',
  'enrollment.limit.update': 'Limite de inscrições alterado'
};

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR');
}

function actorEmail(actor: AuditLogRecord['actorId']) {
  return typeof actor === 'string' || !actor ? 'Usuário removido' : actor.email;
}

export function AuditLogsPage() {
  const navigate = useNavigate();
  const user = JSON.parse(sessionStorage.getItem('user') ?? '{"email":"Administrador"}') as { email: string };
  const [filters, setFilters] = useState<AuditFilters>(emptyFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailsLog, setDetailsLog] = useState<AuditLogRecord | null>(null);
  const isMobile = useMediaQuery('(max-width:599px)');

  async function loadLogs(activeFilters = filters) {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams();
      if (activeFilters.action) query.set('action', activeFilters.action);
      if (activeFilters.resource) query.set('resource', activeFilters.resource);
      if (activeFilters.from) query.set('from', new Date(`${activeFilters.from}T00:00:00.000Z`).toISOString());
      if (activeFilters.to) query.set('to', new Date(`${activeFilters.to}T23:59:59.999Z`).toISOString());
      const suffix = query.size ? `?${query.toString()}` : '';
      const result = await apiRequest<{ logs: AuditLogRecord[] }>(`/audit-logs${suffix}`);
      setLogs(result.logs);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os logs de auditoria.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLogs(emptyFilters);
  }, []);

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFiltersOpen(false);
    void loadLogs(filters);
  }

  function clearFilters() {
    setFilters(emptyFilters);
    setFiltersOpen(false);
    void loadLogs(emptyFilters);
  }

  const activeFilterCount = [filters.action, filters.resource, filters.from, filters.to].filter(Boolean).length;
  const columns: GridColDef<AuditLogRecord>[] = [
    { field: 'createdAt', headerName: 'Data e hora', minWidth: isMobile ? 120 : 165, valueFormatter: (value) => formatDate(String(value)) },
    { field: 'actor', headerName: 'Responsável', minWidth: 190, flex: 1, valueGetter: (_value, row) => actorEmail(row.actorId) },
    { field: 'action', headerName: 'Ação', minWidth: isMobile ? 140 : 230, flex: 1, valueGetter: (_value, row) => actionLabels[row.action] ?? row.action },
    {
      field: 'resource',
      headerName: 'Recurso',
      minWidth: 135,
      valueGetter: (_value, row) => ({
        Student: 'Aluno',
        User: 'Usuário',
        SportsClass: 'Turma',
        SystemSetting: 'Configuração'
      }[row.resource] ?? row.resource)
    },
    { field: 'ip', headerName: 'IP', minWidth: 130, valueGetter: (_value, row) => row.ip ?? '—' },
    {
      field: 'details',
      headerName: 'Detalhes',
      sortable: false,
      filterable: false,
      minWidth: isMobile ? 90 : 110,
      maxWidth: isMobile ? 90 : undefined,
      renderCell: ({ row }) => <Button size="small" onClick={() => setDetailsLog(row)}>Ver detalhes</Button>
    }
  ];

  return (
    <DashboardLayout name={user.email} onLogout={() => { sessionStorage.clear(); navigate('/login'); }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="overline" color="primary" fontWeight={800}>ADMINISTRAÇÃO</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>Ações administrativas recentes, até 200 registros por consulta.</Typography>
        </Box>

        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography fontWeight={700} sx={{ flex: 1 }}>
              {loading ? 'Carregando registros...' : `${logs.length} registros`}
            </Typography>
            <Tooltip title="Filtros">
              <IconButton aria-label="Abrir filtros" onClick={() => setFiltersOpen(true)}>
                <Badge badgeContent={activeFilterCount} color="primary"><FilterListRoundedIcon /></Badge>
              </IconButton>
            </Tooltip>
            <Button onClick={() => void loadLogs()} disabled={loading}>Atualizar</Button>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <DataGrid
            rows={logs}
            columns={columns}
            getRowId={(row) => row._id}
            loading={loading}
            localeText={ptBR.components.MuiDataGrid.defaultProps.localeText}
            disableRowSelectionOnClick
            columnVisibilityModel={isMobile ? { actor: false, resource: false, ip: false } : undefined}
            pageSizeOptions={[10, 25, 50]}
            initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
            autoHeight
            sx={{ minHeight: 360, border: 0, '& .MuiDataGrid-columnHeaders': { bgcolor: 'action.hover' } }}
          />
        </Paper>

        <Dialog open={filtersOpen} onClose={() => setFiltersOpen(false)} fullWidth maxWidth="xs">
          <Box component="form" onSubmit={applyFilters}>
            <DialogTitle>Filtrar registros</DialogTitle>
            <DialogContent sx={{ display: 'grid', gap: 2, pt: '12px !important' }}>
            <FormControl size="small">
              <InputLabel id="audit-action-label">Ação</InputLabel>
              <Select
                labelId="audit-action-label"
                label="Ação"
                value={filters.action}
                onChange={(event) => setFilters({ ...filters, action: event.target.value })}
              >
                <MenuItem value="">Todas</MenuItem>
                {Object.entries(actionLabels).map(([action, label]) => (
                  <MenuItem key={action} value={action}>{label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small">
              <InputLabel id="audit-resource-label">Recurso</InputLabel>
              <Select
                labelId="audit-resource-label"
                label="Recurso"
                value={filters.resource}
                onChange={(event) => setFilters({ ...filters, resource: event.target.value })}
              >
                <MenuItem value="">Todos</MenuItem>
                <MenuItem value="Student">Aluno</MenuItem>
                <MenuItem value="User">Usuário</MenuItem>
                <MenuItem value="SportsClass">Turma</MenuItem>
                <MenuItem value="SystemSetting">Configuração</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="De"
              type="date"
              size="small"
              value={filters.from}
              onChange={(event) => setFilters({ ...filters, from: event.target.value })}
              InputLabelProps={{ shrink: true }}
              inputProps={{ max: filters.to || undefined }}
            />
            <TextField
              label="Até"
              type="date"
              size="small"
              value={filters.to}
              onChange={(event) => setFilters({ ...filters, to: event.target.value })}
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: filters.from || undefined }}
            />
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={clearFilters} disabled={loading}>Limpar filtros</Button>
              <Button onClick={() => setFiltersOpen(false)}>Cancelar</Button>
              <Button type="submit" variant="contained" disabled={loading}>Aplicar</Button>
            </DialogActions>
          </Box>
        </Dialog>

        <Dialog open={Boolean(detailsLog)} onClose={() => setDetailsLog(null)} fullWidth maxWidth="sm">
          <DialogTitle>Detalhes do registro</DialogTitle>
          <DialogContent dividers>
            {detailsLog && (
              <Stack spacing={1.5}>
                <Typography><strong>Data:</strong> {formatDate(detailsLog.createdAt)}</Typography>
                <Typography><strong>Responsável:</strong> {actorEmail(detailsLog.actorId)}</Typography>
                <Typography><strong>Ação:</strong> {actionLabels[detailsLog.action] ?? detailsLog.action}</Typography>
                <Typography><strong>Recurso:</strong> {detailsLog.resource}</Typography>
                {detailsLog.resourceId && <Typography sx={{ overflowWrap: 'anywhere' }}><strong>ID:</strong> {detailsLog.resourceId}</Typography>}
                <Typography><strong>Endereço IP:</strong> {detailsLog.ip ?? '—'}</Typography>
                <Typography component="pre" sx={{ m: 0, p: 1.5, borderRadius: 1, bgcolor: 'action.hover', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {detailsLog.metadata ? JSON.stringify(detailsLog.metadata, null, 2) : 'Sem detalhes adicionais.'}
                </Typography>
              </Stack>
            )}
          </DialogContent>
          <DialogActions><Button onClick={() => setDetailsLog(null)}>Fechar</Button></DialogActions>
        </Dialog>
      </Stack>
    </DashboardLayout>
  );
}
