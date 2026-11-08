import {
  DirectionsRunRounded,
  FitnessCenterRounded,
  PoolRounded,
  SportsBasketballRounded,
  SportsHandballRounded,
  SportsSoccerRounded,
  SportsTennisRounded,
  SportsVolleyballRounded,
} from "@mui/icons-material";
import type { SxProps, Theme } from "@mui/material";

export const modalityIconOptions = [
  { key: "soccer", label: "Futebol", Icon: SportsSoccerRounded, color: "#2867C1" },
  { key: "basketball", label: "Basquete", Icon: SportsBasketballRounded, color: "#D77924" },
  { key: "volleyball", label: "Vôlei", Icon: SportsVolleyballRounded, color: "#C49A1A" },
  { key: "handball", label: "Handebol", Icon: SportsHandballRounded, color: "#329365" },
  { key: "tennis", label: "Tênis", Icon: SportsTennisRounded, color: "#57904B" },
  { key: "running", label: "Corrida", Icon: DirectionsRunRounded, color: "#7657B5" },
  { key: "fitness", label: "Condicionamento", Icon: FitnessCenterRounded, color: "#C34D62" },
  { key: "swimming", label: "Natação", Icon: PoolRounded, color: "#268A9B" },
] as const;

export const modalityColorOptions = [
  { value: "#DBEAFE", label: "Azul suave", foreground: "#1E3A8A" },
  { value: "#D1FAE5", label: "Verde suave", foreground: "#065F46" },
  { value: "#EDE9FE", label: "Lilás suave", foreground: "#5B21B6" },
  { value: "#FFE4E6", label: "Rosa suave", foreground: "#9F1239" },
  { value: "#FFEDD5", label: "Pêssego suave", foreground: "#9A3412" },
  { value: "#FEF3C7", label: "Amarelo suave", foreground: "#854D0E" },
  { value: "#CFFAFE", label: "Turquesa suave", foreground: "#155E75" },
  { value: "#E2E8F0", label: "Cinza suave", foreground: "#334155" },
] as const;

export function modalityColor(value: string) {
  return modalityColorOptions.find((option) => option.value === value) ?? modalityColorOptions[0];
}

export type ModalityIconKey = typeof modalityIconOptions[number]["key"];

export function ModalityIcon({
  name,
  className,
  sx,
}: {
  name: string;
  className?: string;
  sx?: SxProps<Theme>;
}) {
  const Icon = modalityIconOptions.find(({ key }) => key === name)?.Icon ?? SportsSoccerRounded;
  return <Icon className={className} sx={sx} aria-hidden="true" />;
}
