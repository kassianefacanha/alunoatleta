import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Container, Link, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { Brand } from '../components/atoms/Brand';

export function HomePage() {
  return (
    <Box className="app-shell">
      <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
      <Box component="header" className="site-header">
        <Brand />
        <Link component={RouterLink} to="/login" underline="hover" fontWeight={700}>Entrar</Link>
      </Box>
      <Container component="main" id="main-content" tabIndex={-1} maxWidth="lg" sx={{ py: { xs: 4, md: 8 } }}>
        <Box className="hero">
          <Typography variant="overline" sx={{ letterSpacing: 2, opacity: .8 }}>PROJETO ALUNO / ATLETA · ALTO DA MANGUEIRA</Typography>
          <Typography variant="h1" sx={{ fontSize: { xs: '2.7rem', md: '4.5rem' }, maxWidth: 720, lineHeight: 1.05, mt: 2 }}>
            Onde o esporte abre as portas da educação.
          </Typography>
          <Typography sx={{ mt: 2.5, maxWidth: 540, color: 'rgba(255,255,255,.82)', fontSize: 18, lineHeight: 1.7 }}>
            Educação e esporte no Alto da Mangueira: um espaço para aprender, desenvolver talentos e construir novas oportunidades.
          </Typography>
          <Button component={RouterLink} to="/inscricao" variant="contained" color="secondary" size="large" endIcon={<ArrowForwardRoundedIcon />} sx={{ mt: 4, color: '#26384a', '&:hover': { bgcolor: 'secondary.dark' } }}>
            Quero me inscrever
          </Button>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 3, mt: 5 }}>
          {[
            ['Treinos com propósito', 'Desenvolvimento esportivo acompanhado por professores.'],
            ['Aprendizado em equipe', 'Atividades, desafios e convivência dentro e fora da quadra.'],
            ['Sua evolução', 'Acompanhe presença, avaliações e cada conquista da jornada.']
          ].map(([title, description]) => (
            <Box key={title} sx={{ p: 2.5, border: '1px solid #e5ebe6', borderRadius: 3, bgcolor: 'white' }}>
              <Typography variant="h6" fontWeight={750}>{title}</Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>{description}</Typography>
            </Box>
          ))}
        </Box>
      </Container>
      <Box component="footer" className="site-footer">Projeto Aluno/Atleta · Alto da Mangueira · Maracanaú/CE</Box>
    </Box>
  );
}
