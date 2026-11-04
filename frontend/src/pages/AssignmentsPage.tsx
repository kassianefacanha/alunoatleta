import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem,
  Paper, Select, Stack, TextField, Typography
} from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { DashboardLayout } from '../components/templates/DashboardLayout';
import { apiRequest } from '../lib/api';
import { hasPermission } from '../lib/permissions';

interface SportsClass {
  _id: string;
  name: string;
  modality: string;
}

interface Submission {
  _id: string;
  response: string;
  submittedAt: string;
  studentId: { _id: string; fullName: string } | string;
}

interface AssignmentRecord {
  _id: string;
  classId: string;
  title: string;
  description: string;
  responseType: 'text' | 'none';
  dueAt?: string;
  createdAt: string;
  mySubmission?: Submission | null;
}

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString('pt-BR') : 'Sem prazo definido';
}

export function AssignmentsPage() {
  const navigate = useNavigate();
  const user = JSON.parse(sessionStorage.getItem('user') ?? '{"email":"Usuário","role":"student"}') as { email: string; role: string };
  const canCreate = user.role === 'admin' || (user.role === 'teacher' && hasPermission('assignments:write'));
  const canViewSubmissions = user.role === 'admin' || user.role === 'teacher';
  const isStudent = user.role === 'student';
  const [classes, setClasses] = useState<SportsClass[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [assignmentClassId, setAssignmentClassId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [responseType, setResponseType] = useState<'text' | 'none'>('text');
  const [dueAt, setDueAt] = useState('');
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentRecord | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [classResult, assignmentResult] = await Promise.all([
        apiRequest<{ classes: SportsClass[] }>('/classes'),
        apiRequest<{ assignments: AssignmentRecord[] }>('/assignments')
      ]);
      setClasses(classResult.classes);
      setAssignments(assignmentResult.assignments);
      if (classResult.classes.length) {
        setSelectedClassId((current) => current || classResult.classes[0]._id);
        setAssignmentClassId((current) => current || classResult.classes[0]._id);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as tarefas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function createAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assignmentClassId) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await apiRequest('/assignments', {
        method: 'POST',
        body: JSON.stringify({
          classId: assignmentClassId,
          title: title.trim(),
          description: description.trim(),
          responseType,
          ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {})
        })
      });
      setTitle('');
      setDescription('');
      setDueAt('');
      setResponseType('text');
      setCreateDialogOpen(false);
      setNotice('Tarefa publicada com sucesso.');
      await loadData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível publicar a tarefa.');
    } finally {
      setSaving(false);
    }
  }

  async function submitResponse(assignment: AssignmentRecord) {
    const response = responses[assignment._id]?.trim();
    if (!response) {
      setError('Escreva sua resposta antes de enviar.');
      return;
    }
    setSubmittingId(assignment._id);
    setError('');
    setNotice('');
    try {
      await apiRequest(`/assignments/${assignment._id}/submissions`, {
        method: 'POST',
        body: JSON.stringify({ response })
      });
      setNotice('Sua resposta foi enviada.');
      await loadData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível enviar sua resposta.');
    } finally {
      setSubmittingId(null);
    }
  }

  async function viewSubmissions(assignment: AssignmentRecord) {
    setSelectedAssignment(assignment);
    setSubmissions([]);
    setSubmissionsLoading(true);
    setError('');
    try {
      const result = await apiRequest<{ submissions: Submission[] }>(`/assignments/${assignment._id}/submissions`);
      setSubmissions(result.submissions);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as entregas.');
      setSelectedAssignment(null);
    } finally {
      setSubmissionsLoading(false);
    }
  }

  const visibleAssignments = assignments.filter((assignment) => !selectedClassId || assignment.classId === selectedClassId);
  const className = (id: string) => classes.find((sportsClass) => sportsClass._id === id)?.name ?? 'Turma';
  const logout = () => {
    sessionStorage.clear();
    navigate('/login');
  };

  return (
    <DashboardLayout name={user.email} onLogout={logout}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="overline" color="primary" fontWeight={800}>ATIVIDADES</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {isStudent
              ? 'Consulte as atividades da sua turma e acompanhe suas respostas.'
              : canCreate
                ? 'Publique atividades e consulte as respostas enviadas pelos alunos.'
                : 'Consulte as atividades das suas turmas e acompanhe as entregas.'}
          </Typography>
        </Box>

        {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

        {canCreate && (
          <Stack direction="row" spacing={1} alignItems="center">
            {classes.length === 0 && !loading && <Alert severity="info" sx={{ flex: 1 }}>Cadastre uma turma antes de publicar tarefas.</Alert>}
            <Button variant="contained" onClick={() => setCreateDialogOpen(true)} disabled={loading || classes.length === 0}>
              Criar tarefa
            </Button>
          </Stack>
        )}

        <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ sm: 'center' }} sx={{ mb: 1.5 }}>
            <Typography variant="h6" fontWeight={750}>Atividades publicadas</Typography>
            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 220 } }} disabled={loading || classes.length === 0}>
              <InputLabel id="assignment-filter-class-label">Filtrar por turma</InputLabel>
              <Select
                labelId="assignment-filter-class-label"
                label="Filtrar por turma"
                value={selectedClassId}
                onChange={(event) => setSelectedClassId(event.target.value)}
              >
                <MenuItem value="">Todas as turmas</MenuItem>
                {classes.map((sportsClass) => (
                  <MenuItem key={sportsClass._id} value={sportsClass._id}>{sportsClass.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box> : visibleAssignments.length === 0 ? (
            <Typography color="text.secondary">Nenhuma tarefa encontrada.</Typography>
          ) : (
            <Stack spacing={1}>
              {visibleAssignments.map((assignment) => {
                const submitted = Boolean(assignment.mySubmission);
                return (
                  <Accordion key={assignment._id} disableGutters>
                    <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, width: '100%', pr: 1, flexWrap: 'wrap' }}>
                        <Box>
                          <Typography fontWeight={750}>{assignment.title}</Typography>
                          <Typography variant="body2" color="text.secondary">{className(assignment.classId)} · Prazo: {formatDate(assignment.dueAt)}</Typography>
                        </Box>
                        {isStudent && assignment.responseType === 'text' && (
                          <Chip size="small" color={submitted ? 'success' : 'warning'} label={submitted ? 'Respondida' : 'Pendente'} />
                        )}
                        {assignment.responseType === 'none' && <Chip size="small" label="Sem entrega online" />}
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Stack spacing={2}>
                        <Typography sx={{ whiteSpace: 'pre-wrap' }}>{assignment.description}</Typography>
                        {isStudent && assignment.responseType === 'text' && (
                          <>
                            {assignment.mySubmission && (
                              <Alert severity="success">
                                Resposta enviada em {formatDate(assignment.mySubmission.submittedAt)}.
                                <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>{assignment.mySubmission.response}</Typography>
                              </Alert>
                            )}
                            <TextField
                              label={submitted ? 'Atualizar resposta' : 'Sua resposta'}
                              value={responses[assignment._id] ?? assignment.mySubmission?.response ?? ''}
                              onChange={(event) => setResponses((current) => ({ ...current, [assignment._id]: event.target.value }))}
                              multiline
                              minRows={3}
                              inputProps={{ maxLength: 5000 }}
                              required
                            />
                            <Box>
                              <Button
                                variant="contained"
                                disabled={submittingId === assignment._id || !(responses[assignment._id] ?? assignment.mySubmission?.response ?? '').trim()}
                                onClick={() => void submitResponse(assignment)}
                              >
                                {submittingId === assignment._id ? 'Enviando...' : submitted ? 'Atualizar resposta' : 'Enviar resposta'}
                              </Button>
                            </Box>
                          </>
                        )}
                        {canViewSubmissions && assignment.responseType === 'text' && (
                          <Button variant="outlined" sx={{ alignSelf: 'flex-start' }} onClick={() => void viewSubmissions(assignment)}>
                            Ver entregas
                          </Button>
                        )}
                      </Stack>
                    </AccordionDetails>
                  </Accordion>
                );
              })}
            </Stack>
          )}
        </Paper>
      </Stack>

      <Dialog open={createDialogOpen} onClose={() => !saving && setCreateDialogOpen(false)} fullWidth maxWidth="sm">
        <Box component="form" onSubmit={createAssignment}>
          <DialogTitle>Nova tarefa</DialogTitle>
          <DialogContent sx={{ display: 'grid', gap: 2, pt: '12px !important' }}>
                <FormControl size="small" required>
                  <InputLabel id="assignment-class-label">Turma</InputLabel>
                  <Select
                    labelId="assignment-class-label"
                    label="Turma"
                    value={assignmentClassId}
                    onChange={(event) => setAssignmentClassId(event.target.value)}
                    disabled={loading}
                  >
                    {classes.map((sportsClass) => (
                      <MenuItem key={sportsClass._id} value={sportsClass._id}>{sportsClass.name} · {sportsClass.modality}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField label="Título" value={title} onChange={(event) => setTitle(event.target.value)} inputProps={{ maxLength: 160 }} required />
                <TextField
                  label="Instruções"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  multiline
                  minRows={3}
                  inputProps={{ maxLength: 5000 }}
                  required
                  sx={{ gridColumn: { sm: '1 / -1' } }}
                />
                <FormControl size="small">
                  <InputLabel id="assignment-response-label">Tipo de atividade</InputLabel>
                  <Select
                    labelId="assignment-response-label"
                    label="Tipo de atividade"
                    value={responseType}
                    onChange={(event) => setResponseType(event.target.value as 'text' | 'none')}
                  >
                    <MenuItem value="text">Resposta em texto</MenuItem>
                    <MenuItem value="none">Sem resposta pela plataforma</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  label="Prazo (opcional)"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
                <Box sx={{ gridColumn: { sm: '1 / -1' } }}>
                  <Typography variant="caption" color="text.secondary">Os alunos da turma selecionada poderão ver esta atividade.</Typography>
                </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setCreateDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={saving || loading || !assignmentClassId}>
              {saving ? 'Publicando...' : 'Publicar tarefa'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog open={Boolean(selectedAssignment)} onClose={() => !submissionsLoading && setSelectedAssignment(null)} fullWidth maxWidth="md">
        <DialogTitle>Entregas: {selectedAssignment?.title}</DialogTitle>
        <DialogContent dividers>
          {submissionsLoading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box> : submissions.length === 0 ? (
            <Typography color="text.secondary">Ainda não há respostas para esta tarefa.</Typography>
          ) : (
            <Stack spacing={2}>
              {submissions.map((submission) => (
                <Paper key={submission._id} variant="outlined" sx={{ p: 2 }}>
                  <Typography fontWeight={750}>
                    {typeof submission.studentId === 'string' ? 'Aluno' : submission.studentId.fullName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">Enviada em {formatDate(submission.submittedAt)}</Typography>
                  <Typography sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>{submission.response}</Typography>
                </Paper>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setSelectedAssignment(null)}>Fechar</Button></DialogActions>
      </Dialog>
    </DashboardLayout>
  );
}
