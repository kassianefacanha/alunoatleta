import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { DashboardLayout } from '../components/templates/DashboardLayout';
import { apiRequest } from '../lib/api';

interface StudentProfile {
  fullName: string;
  age: number;
  birthDate: string;
  sex: string;
  modality: string;
  school: string;
  address: { neighborhood: string; city: string; street: string; number: string; complement?: string };
  guardian: { name: string; phone: string };
}

interface ProfileResponse { user: { email: string }; student: StudentProfile & { enrollmentStatus: string } }

function toBrazilianDate(value: string) {
  const date = new Date(value);
  return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
}

function toIsoDate(value: string) {
  const [day, month, year] = value.split('/');
  return `${year}-${month}-${day}`;
}

export function ResubmissionPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileResponse>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiRequest<ProfileResponse>('/auth/me').then(setProfile).catch((reason: unknown) =>
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar sua inscrição.')
    );
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    setError('');
    setLoading(true);
    const data = new FormData(event.currentTarget);
    try {
      const file = data.get('signedForm');
      let signedFormPdfKey: string | undefined;
      if (file instanceof File && file.size > 0) {
        if (file.type !== 'application/pdf' || file.size > 10 * 1024 * 1024) throw new Error('A ficha deve ser PDF e ter no máximo 10 MB.');
        const presign = await apiRequest<{ uploadUrl: string; key: string }>('/uploads/presign', {
          method: 'POST',
          body: JSON.stringify({ fileName: file.name, contentType: file.type, fileSize: file.size, uploadType: 'signedFormPdf' })
        });
        const uploadResponse = await fetch(presign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
        if (!uploadResponse.ok) throw new Error('Não foi possível enviar a ficha assinada.');
        signedFormPdfKey = presign.key;
      }
      await apiRequest('/auth/resubmit', {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: data.get('fullName'),
          age: Number(data.get('age')),
          birthDate: toIsoDate(String(data.get('birthDate'))),
          sex: data.get('sex'),
          modality: data.get('modality'),
          school: data.get('school'),
          address: {
            neighborhood: data.get('neighborhood'),
            city: data.get('city'),
            street: data.get('street'),
            number: data.get('number'),
            complement: data.get('complement') || undefined
          },
          guardian: { name: data.get('guardianName'), phone: data.get('guardianPhone') },
          signedFormPdfKey,
          termsAccepted: data.get('termsAccepted') === 'true'
        })
      });
      sessionStorage.setItem('enrollment', JSON.stringify({ status: 'pending' }));
      navigate('/status');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível reenviar sua inscrição.');
    } finally {
      setLoading(false);
    }
  }

  const user = JSON.parse(sessionStorage.getItem('user') ?? '{"email":"Aluno"}') as { email: string };
  if (!profile) {
    return <DashboardLayout name={user.email} onLogout={() => { sessionStorage.clear(); navigate('/login'); }}><Typography>{error || 'Carregando inscrição...'}</Typography></DashboardLayout>;
  }
  const student = profile.student;
  return (
    <DashboardLayout name={profile.user.email} onLogout={() => { sessionStorage.clear(); navigate('/login'); }}>
      <Box sx={{ maxWidth: 760, mx: 'auto' }}>
        <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 } }}>
          <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>Revise os dados indicados pelo professor e reenvie para análise. A foto do aluno não pode ser alterada.</Typography>
          <Box component="form" onSubmit={submit} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField name="fullName" label="Nome completo do aluno" defaultValue={student.fullName} required sx={{ gridColumn: '1 / -1' }} />
            <TextField name="age" label="Idade" type="number" defaultValue={student.age} required />
            <TextField name="birthDate" label="Data de nascimento (dd/mm/aaaa)" defaultValue={toBrazilianDate(student.birthDate)} required />
            <TextField name="sex" label="Sexo" select defaultValue={student.sex} required>
              {['Feminino', 'Masculino', 'Outro', 'Prefiro não informar'].map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
            </TextField>
            <TextField name="modality" label="Modalidade" defaultValue={student.modality} required />
            <TextField name="school" label="Escola" defaultValue={student.school} required sx={{ gridColumn: '1 / -1' }} />
            <TextField name="neighborhood" label="Bairro" defaultValue={student.address.neighborhood} required />
            <TextField name="city" label="Cidade" defaultValue={student.address.city} required />
            <TextField name="street" label="Rua / Endereço" defaultValue={student.address.street} required />
            <TextField name="number" label="Número" defaultValue={student.address.number} required />
            <TextField name="complement" label="Complemento (opcional)" defaultValue={student.address.complement} />
            <TextField name="guardianName" label="Nome do responsável" defaultValue={student.guardian.name} required />
            <TextField
              name="guardianPhone"
              label="Telefone do responsável"
              defaultValue={student.guardian.phone}
              inputProps={{ inputMode: 'tel', maxLength: 15 }}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, '').slice(0, 11);
                event.target.value = digits.length > 7 ? `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}` :
                  digits.length > 2 ? `(${digits.slice(0, 2)}) ${digits.slice(2)}` : digits;
              }}
              required
            />
            <Stack sx={{ gridColumn: '1 / -1' }} spacing={1}>
              <Typography variant="body2" fontWeight={700}>Nova ficha assinada (opcional, PDF até 10 MB)</Typography>
              <input name="signedForm" type="file" accept="application/pdf,.pdf" />
            </Stack>
            <FormControlLabel sx={{ gridColumn: '1 / -1' }} control={<Checkbox name="termsAccepted" value="true" required />} label="Confirmo que revisei os dados e aceito os Termos de Inscrição e a Política de Privacidade." />
            {error && <Alert severity="error" sx={{ gridColumn: '1 / -1' }}>{error}</Alert>}
            <Button type="submit" variant="contained" size="large" disabled={loading} sx={{ gridColumn: '1 / -1', justifySelf: 'start' }}>
              {loading ? 'Enviando...' : 'Reenviar inscrição'}
            </Button>
          </Box>
        </Paper>
      </Box>
    </DashboardLayout>
  );
}
