import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Divider, Paper, Stack, TextField, Typography
} from '@mui/material';
import { DashboardLayout } from '../components/templates/DashboardLayout';
import { apiRequest } from '../lib/api';

interface StudentProfile {
  fullName: string;
  age: number;
  birthDate: string;
  sex: string;
  modality: string;
  school: string;
  address: { neighborhood: string; city: string; street: string; number: string; complement?: string };
  guardian: { name: string; phone: string };
  enrollmentStatus: string;
}

interface ClassReference {
  name: string;
}

interface AttendanceRecord {
  _id: string;
  classId: string | ClassReference;
  date: string;
  status: 'present' | 'absent' | 'excused';
  note?: string;
}

interface EvaluationRecord {
  _id: string;
  classId: string | ClassReference;
  teacherId: string | { email: string };
  score: number;
  feedback: string;
  evaluatedAt: string;
}

interface SubmissionRecord {
  _id: string;
  response: string;
  submittedAt: string;
  assignmentId: string | { title: string; dueAt?: string };
}

interface Development {
  attendance: AttendanceRecord[];
  evaluations: EvaluationRecord[];
  submissions: SubmissionRecord[];
}

const attendanceLabels = { present: 'Presente', absent: 'Ausente', excused: 'Justificada' };

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR');
}

function className(value: string | ClassReference) {
  return typeof value === 'string' ? 'Turma' : value.name;
}

export function StudentProfilePage() {
  const navigate = useNavigate();
  const user = JSON.parse(sessionStorage.getItem('user') ?? '{"email":"Aluno"}') as { email: string };
  const [email, setEmail] = useState(user.email);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [development, setDevelopment] = useState<Development | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    Promise.all([
      apiRequest<{ student: StudentProfile; email: string }>('/students/me'),
      apiRequest<Development>('/students/me/development')
    ]).then(([profileResult, developmentResult]) => {
      setProfile(profileResult.student);
      setEmail(profileResult.email);
      setDevelopment(developmentResult);
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar seu perfil.');
    }).finally(() => setLoading(false));
  }, []);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await apiRequest<{ student: Pick<StudentProfile, 'fullName' | 'school' | 'address' | 'guardian'> }>('/students/me', {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: profile.fullName,
          school: profile.school,
          address: profile.address,
          guardian: profile.guardian
        })
      });
      setProfile((current) => current ? { ...current, ...result.student } : current);
      setNotice('Perfil atualizado com sucesso.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar o perfil.');
    } finally {
      setSaving(false);
    }
  }

  function updateAddress(field: keyof StudentProfile['address'], value: string) {
    setProfile((current) => current ? { ...current, address: { ...current.address, [field]: value } } : current);
  }

  function updateGuardian(field: keyof StudentProfile['guardian'], value: string) {
    setProfile((current) => current ? { ...current, guardian: { ...current.guardian, [field]: value } } : current);
  }

  return (
    <DashboardLayout name={email} onLogout={() => { sessionStorage.clear(); navigate('/login'); }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="overline" color="primary" fontWeight={800}>ÁREA DO ALUNO</Typography>
          <Typography variant="h4" fontWeight={800}>Meu perfil e desenvolvimento</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>Atualize seus dados pessoais e acompanhe sua jornada esportiva.</Typography>
        </Box>

        {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : profile && development ? (
          <>
            <Paper component="form" variant="outlined" onSubmit={saveProfile} sx={{ p: { xs: 2, md: 3 } }}>
              <Stack spacing={2.5}>
                <Box>
                  <Typography variant="h6" fontWeight={750}>Dados pessoais</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {profile.age} anos · {profile.sex} · {profile.modality} · Inscrição aprovada
                  </Typography>
                </Box>
                <TextField label="E-mail de acesso" value={email} disabled />
                <TextField
                  label="Nome completo"
                  value={profile.fullName}
                  onChange={(event) => setProfile({ ...profile, fullName: event.target.value })}
                  inputProps={{ maxLength: 150 }}
                  required
                />
                <TextField
                  label="Escola"
                  value={profile.school}
                  onChange={(event) => setProfile({ ...profile, school: event.target.value })}
                  inputProps={{ maxLength: 160 }}
                  required
                />
                <Divider />
                <Typography variant="subtitle1" fontWeight={700}>Endereço</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                  <TextField label="Bairro" value={profile.address.neighborhood} onChange={(event) => updateAddress('neighborhood', event.target.value)} required />
                  <TextField label="Cidade" value={profile.address.city} onChange={(event) => updateAddress('city', event.target.value)} required />
                  <TextField label="Rua / Endereço" value={profile.address.street} onChange={(event) => updateAddress('street', event.target.value)} required />
                  <TextField label="Número" value={profile.address.number} onChange={(event) => updateAddress('number', event.target.value)} required />
                  <TextField label="Complemento" value={profile.address.complement ?? ''} onChange={(event) => updateAddress('complement', event.target.value)} />
                </Box>
                <Divider />
                <Typography variant="subtitle1" fontWeight={700}>Responsável</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                  <TextField label="Nome do responsável" value={profile.guardian.name} onChange={(event) => updateGuardian('name', event.target.value)} required />
                  <TextField
                    label="Telefone do responsável"
                    value={profile.guardian.phone}
                    onChange={(event) => updateGuardian('phone', event.target.value)}
                    placeholder="(00) 00000-0000"
                    inputProps={{ maxLength: 15, pattern: '\\(\\d{2}\\) \\d{5}-\\d{4}' }}
                    helperText="Formato: (XX) XXXXX-XXXX"
                    required
                  />
                </Box>
                <Alert severity="info">A foto enviada na inscrição não pode ser alterada pelo perfil.</Alert>
                <Box><Button type="submit" variant="contained" disabled={saving}>{saving ? 'Salvando...' : 'Salvar alterações'}</Button></Box>
              </Stack>
            </Paper>

            <Box>
              <Typography variant="h5" fontWeight={800} sx={{ mb: 2 }}>Meu desenvolvimento</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" fontWeight={750}>Frequência</Typography>
                    {development.attendance.length ? development.attendance.map((record) => (
                      <Box key={record._id} sx={{ py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                        <Typography fontWeight={650}>{className(record.classId)} · {attendanceLabels[record.status]}</Typography>
                        <Typography variant="body2" color="text.secondary">{formatDate(record.date)}{record.note ? ` · ${record.note}` : ''}</Typography>
                      </Box>
                    )) : <Typography color="text.secondary" sx={{ mt: 1 }}>Ainda não há chamadas registradas.</Typography>}
                  </CardContent>
                </Card>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" fontWeight={750}>Avaliações</Typography>
                    {development.evaluations.length ? development.evaluations.map((record) => (
                      <Box key={record._id} sx={{ py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                        <Typography fontWeight={650}>{record.score}/10 · {className(record.classId)}</Typography>
                        <Typography variant="body2">{record.feedback}</Typography>
                        <Typography variant="caption" color="text.secondary">Professor · {formatDate(record.evaluatedAt)}</Typography>
                      </Box>
                    )) : <Typography color="text.secondary" sx={{ mt: 1 }}>Ainda não há avaliações registradas.</Typography>}
                  </CardContent>
                </Card>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" fontWeight={750}>Tarefas entregues</Typography>
                    {development.submissions.length ? development.submissions.map((record) => (
                      <Box key={record._id} sx={{ py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                        <Typography fontWeight={650}>
                          {typeof record.assignmentId === 'string' ? 'Tarefa' : record.assignmentId.title}
                        </Typography>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{record.response}</Typography>
                        <Typography variant="caption" color="text.secondary">Entregue em {formatDate(record.submittedAt)}</Typography>
                      </Box>
                    )) : <Typography color="text.secondary" sx={{ mt: 1 }}>Você ainda não entregou tarefas.</Typography>}
                  </CardContent>
                </Card>
              </Box>
            </Box>
          </>
        ) : null}
      </Stack>
    </DashboardLayout>
  );
}
