import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Checkbox, CircularProgress, FormControl, FormControlLabel, FormGroup,
  Grid, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography
} from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { DashboardLayout } from '../components/templates/DashboardLayout';
import { apiDownload, apiRequest } from '../lib/api';

interface ExportColumn {
  key: string;
  label: string;
}

interface ExportTable {
  id: string;
  label: string;
  columns: ExportColumn[];
}

interface SportsClass {
  _id: string;
  name: string;
  modality: string;
}

interface ExportOptions {
  tables: ExportTable[];
  studentColumns: ExportColumn[];
}

type ExportFilters = {
  format: 'csv' | 'xlsx' | 'pdf';
  classId: string;
  from: string;
  to: string;
  name: string;
  status: string;
  modality: string;
};

const initialFilters: ExportFilters = {
  format: 'csv',
  classId: '',
  from: '',
  to: '',
  name: '',
  status: '',
  modality: ''
};

const tableLabels: Record<string, string> = {
  students: 'Alunos',
  classes: 'Turmas',
  attendance: 'Chamadas',
  assignments: 'Tarefas',
  submissions: 'Entregas de tarefas',
  evaluations: 'Avaliações',
  events: 'Eventos',
  lessonPlans: 'Planos de aula',
  materials: 'Materiais'
};

export function ExportsPage() {
  const navigate = useNavigate();
  const user = JSON.parse(sessionStorage.getItem('user') ?? '{"email":"Usuário"}') as { email: string };
  const [options, setOptions] = useState<ExportOptions | null>(null);
  const [classes, setClasses] = useState<SportsClass[]>([]);
  const [selectedTable, setSelectedTable] = useState('students');
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<ExportFilters>(initialFilters);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const currentColumns = useMemo(() => {
    if (selectedTable === 'students') return options?.studentColumns ?? [];
    return options?.tables.find((table) => table.id === selectedTable)?.columns ?? [];
  }, [options, selectedTable]);
  const allSelected = currentColumns.length > 0 && selectedColumns.length === currentColumns.length;

  useEffect(() => {
    Promise.all([
      apiRequest<Omit<ExportOptions, 'tables'> & { tables: ExportTable[] }>('/exports/options'),
      apiRequest<{ classes: SportsClass[] }>('/classes')
    ]).then(([exportOptions, classResult]) => {
      setOptions(exportOptions);
      setClasses(classResult.classes);
      setSelectedColumns(exportOptions.studentColumns.map((column) => column.key));
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as opções de exportação.');
    }).finally(() => setLoading(false));
  }, []);

  function changeTable(table: string) {
    setSelectedTable(table);
    setSelectedColumns(table === 'students'
      ? options?.studentColumns.map((column) => column.key) ?? []
      : options?.tables.find((item) => item.id === table)?.columns.map((column) => column.key) ?? []);
    setFilters((current) => ({ ...current, classId: '', name: '', status: '', modality: '' }));
  }

  function toggleColumn(key: string) {
    setSelectedColumns((current) => current.includes(key)
      ? current.filter((column) => column !== key)
      : [...current, key]);
  }

  async function exportTable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedColumns.length) {
      setError('Selecione pelo menos uma coluna para exportar.');
      return;
    }
    setExporting(true);
    setError('');
    setNotice('');
    try {
      const query = new URLSearchParams({
        format: filters.format,
        columns: selectedColumns.join(',')
      });
      if (filters.from) query.set('from', new Date(`${filters.from}T00:00:00.000Z`).toISOString());
      if (filters.to) query.set('to', new Date(`${filters.to}T23:59:59.999Z`).toISOString());
      if (selectedTable === 'students') {
        if (filters.name.trim()) query.set('name', filters.name.trim());
        if (filters.status) query.set('status', filters.status);
        if (filters.modality.trim()) query.set('modality', filters.modality.trim());
      } else if (filters.classId) {
        query.set('classId', filters.classId);
      }
      const endpoint = selectedTable === 'students' ? '/exports/students' : `/exports/${selectedTable}`;
      const { blob, filename } = await apiDownload(`${endpoint}?${query.toString()}`);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename ?? `${selectedTable}-${new Date().toISOString().slice(0, 10)}.${filters.format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setNotice(`Exportação de ${tableLabels[selectedTable] ?? selectedTable} concluída.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível gerar a exportação.');
    } finally {
      setExporting(false);
    }
  }

  const logout = () => {
    sessionStorage.clear();
    navigate('/login');
  };

  return (
    <DashboardLayout name={user.email} onLogout={logout}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="overline" color="primary" fontWeight={800}>RELATÓRIOS</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Escolha uma tabela, aplique filtros e selecione as colunas para gerar CSV, Excel ou PDF.
          </Typography>
        </Box>

        {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : options ? (
          <Paper component="form" variant="outlined" onSubmit={exportTable} sx={{ p: { xs: 2, md: 3 } }}>
            <Stack spacing={2}>
              <Grid container spacing={1.5}>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="export-table-label">Tabela</InputLabel>
                    <Select
                      labelId="export-table-label"
                      label="Tabela"
                      value={selectedTable}
                      onChange={(event) => changeTable(event.target.value)}
                    >
                      <MenuItem value="students">{tableLabels.students}</MenuItem>
                      {options.tables.map((table) => (
                        <MenuItem key={table.id} value={table.id}>{table.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="export-format-label">Formato</InputLabel>
                    <Select
                      labelId="export-format-label"
                      label="Formato"
                      value={filters.format}
                      onChange={(event) => setFilters({ ...filters, format: event.target.value as ExportFilters['format'] })}
                    >
                      <MenuItem value="csv">CSV</MenuItem>
                      <MenuItem value="xlsx">Excel (.xlsx)</MenuItem>
                      <MenuItem value="pdf">PDF</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
              <Accordion disableGutters>
                <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                  <Typography fontWeight={700}>
                    Filtros adicionais
                    {(filters.classId || filters.name || filters.status || filters.modality || filters.from || filters.to) ? ' · aplicados' : ''}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={1.5}>
                {selectedTable !== 'students' && (
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="export-class-label">Turma</InputLabel>
                      <Select
                        labelId="export-class-label"
                        label="Turma"
                        value={filters.classId}
                        onChange={(event) => setFilters({ ...filters, classId: event.target.value })}
                      >
                        <MenuItem value="">Todas as turmas permitidas</MenuItem>
                        {classes.map((sportsClass) => (
                          <MenuItem key={sportsClass._id} value={sportsClass._id}>{sportsClass.name} · {sportsClass.modality}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                )}
                {selectedTable === 'students' && (
                  <>
                    <Grid item xs={12} sm={4}>
                      <TextField fullWidth size="small" label="Nome" value={filters.name} onChange={(event) => setFilters({ ...filters, name: event.target.value })} />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <FormControl fullWidth size="small">
                        <InputLabel id="export-status-label">Situação da inscrição</InputLabel>
                        <Select
                          labelId="export-status-label"
                          label="Situação da inscrição"
                          value={filters.status}
                          onChange={(event) => setFilters({ ...filters, status: event.target.value })}
                        >
                          <MenuItem value="">Todas</MenuItem>
                          <MenuItem value="pending">Pendente</MenuItem>
                          <MenuItem value="approved">Aprovada</MenuItem>
                          <MenuItem value="rejected">Recusada</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField fullWidth size="small" label="Modalidade" value={filters.modality} onChange={(event) => setFilters({ ...filters, modality: event.target.value })} />
                    </Grid>
                  </>
                )}
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label={selectedTable === 'students' ? 'Inscrito a partir de' : 'Data inicial'}
                    type="date"
                    value={filters.from}
                    onChange={(event) => setFilters({ ...filters, from: event.target.value })}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ max: filters.to || undefined }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label={selectedTable === 'students' ? 'Inscrito até' : 'Data final'}
                    type="date"
                    value={filters.to}
                    onChange={(event) => setFilters({ ...filters, to: event.target.value })}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ min: filters.from || undefined }}
                  />
                </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>

              <Accordion disableGutters>
                <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                  <Box>
                    <Typography fontWeight={700}>Colunas para exportar</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {selectedColumns.length} de {currentColumns.length} selecionadas
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Button type="button" onClick={() => setSelectedColumns(allSelected ? [] : currentColumns.map((column) => column.key))}>
                    {allSelected ? 'Desmarcar todas' : 'Selecionar todas'}
                  </Button>
                </Stack>
                <FormGroup row sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' } }}>
                  {currentColumns.map((column) => (
                    <FormControlLabel
                      key={column.key}
                      control={<Checkbox checked={selectedColumns.includes(column.key)} onChange={() => toggleColumn(column.key)} />}
                      label={column.label}
                    />
                  ))}
                </FormGroup>
                </AccordionDetails>
              </Accordion>
              <Box>
                <Button type="submit" variant="contained" disabled={exporting || !selectedColumns.length} startIcon={exporting ? <CircularProgress size={18} /> : undefined}>
                  {exporting ? 'Gerando...' : `Exportar ${tableLabels[selectedTable] ?? selectedTable}`}
                </Button>
              </Box>
            </Stack>
          </Paper>
        ) : null}
      </Stack>
    </DashboardLayout>
  );
}
