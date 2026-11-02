import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import { Controller, useForm, useFormState } from 'react-hook-form';
import { apiRequest, apiBaseUrl, uploadRegistrationFile } from '../../lib/api';
import { registrationSchema, type RegistrationFormValues } from '../../lib/registrationSchema';
import { FilePicker } from '../atoms/FilePicker';
import { SectionHeading } from '../atoms/SectionHeading';
import { FormTextField } from '../molecules/FormTextField';

const defaultValues = {
  neighborhood: 'Alto da Mangueira',
  city: 'Maracanaú',
  modality: 'Futsal'
};

export function RegistrationForm() {
  const [requestError, setRequestError] = useState('');
  const [success, setSuccess] = useState(false);
  const { control, handleSubmit, setValue, watch, formState: { isSubmitting } } = useForm<RegistrationFormValues>({
    resolver: zodResolver(registrationSchema),
    defaultValues,
    mode: 'onBlur'
  });
  const { errors } = useFormState({ control });
  const studentPhoto = watch('studentPhoto');
  const signedForm = watch('signedForm');

  const submit = handleSubmit(async (values) => {
    setRequestError('');
    try {
      const photoUpload = await uploadRegistrationFile(values.studentPhoto, 'studentPhoto');
      const formUpload = await uploadRegistrationFile(values.signedForm, 'signedFormPdf', photoUpload.registrationId);
      const [day, month, year] = values.birthDate.split('/');
      await apiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: values.email,
          password: values.password,
          fullName: values.fullName,
          age: values.age,
          birthDate: `${year}-${month}-${day}`,
          sex: values.sex,
          modality: values.modality,
          school: values.school,
          address: {
            neighborhood: values.neighborhood,
            city: values.city,
            street: values.street,
            number: values.number,
            complement: values.complement || undefined
          },
          guardian: { name: values.guardianName, phone: values.guardianPhone },
          studentPhotoKey: photoUpload.key,
          signedFormPdfKey: formUpload.key,
          termsAccepted: true
        })
      });
      setSuccess(true);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Não foi possível enviar sua inscrição.');
    }
  });

  if (success) {
    return <Alert severity="success" sx={{ my: 4, p: 2 }}>Inscrição enviada! Você já pode fazer login para acompanhar a análise.</Alert>;
  }

  return (
    <Box component="form" onSubmit={submit} noValidate>
      <Box className="form-section" sx={{ borderTop: 0, pt: 0 }}>
        <SectionHeading title="Dados de acesso" description="Esses dados serão usados para entrar na plataforma." />
        <Box className="form-grid">
          <FormTextField control={control} name="email" label="E-mail (login)" type="email" autoComplete="email" required />
          <FormTextField control={control} name="password" label="Senha" type="password" autoComplete="new-password" helperText="Mínimo de 8 caracteres." required />
        </Box>
      </Box>

      <Box className="form-section">
        <SectionHeading title="Dados pessoais do aluno" />
        <Box className="form-grid">
          <FormTextField control={control} name="fullName" label="Nome completo do aluno" className="span-two" required />
          <FormTextField control={control} name="age" label="Idade" type="number" inputProps={{ min: 0, max: 120 }} required />
          <FormTextField control={control} name="birthDate" label="Data de nascimento" placeholder="dd/mm/aaaa" inputProps={{ inputMode: 'numeric' }} required />
          <FormTextField control={control} name="sex" label="Sexo" select required>
            {['Feminino', 'Masculino', 'Outro', 'Prefiro não informar'].map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
          </FormTextField>
          <FormTextField control={control} name="modality" label="Modalidade de interesse" select required>
            <MenuItem value="Futsal">Futsal</MenuItem>
          </FormTextField>
          <FormTextField control={control} name="school" label="Escola onde está matriculado" className="span-two" required />
        </Box>
      </Box>

      <Box className="form-section">
        <SectionHeading title="Endereço" />
        <Box className="form-grid">
          <FormTextField control={control} name="neighborhood" label="Bairro" required />
          <FormTextField control={control} name="city" label="Cidade" required />
          <FormTextField control={control} name="street" label="Rua / Endereço" required />
          <FormTextField control={control} name="number" label="Número" required />
          <FormTextField control={control} name="complement" label="Complemento (opcional)" className="span-two" />
        </Box>
      </Box>

      <Box className="form-section">
        <SectionHeading title="Responsável" description="Precisamos de um contato responsável pelo aluno." />
        <Box className="form-grid">
          <FormTextField control={control} name="guardianName" label="Nome do responsável" required />
          <Controller control={control} name="guardianPhone" render={({ field, fieldState }) => (
            <TextField
              {...field}
              label="Telefone do responsável"
              placeholder="(85) 99999-9999"
              inputProps={{ inputMode: 'tel', maxLength: 15 }}
              error={Boolean(fieldState.error)}
              helperText={fieldState.error?.message}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, '').slice(0, 11);
                const formatted = digits.length > 7 ? `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}` :
                  digits.length > 2 ? `(${digits.slice(0, 2)}) ${digits.slice(2)}` : digits;
                field.onChange(formatted);
              }}
            />
          )} />
        </Box>
      </Box>

      <Box className="form-section">
        <SectionHeading title="Documentos e arquivos" description="Envie uma foto de rosto e a ficha assinada pelo responsável." />
        <Stack spacing={2}>
          <FilePicker label="Foto do aluno (JPG ou PNG · até 5 MB) *" accept="image/jpeg,image/png" value={studentPhoto} error={errors.studentPhoto?.message} onChange={(file) => { if (file) setValue('studentPhoto', file, { shouldValidate: true }); }} />
          <FilePicker label="Ficha de inscrição assinada (PDF) *" accept="application/pdf,.pdf" value={signedForm} error={errors.signedForm?.message} onChange={(file) => { if (file) setValue('signedForm', file, { shouldValidate: true }); }} />
        </Stack>
      </Box>

      <Box sx={{ pt: 2 }}>
        <Controller control={control} name="acceptedTerms" render={({ field, fieldState }) => (
          <Box>
            <FormControlLabel control={<Checkbox checked={field.value === true} onChange={(_, checked) => field.onChange(checked)} />} label={<Typography variant="body2">Li e aceito os <a href="/termos-de-inscricao" target="_blank" rel="noreferrer">Termos de Inscrição</a> e a <a href="/politica-de-privacidade" target="_blank" rel="noreferrer">Política de Privacidade</a>.</Typography>} />
            {fieldState.error && <Typography color="error" variant="caption">{fieldState.error.message}</Typography>}
          </Box>
        )} />
        {requestError && <Alert severity="error" sx={{ mt: 2 }}>{requestError}</Alert>}
        <Button component="a" href={`${apiBaseUrl}/documents/enrollment-form.pdf`} target="_blank" rel="noreferrer" variant="outlined" startIcon={<DownloadOutlinedIcon />} sx={{ mt: 2, mr: 1 }}>
          Baixar ficha de inscrição (PDF)
        </Button>
        <Button type="submit" variant="contained" size="large" disabled={isSubmitting} sx={{ mt: 2, minWidth: 190 }}>
          {isSubmitting ? <><CircularProgress size={18} color="inherit" sx={{ mr: 1 }} /> Enviando...</> : 'Enviar inscrição'}
        </Button>
      </Box>
    </Box>
  );
}
