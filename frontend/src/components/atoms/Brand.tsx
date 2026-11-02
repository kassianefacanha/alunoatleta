import { Box, Typography } from '@mui/material';

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: light ? 'white' : 'primary.dark' }}>
      <Box
        component="img"
        src="/brand/aluno-atleta-mark.jpg"
        alt=""
        aria-hidden="true"
        sx={{ width: 56, height: 44, objectFit: 'contain', mixBlendMode: 'multiply' }}
      />
      <Box>
        <Typography variant="caption" sx={{ display: 'block', fontWeight: 800, letterSpacing: '.12em', lineHeight: 1.2, opacity: .76 }}>
          PROJETO
        </Typography>
        <Typography fontWeight={850} lineHeight={1.1}>Aluno Atleta</Typography>
        <Typography variant="caption" sx={{ opacity: .76 }}>Educação e esporte</Typography>
      </Box>
    </Box>
  );
}
