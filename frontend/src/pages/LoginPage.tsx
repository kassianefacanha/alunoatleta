import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Link, Paper, TextField, Typography } from '@mui/material';
import { PublicLayout } from '../components/templates/PublicLayout';
import { apiRequest } from '../lib/api';
import type { TeacherPermission } from '../lib/permissions';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: string; teacherPermissions?: TeacherPermission[] };
  enrollment?: { status: string; rejectionReason?: string };
}

export function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const logoutNotice = sessionStorage.getItem('logoutNotice');
    if (logoutNotice) {
      setNotice(logoutNotice);
      sessionStorage.removeItem('logoutNotice');
    }
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    const formData = new FormData(event.currentTarget);
    try {
      const result = await apiRequest<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: formData.get('email'), password: formData.get('password') })
      });
      sessionStorage.setItem('accessToken', result.accessToken);
      sessionStorage.setItem('refreshToken', result.refreshToken);
      sessionStorage.setItem('user', JSON.stringify(result.user));
      sessionStorage.removeItem('logoutNotice');
      if (result.enrollment) sessionStorage.setItem('enrollment', JSON.stringify(result.enrollment));
      navigate(result.enrollment?.status === 'approved' || !result.enrollment ? '/app' : '/status');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível fazer login.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <PublicLayout>
      <Box sx={{ width: 'min(100% - 32px, 460px)', mx: 'auto', my: { xs: 5, md: 9 } }}>
        <Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 } }}>
          <Typography variant="h4" fontWeight={800}>Boas-vindas de volta</Typography>
          <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>Entre para acompanhar sua jornada no esporte.</Typography>
          {notice && <Alert severity="warning" sx={{ mb: 2 }}>{notice}</Alert>}
          <Box component="form" onSubmit={submit} sx={{ display: 'grid', gap: 2 }}>
            <TextField name="email" label="E-mail" type="email" autoComplete="email" required />
            <TextField name="password" label="Senha" type="password" autoComplete="current-password" required />
            {error && <Alert severity="error">{error}</Alert>}
            <Button type="submit" variant="contained" size="large" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</Button>
          </Box>
          <Typography variant="body2" sx={{ mt: 3 }}>Ainda não tem cadastro? <Link component={RouterLink} to="/inscricao" fontWeight={700}>Faça sua inscrição</Link></Typography>
        </Paper>
      </Box>
    </PublicLayout>
  );
}
