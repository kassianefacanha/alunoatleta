import { Box, Paper, Typography } from '@mui/material';
import { RegistrationForm } from '../components/organisms/RegistrationForm';
import { PublicLayout } from '../components/templates/PublicLayout';

export function RegistrationPage() {
  return (
    <PublicLayout>
      <Box className="registration-layout">
        <Box className="registration-header">
          <Typography variant="overline" color="primary" fontWeight={800} letterSpacing={2}>FAÇA PARTE DO TIME</Typography>
          <Typography variant="h3" sx={{ mt: 1, mb: 1 }}>Termo de inscrição</Typography>
          <Typography color="text.secondary">Baixe o documento, peça a assinatura do responsável e anexe abaixo em PDF.</Typography>
        </Box>
        <Paper variant="outlined" className="registration-card">
          <RegistrationForm />
        </Paper>
      </Box>
    </PublicLayout>
  );
}
