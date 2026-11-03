import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControl, Grid, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography
} from '@mui/material';
import { DashboardLayout } from '../components/templates/DashboardLayout';
import { apiRequest } from '../lib/api';

interface SportsClass {
  _id: string;
  name: string;
  modality: string;
  studentIds: string[];
}

interface StudentRecord {
  _id: string;
  fullName: string;
  enrollmentStatus: string;
  classIds: string[];
}

interface ClassSummary {
  _id: string;
  name: string;
  modality: string;
}

interface TeacherSummary {
  _id: string;
  email: string;
}

interface EventRecord {
  _id: string;
  classId: string | ClassSummary;
  title: string;
  description: string;
  startsAt: string;
  location?: string;
}

interface LessonPlanRecord {
  _id: string;
  classId: string | ClassSummary;
  date: string;
  objectives: string;
  activities: string;
  notes?: string;
}

interface EvaluationRecord {
  _id: string;
  classId: string | ClassSummary;
  studentId: string | { _id: string; fullName: string };
  teacherId: string | TeacherSummary;
  score: number;
  feedback: string;
  evaluatedAt: string;
}

function classIdOf(value: string | ClassSummary) {
  return typeof value === 'string' ? value : value._id;
}

function classNameOf(value: string | ClassSummary, classes: SportsClass[]) {
  if (typeof value !== 'string') return value.name;
  return classes.find((sportsClass) => sportsClass._id === value)?.name ?? 'Turma';
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR');
}

export function EventsEvaluationsPage() {
  const navigate = useNavigate();
  const user = JSON.parse(sessionStorage.getItem('user') ?? '{"email":"Usuário","role":"student"}') as { email: string; role: string };
  const canManage = user.role === 'admin' || user.role === 'teacher';
  const [classes, setClasses] = useState<SportsClass[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [lessonPlans, setLessonPlans] = useState<LessonPlanRecord[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>([]);
  const [classId, setClassId] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventStartsAt, setEventStartsAt] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [planDate, setPlanDate] = useState('');
  const [planObjectives, setPlanObjectives] = useState('');
  const [planActivities, setPlanActivities] = useState('');
  const [planNotes, setPlanNotes] = useState('');
  const [evaluationStudentId, setEvaluationStudentId] = useState('');
  const [evaluationScore, setEvaluationScore] = useState('');
  const [evaluationFeedback, setEvaluationFeedback] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<'event' | 'plan' | 'evaluation' | null>(null);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [evaluationDialogOpen, setEvaluationDialogOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadData(selectedClassId = classId) {
    setLoading(true);
    setError('');
    try {
      const suffix = selectedClassId ? `?classId=${encodeURIComponent(selectedClassId)}` : '';
      const [classResult, eventResult, planResult, evaluationResult, studentResult] = await Promise.all([
        apiRequest<{ classes: SportsClass[] }>('/classes'),
        apiRequest<{ events: EventRecord[] }>(`/events${suffix}`),
        apiRequest<{ lessonPlans: LessonPlanRecord[] }>(`/lesson-plans${suffix}`),
        apiRequest<{ evaluations: EvaluationRecord[] }>(`/evaluations${suffix}`),
        canManage ? apiRequest<{ students: StudentRecord[] }>('/students') : Promise.resolve({ students: [] })
      ]);
      setClasses(classResult.classes);
      setStudents(studentResult.students.filter((student) => student.enrollmentStatus === 'approved'));
      setEvents(eventResult.events);
      setLessonPlans(planResult.lessonPlans);
      setEvaluations(evaluationResult.evaluations);
      if (!selectedClassId && classResult.classes.length) setClassId(classResult.classes[0]._id);
      else if (selectedClassId) setClassId(selectedClassId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar eventos e avaliações.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData('');
  }, []);

  async function saveEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!classId) return;
    setSaving('event');
    setError('');
    setNotice('');
    try {
      await apiRequest('/events', {
        method: 'POST',
        body: JSON.stringify({
          classId,
          title: eventTitle.trim(),
          description: eventDescription.trim(),
          startsAt: new Date(eventStartsAt).toISOString(),
          ...(eventLocation.trim() ? { location: eventLocation.trim() } : {})
        })
      });
      setEventTitle('');
      setEventDescription('');
      setEventStartsAt('');
      setEventLocation('');
      setEventDialogOpen(false);
      setNotice('Evento publicado.');
      await loadData(classId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível publicar o evento.');
    } finally {
      setSaving(null);
    }
  }

  async function saveLessonPlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!classId) return;
    setSaving('plan');
    setError('');
    setNotice('');
    try {
      await apiRequest('/lesson-plans', {
        method: 'POST',
        body: JSON.stringify({
          classId,
          date: new Date(`${planDate}T12:00:00`).toISOString(),
          objectives: planObjectives.trim(),
          activities: planActivities.trim(),
          ...(planNotes.trim() ? { notes: planNotes.trim() } : {})
        })
      });
      setPlanDate('');
      setPlanObjectives('');
      setPlanActivities('');
      setPlanNotes('');
      setPlanDialogOpen(false);
      setNotice('Plano de aula registrado.');
      await loadData(classId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível registrar o plano de aula.');
    } finally {
      setSaving(null);
    }
  }

  async function saveEvaluation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!classId || !evaluationStudentId) return;
    setSaving('evaluation');
    setError('');
    setNotice('');
    try {
      await apiRequest('/evaluations', {
        method: 'POST',
        body: JSON.stringify({
          classId,
          studentId: evaluationStudentId,
          score: Number(evaluationScore),
          feedback: evaluationFeedback.trim()
        })
      });
      setEvaluationStudentId('');
      setEvaluationScore('');
      setEvaluationFeedback('');
      setEvaluationDialogOpen(false);
      setNotice('Avaliação registrada.');
      await loadData(classId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível registrar a avaliação.');
    } finally {
      setSaving(null);
    }
  }

  const selectedClass = classes.find((item) => item._id === classId);
  const classStudents = students.filter((student) =>
    selectedClass?.studentIds.includes(student._id) || student.classIds.includes(classId)
  );
  const visibleEvents = events.filter((event) => !classId || classIdOf(event.classId) === classId);
  const visiblePlans = lessonPlans.filter((plan) => !classId || classIdOf(plan.classId) === classId);
  const visibleEvaluations = evaluations.filter((evaluation) => !classId || classIdOf(evaluation.classId) === classId);
  const logout = () => {
    sessionStorage.clear();
    navigate('/login');
  };

  return (
    <DashboardLayout name={user.email} onLogout={logout}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="overline" color="primary" fontWeight={800}>VIDA DA TURMA</Typography>
          <Typography variant="h4" fontWeight={800}>Eventos, aulas e avaliações</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {canManage ? 'Organize eventos, registre planos de aula e acompanhe o desenvolvimento dos atletas.' : 'Consulte a programação e acompanhe seu desenvolvimento esportivo.'}
          </Typography>
        </Box>

        {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 320 } }} disabled={loading || classes.length === 0}>
            <InputLabel id="events-class-label">Filtrar por turma</InputLabel>
            <Select
              labelId="events-class-label"
              label="Filtrar por turma"
              value={classId}
              onChange={(event) => void loadData(event.target.value)}
            >
              {classes.map((sportsClass) => (
                <MenuItem key={sportsClass._id} value={sportsClass._id}>{sportsClass.name} · {sportsClass.modality}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Paper>

        {canManage && (
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Button variant="contained" onClick={() => setEventDialogOpen(true)} disabled={loading || !classId}>Divulgar evento</Button>
            <Button variant="outlined" onClick={() => setPlanDialogOpen(true)} disabled={loading || !classId}>Registrar plano de aula</Button>
            <Button variant="outlined" onClick={() => setEvaluationDialogOpen(true)} disabled={loading || !classId || classStudents.length === 0}>Avaliar atleta</Button>
            {classes.length === 0 && !loading && <Alert severity="info">Cadastre uma turma para registrar atividades.</Alert>}
          </Stack>
        )}

        <Grid container spacing={2}>
          <Grid item xs={12} lg={6}>
            <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, height: '100%' }}>
              <Typography variant="h6" fontWeight={750} sx={{ mb: 2 }}>Eventos</Typography>
              {loading ? <CircularProgress size={24} /> : visibleEvents.length === 0 ? (
                <Typography color="text.secondary">Nenhum evento divulgado para esta turma.</Typography>
              ) : (
                <Stack spacing={1.5}>
                  {visibleEvents.map((event) => (
                    <Card variant="outlined" key={event._id}>
                      <CardContent>
                        <Typography variant="subtitle1" fontWeight={750}>{event.title}</Typography>
                        <Typography variant="body2" color="text.secondary">{classNameOf(event.classId, classes)} · {formatDate(event.startsAt)}</Typography>
                        {event.location && <Typography variant="body2">Local: {event.location}</Typography>}
                        <Typography sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>{event.description}</Typography>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              )}
            </Paper>
          </Grid>
          <Grid item xs={12} lg={6}>
            <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, height: '100%' }}>
              <Typography variant="h6" fontWeight={750} sx={{ mb: 2 }}>Planos de aula</Typography>
              {loading ? <CircularProgress size={24} /> : visiblePlans.length === 0 ? (
                <Typography color="text.secondary">Nenhum plano de aula registrado.</Typography>
              ) : (
                <Stack spacing={1.5}>
                  {visiblePlans.map((plan) => (
                    <Card variant="outlined" key={plan._id}>
                      <CardContent>
                        <Typography variant="subtitle1" fontWeight={750}>{classNameOf(plan.classId, classes)} · {formatDate(plan.date)}</Typography>
                        <Typography variant="body2" fontWeight={700} sx={{ mt: 1 }}>Objetivos</Typography>
                        <Typography sx={{ whiteSpace: 'pre-wrap' }}>{plan.objectives}</Typography>
                        <Typography variant="body2" fontWeight={700} sx={{ mt: 1 }}>Atividades</Typography>
                        <Typography sx={{ whiteSpace: 'pre-wrap' }}>{plan.activities}</Typography>
                        {plan.notes && <Typography color="text.secondary" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>{plan.notes}</Typography>}
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              )}
            </Paper>
          </Grid>
        </Grid>

        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          <Typography variant="h6" fontWeight={750} sx={{ mb: 2 }}>{canManage ? 'Avaliações registradas' : 'Meu desenvolvimento'}</Typography>
          {loading ? <CircularProgress size={24} /> : visibleEvaluations.length === 0 ? (
            <Typography color="text.secondary">Nenhuma avaliação registrada.</Typography>
          ) : (
            <Grid container spacing={2}>
              {visibleEvaluations.map((evaluation) => (
                <Grid item xs={12} md={6} key={evaluation._id}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6" fontWeight={750}>
                        {typeof evaluation.studentId === 'string' ? 'Atleta' : evaluation.studentId.fullName} · {evaluation.score}/10
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {classNameOf(evaluation.classId, classes)} · {formatDate(evaluation.evaluatedAt)}
                      </Typography>
                      {typeof evaluation.teacherId !== 'string' && <Typography variant="body2">Professor: {evaluation.teacherId.email}</Typography>}
                      <Typography sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>{evaluation.feedback}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Paper>
      </Stack>

      <Dialog open={eventDialogOpen} onClose={() => saving !== 'event' && setEventDialogOpen(false)} fullWidth maxWidth="sm">
        <Box component="form" onSubmit={saveEvent}>
          <DialogTitle>Divulgar evento</DialogTitle>
          <DialogContent sx={{ display: 'grid', gap: 2, pt: '12px !important' }}>
            <TextField label="Título" value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} inputProps={{ maxLength: 160 }} required />
            <TextField label="Descrição" value={eventDescription} onChange={(event) => setEventDescription(event.target.value)} multiline minRows={3} inputProps={{ maxLength: 3000 }} required />
            <TextField label="Data e hora" type="datetime-local" value={eventStartsAt} onChange={(event) => setEventStartsAt(event.target.value)} InputLabelProps={{ shrink: true }} required />
            <TextField label="Local (opcional)" value={eventLocation} onChange={(event) => setEventLocation(event.target.value)} inputProps={{ maxLength: 300 }} />
            {error && <Alert severity="error">{error}</Alert>}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setEventDialogOpen(false)} disabled={saving === 'event'}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={saving !== null || loading || !classId}>
              {saving === 'event' ? 'Publicando...' : 'Publicar evento'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog open={planDialogOpen} onClose={() => saving !== 'plan' && setPlanDialogOpen(false)} fullWidth maxWidth="sm">
        <Box component="form" onSubmit={saveLessonPlan}>
          <DialogTitle>Registrar plano de aula</DialogTitle>
          <DialogContent sx={{ display: 'grid', gap: 2, pt: '12px !important' }}>
            <TextField label="Data da aula" type="date" value={planDate} onChange={(event) => setPlanDate(event.target.value)} InputLabelProps={{ shrink: true }} required />
            <TextField label="Objetivos" value={planObjectives} onChange={(event) => setPlanObjectives(event.target.value)} multiline minRows={2} inputProps={{ maxLength: 2000 }} required />
            <TextField label="Atividades" value={planActivities} onChange={(event) => setPlanActivities(event.target.value)} multiline minRows={2} inputProps={{ maxLength: 5000 }} required />
            <TextField label="Observações (opcional)" value={planNotes} onChange={(event) => setPlanNotes(event.target.value)} multiline minRows={2} inputProps={{ maxLength: 3000 }} />
            {error && <Alert severity="error">{error}</Alert>}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setPlanDialogOpen(false)} disabled={saving === 'plan'}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={saving !== null || loading || !classId}>
              {saving === 'plan' ? 'Salvando...' : 'Salvar plano'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog open={evaluationDialogOpen} onClose={() => saving !== 'evaluation' && setEvaluationDialogOpen(false)} fullWidth maxWidth="sm">
        <Box component="form" onSubmit={saveEvaluation}>
          <DialogTitle>Avaliar atleta</DialogTitle>
          <DialogContent sx={{ display: 'grid', gap: 2, pt: '12px !important' }}>
            <FormControl size="small" required>
              <InputLabel id="evaluation-student-label">Aluno</InputLabel>
              <Select
                labelId="evaluation-student-label"
                label="Aluno"
                value={evaluationStudentId}
                onChange={(event) => setEvaluationStudentId(event.target.value)}
              >
                {classStudents.map((student) => <MenuItem key={student._id} value={student._id}>{student.fullName}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField label="Nota (0 a 10)" type="number" value={evaluationScore} onChange={(event) => setEvaluationScore(event.target.value)} inputProps={{ min: 0, max: 10, step: 0.1 }} required />
            <TextField label="Feedback de desempenho" value={evaluationFeedback} onChange={(event) => setEvaluationFeedback(event.target.value)} multiline minRows={3} inputProps={{ maxLength: 3000 }} required />
            {error && <Alert severity="error">{error}</Alert>}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setEvaluationDialogOpen(false)} disabled={saving === 'evaluation'}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={saving !== null || loading || !classId || !evaluationStudentId}>
              {saving === 'evaluation' ? 'Salvando...' : 'Registrar avaliação'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </DashboardLayout>
  );
}
