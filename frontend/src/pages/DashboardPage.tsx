import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Grid, Paper, Typography } from '@mui/material';
import { DashboardLayout } from '../components/templates/DashboardLayout';
import { StatCard } from '../components/molecules/StatCard';
import { apiRequest } from '../lib/api';

export function DashboardPage() {
  const navigate = useNavigate();
  const user = JSON.parse(sessionStorage.getItem('user') ?? '{"email":"Aluno","role":"student"}') as { email: string; role: string };
  const [adminStats, setAdminStats] = useState<Record<string, number>>({});
  const [statsError, setStatsError] = useState('');
  useEffect(() => {
    if (user.role !== 'admin') return;
    apiRequest<Record<string, number>>('/dashboard/stats')
      .then(setAdminStats)
      .catch((error: unknown) => setStatsError(error instanceof Error ? error.message : 'Não foi possível carregar as estatísticas.'));
  }, [user.role]);
  const heading = user.role === 'admin' ? 'Visão geral do sistema' : user.role === 'teacher' ? 'Sua turma em foco' : 'Sua jornada esportiva';
  const cards: Array<[string, string | number, string]> = user.role === 'admin'
    ? [['Alunos', adminStats.students ?? '—', 'Alunos cadastrados'], ['Professores', adminStats.teachers ?? '—', 'Equipe ativa'], ['Turmas', adminStats.classes ?? '—', 'Turmas esportivas'], ['Presenças', adminStats.attendance ?? '—', 'Registros realizados'], ['Tarefas entregues', adminStats.assignmentsDelivered ?? '—', 'Respostas recebidas'], ['Engajamento social', adminStats.socialEngagement ?? '—', 'Interações na rede'], ['Inscrições pendentes', adminStats.pendingEnrollments ?? '—', 'Aguardando análise']]
    : user.role === 'teacher'
      ? [['Alunos', '—', 'Na sua turma'], ['Presenças', '—', 'Registros recentes'], ['Tarefas', '—', 'Atividades abertas'], ['Inscrições', '—', 'Aguardando aprovação']]
      : [['Presenças', '—', 'Sua participação'], ['Avaliações', '—', 'Seu desenvolvimento'], ['Tarefas', '—', 'Para fazer'], ['Notificações', '—', 'Novidades da turma']];
  return (
    <DashboardLayout name={user.email} onLogout={() => { sessionStorage.clear(); navigate('/login'); }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 3, gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="overline" color="primary" fontWeight={800}>PAINEL {user.role.toUpperCase()}</Typography>
          <Typography variant="h4" fontWeight={800}>{heading}</Typography>
        </Box>
        {user.role === 'admin' && <Button variant="outlined">Exportar relatório</Button>}
      </Box>
      <Grid container spacing={2}>
        {cards.map(([label, value, detail]) => <Grid key={label} item xs={12} sm={6} md={3}><StatCard label={label} value={value} detail={detail} /></Grid>)}
      </Grid>
      {statsError && <Typography color="error" sx={{ mt: 2 }}>{statsError}</Typography>}
      <Paper variant="outlined" sx={{ mt: 3, p: { xs: 2.5, md: 4 } }}>
        <Typography variant="h6" fontWeight={750}>Bem-vindo ao Aluno Atleta</Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>Seu espaço de esporte, aprendizado e desenvolvimento. As informações do seu perfil serão exibidas aqui.</Typography>
      </Paper>
    </DashboardLayout>
  );
}
