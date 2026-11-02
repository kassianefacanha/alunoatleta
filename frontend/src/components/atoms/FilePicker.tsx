import { useRef } from 'react';
import { Box, Button, FormHelperText, Typography } from '@mui/material';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';

interface FilePickerProps {
  label: string;
  accept: string;
  value?: File;
  error?: string;
  onChange: (file?: File) => void;
}

export function FilePicker({ label, accept, value, error, onChange }: FilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Box>
      <Box sx={{ border: '1px dashed', borderColor: error ? 'error.main' : '#cdd8d0', borderRadius: 2.5, p: 2, minHeight: 114, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, bgcolor: '#fbfcfb' }}>
        <Box>
          <Typography variant="body2" fontWeight={700}>{label}</Typography>
          <Typography variant="caption" color="text.secondary">{value ? value.name : 'Selecione um arquivo no seu dispositivo'}</Typography>
        </Box>
        <input ref={inputRef} hidden type="file" accept={accept} onChange={(event) => onChange(event.target.files?.[0])} />
        <Button size="small" variant="outlined" startIcon={<CloudUploadOutlinedIcon />} onClick={() => inputRef.current?.click()} aria-label={label}>Anexar</Button>
      </Box>
      {error && <FormHelperText error>{error}</FormHelperText>}
    </Box>
  );
}
