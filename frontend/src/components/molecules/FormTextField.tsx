import { TextField, type TextFieldProps } from '@mui/material';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';

type Props<T extends FieldValues> = Omit<TextFieldProps, 'name' | 'defaultValue'> & {
  control: Control<T>;
  name: FieldPath<T>;
};

export function FormTextField<T extends FieldValues>({ control, name, ...props }: Props<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          {...field}
          {...props}
          value={field.value ?? ''}
          error={Boolean(fieldState.error)}
          helperText={fieldState.error?.message ?? props.helperText}
        />
      )}
    />
  );
}
