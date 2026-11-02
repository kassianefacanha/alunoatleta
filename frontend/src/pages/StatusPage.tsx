import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Paper, Typography } from '@mui/material';
import HourglassTopRoundedIcon from '@mui/icons-material/HourglassTopRounded';
import { DashboardLayout } from '../components/templates/DashboardLayout';

export function StatusPage() {
  const navigate = useNavigate();
  const user = JSON.parse(sessionStorage.getItem('user') ?? '{"email":"Aluno"}') as { email: string };
  const enrollment = JSON.parse(sessionStorage.getItem('enrollment') ?? '{"status":"pending"}') as { status: string; rejectionReason?: string };
  const rejected = enrollment.status === 'rejected';
  return (
    <DashboardLayout name={user.email} onLogout={() => { sessionStorage.clear(); navigate('/login'); }}>
      <Box sx={{ maxWidth: 680, mx: 'auto', mt: 5 }}>
        <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 }, textAlign: 'center' }}>
          <HourglassTopRoundedIcon color={rejected ? 'error' : 'primary'} sx={{ fontSize: 48, mb: 1 }} />
          <Typography variant="h4" fontWeight={800}>{rejected ? 'Sua inscrição precisa de ajustes' : 'Sua inscrição está em análise'}</Typography>
          <Typography color="text.secondary" sx={{ mt: 1.5 }}>
            {rejected ? 'Revise as informações e envie novamente para nossa equipe.' : 'Assim que o professor analisar seus documentos, você receberá uma atualização.'}
          </Typography>
          {rejected && enrollment.rejectionReason && <Alert severity="warning" sx={{ mt: 3, textAlign: 'left' }}>{enrollment.rejectionReason}</Alert>}
          {rejected && <Button variant="contained" sx={{ mt: 3 }} onClick={() => navigate('/corrigir-inscricao')}>Corrigir inscrição</Button>}
        </Paper>
      </Box>
    </DashboardLayout>
  );
}
