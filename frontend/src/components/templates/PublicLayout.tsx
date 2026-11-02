import { Box, Container, Link, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { Brand } from '../atoms/Brand';

export function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <Box className="app-shell">
      <Box component="header" className="site-header">
        <RouterLink to="/" style={{ textDecoration: 'none' }}><Brand /></RouterLink>
        <Link component={RouterLink} to="/login" underline="hover" color="primary.dark" fontWeight={700}>Já tenho cadastro</Link>
      </Box>
      <Container maxWidth={false} disableGutters>{children}</Container>
      <Box component="footer" className="site-footer">
        <Typography variant="caption">Projeto Aluno/Atleta · Alto da Mangueira · Maracanaú/CE</Typography>
      </Box>
    </Box>
  );
}
