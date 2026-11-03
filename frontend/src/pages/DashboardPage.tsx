import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Grid, Paper, Skeleton, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { DashboardLayout } from '../components/templates/DashboardLayout';
import { StatCard } from '../components/molecules/StatCard';
import { apiRequest } from '../lib/api';

export function DashboardPage() {
  const navigate = useNavigate();
  const user = JSON.parse(sessionStorage.getItem('user') ?? '{"email":"Aluno","role":"student"}') as { email: string; role: string };
  const [stats, setStats] = useState<Record<string, number>>({});
  const [statsError, setStatsError] = useState('');
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsRequest, setStatsRequest] = useState(0);
  useEffect(() => {
    let active = true;
    setStatsLoading(true);
    setStatsError('');
    apiRequest<Record<string, number>>('/dashboard/stats')
      .then((result) => { if (active) setStats(result); })
      .catch((error: unknown) => {
        if (active) setStatsError(error instanceof Error ? error.message : 'Não foi possível carregar as estatísticas do painel.');
      })
      .finally(() => { if (active) setStatsLoading(false); });
    return () => { active = false; };
  }, [statsRequest]);
  const heading = user.role === 'admin' ? 'Visão geral do sistema' : user.role === 'teacher' ? 'Sua turma em foco' : 'Sua jornada esportiva';
  const cards: Array<[string, string | number, string]> = user.role === 'admin'
    ? [['Alunos', stats.students ?? '—', 'Alunos cadastrados'], ['Professores', stats.teachers ?? '—', 'Equipe ativa'], ['Turmas', stats.classes ?? '—', 'Turmas esportivas'], ['Presenças', stats.attendance ?? '—', 'Registros realizados'], ['Tarefas entregues', stats.assignmentsDelivered ?? '—', 'Respostas recebidas'], ['Engajamento social', stats.socialEngagement ?? '—', 'Interações na rede'], ['Inscrições pendentes', stats.pendingEnrollments ?? '—', 'Aguardando análise']]
    : user.role === 'teacher'
      ? [['Alunos', stats.students ?? '—', 'Aprovados nas suas turmas'], ['Presenças', stats.attendance ?? '—', 'Registros nas suas turmas'], ['Tarefas', stats.assignments ?? '—', 'Publicadas nas suas turmas'], ['Entregas', stats.assignmentsDelivered ?? '—', 'Respostas recebidas'], ['Inscrições', stats.pendingEnrollments ?? '—', 'Aguardando análise'], ['Turmas', stats.classes ?? '—', 'Sob sua responsabilidade']]
      : [['Presenças', stats.attendance ?? '—', `${stats.attendanceRate ?? '—'}% de frequência`], ['Avaliações', stats.evaluations ?? '—', 'Seu desenvolvimento'], ['Tarefas', stats.assignmentsToDo ?? '—', 'Pendentes para entregar'], ['Notificações', stats.unreadNotifications ?? '—', 'Não lidas']];
  const shortcuts: Array<{ title: string; description: string; path: string; action: string }> = user.role === 'admin'
    ? [
      { title: 'Alunos e inscrições', description: 'Consulte cadastros e analise inscrições pendentes.', path: '/alunos', action: 'Gerenciar alunos' },
      { title: 'Turmas e professores', description: 'Organize modalidades, turmas e permissões.', path: '/turmas', action: 'Gerenciar turmas' },
      { title: 'Chamada', description: 'Registre e consulte a frequência das turmas.', path: '/chamadas', action: 'Abrir chamada' },
      { title: 'Exportações', description: 'Gere relatórios em CSV, Excel ou PDF.', path: '/exportacoes', action: 'Exportar dados' }
    ]
    : user.role === 'teacher'
      ? [
        { title: 'Alunos e inscrições', description: 'Acompanhe seus alunos e analise inscrições.', path: '/alunos', action: 'Ver alunos' },
        { title: 'Chamada', description: 'Registre a presença da turma por data.', path: '/chamadas', action: 'Fazer chamada' },
        { title: 'Tarefas', description: 'Publique atividades e acompanhe entregas.', path: '/tarefas', action: 'Gerenciar tarefas' },
        { title: 'Materiais e avisos', description: 'Compartilhe conteúdos e comunicados.', path: '/materiais-avisos', action: 'Abrir conteúdos' }
      ]
      : [
        { title: 'Minhas tarefas', description: 'Consulte atividades e envie suas respostas.', path: '/tarefas', action: 'Ver tarefas' },
        { title: 'Meu desenvolvimento', description: 'Acompanhe presença, avaliações e feedback.', path: '/meu-perfil', action: 'Ver meu perfil' },
        { title: 'Rede social', description: 'Veja novidades e interaja com sua turma.', path: '/rede-social', action: 'Acessar rede social' }
      ];
  return (
    <DashboardLayout name={user.email} onLogout={() => { sessionStorage.clear(); navigate('/login'); }}>
      <Box sx={{ mb: 3 }}>
        <Box>
          <Typography variant="overline" color="primary" fontWeight={800}>PAINEL {user.role.toUpperCase()}</Typography>
          <Typography variant="h4" fontWeight={800}>{heading}</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            {user.role === 'student'
              ? 'Acompanhe suas atividades e encontre o próximo passo da sua jornada.'
              : 'Acesse rapidamente as atividades que você mais usa.'}
          </Typography>
        </Box>
      </Box>
      {(user.role === 'admin' || user.role === 'teacher') && Number(stats.pendingEnrollments) > 0 && (
        <Paper variant="outlined" sx={{ mb: 3, p: { xs: 2, sm: 2.5 }, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', borderColor: 'warning.light', bgcolor: 'warning.50' }}>
          <Box>
            <Typography fontWeight={750}>
              {stats.pendingEnrollments} {Number(stats.pendingEnrollments) === 1 ? 'inscrição aguarda' : 'inscrições aguardam'} análise
            </Typography>
            <Typography variant="body2" color="text.secondary">Revise os documentos e atualize o status dos candidatos.</Typography>
          </Box>
          <Button variant="contained" onClick={() => navigate('/alunos')} endIcon={<ArrowForwardRoundedIcon />}>Analisar inscrições</Button>
        </Paper>
      )}
      <Grid container spacing={2} aria-busy={statsLoading}>
        {cards.map(([label, value, detail]) => <Grid key={label} item xs={12} sm={6} md={3}><StatCard label={label} value={statsLoading ? <Skeleton aria-hidden="true" width={72} /> : value} detail={detail} /></Grid>)}
      </Grid>
      {statsError && <Alert severity="error" sx={{ mt: 2 }} action={<Button color="inherit" size="small" onClick={() => setStatsRequest((request) => request + 1)}>Tentar novamente</Button>}>{statsError}</Alert>}
      <Box sx={{ mt: 4 }}>
        <Typography variant="h6" fontWeight={750} sx={{ mb: 2 }}>Acesso rápido</Typography>
        <Grid container spacing={2}>
          {shortcuts.map((shortcut) => (
            <Grid key={shortcut.path} item xs={12} sm={6} md={user.role === 'student' ? 4 : 3}>
              <Paper variant="outlined" sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <Typography variant="subtitle1" fontWeight={750}>{shortcut.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 2, flex: 1 }}>{shortcut.description}</Typography>
                <Button onClick={() => navigate(shortcut.path)} endIcon={<ArrowForwardRoundedIcon />} sx={{ px: 0 }}>
                  {shortcut.action}
                </Button>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Box>
    </DashboardLayout>
  );
}
