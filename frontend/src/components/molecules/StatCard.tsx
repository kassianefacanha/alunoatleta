import { Paper, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export function StatCard({ label, value, detail }: { label: string; value: ReactNode; detail: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, height: '100%', borderColor: '#e5ebe6' }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="h4" fontWeight={800} sx={{ my: 1 }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{detail}</Typography>
    </Paper>
  );
}
