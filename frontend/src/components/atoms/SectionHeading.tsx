import { Box, Typography } from '@mui/material';

export function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography variant="h6" fontWeight={750}>{title}</Typography>
      {description && <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{description}</Typography>}
    </Box>
  );
}
