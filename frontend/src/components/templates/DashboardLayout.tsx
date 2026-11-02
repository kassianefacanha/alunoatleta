import { Box, Button, Container, Typography } from '@mui/material';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import { Brand } from '../atoms/Brand';

export function DashboardLayout({ children, onLogout, name }: { children: React.ReactNode; onLogout: () => void; name: string }) {
  return (
    <Box className="app-shell">
      <Box component="header" className="site-header">
        <Brand />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="body2" color="text.secondary">{name}</Typography>
          <Button size="small" startIcon={<LogoutRoundedIcon />} onClick={onLogout}>Sair</Button>
        </Box>
      </Box>
      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 }, flex: 1 }}>{children}</Container>
      <Box component="footer" className="site-footer">Projeto Aluno/Atleta · Alto da Mangueira · Maracanaú/CE</Box>
    </Box>
  );
}
