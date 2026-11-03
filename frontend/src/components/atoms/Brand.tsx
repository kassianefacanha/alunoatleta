import { Box, Typography } from '@mui/material';

export function Brand({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: compact ? 0.75 : 1, color: light ? 'white' : 'primary.dark', minWidth: 0 }}>
      <Box
        component="img"
        src="/brand/aluno-atleta-mark.jpg"
        alt=""
        aria-hidden="true"
        sx={{ width: compact ? { xs: 40, sm: 56 } : 56, height: compact ? { xs: 38, sm: 44 } : 44, flexShrink: 0, objectFit: 'contain', mixBlendMode: 'multiply' }}
      />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" sx={{ display: 'block', fontWeight: 800, letterSpacing: '.12em', lineHeight: 1.2, opacity: .76, ...(compact ? { display: { xs: 'none', sm: 'block' } } : {}) }}>
          PROJETO
        </Typography>
        <Typography fontWeight={850} lineHeight={1.1} sx={{ whiteSpace: 'nowrap', fontSize: compact ? { xs: 15, sm: 'inherit' } : undefined }}>Aluno Atleta</Typography>
        <Typography variant="caption" sx={{ opacity: .76, ...(compact ? { display: { xs: 'none', sm: 'block' } } : {}) }}>Educação e esporte</Typography>
      </Box>
    </Box>
  );
}
