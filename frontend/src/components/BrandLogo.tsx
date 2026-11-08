interface BrandLogoProps {
  className?: string;
}

/** Render the brand artwork as a transparent PNG shared with the browser tab icon. */
export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <img
      className={className ?? ""}
      src="/logo-aluno-atleta.png"
      alt="Projeto Aluno / Atleta — Educação e Esporte no Alto da Mangueira"
      width="768"
      height="768"
    />
  );
}
