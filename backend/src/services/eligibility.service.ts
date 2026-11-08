export interface ClassEligibility {
  requirements?: string[];
  requiresNeighborhoodSchool?: boolean;
  minimumAge?: number | null;
  maximumAge?: number | null;
  otherEligibilityRequirements?: string[];
}

export function getClassEligibilityRequirements(sportsClass: ClassEligibility) {
  return [
    ...(sportsClass.requiresNeighborhoodSchool ? ["Estar matriculado em uma escola do Alto da Mangueira."] : []),
    ...(sportsClass.minimumAge != null ? [`Ter idade mínima de ${sportsClass.minimumAge} anos.`] : []),
    ...(sportsClass.maximumAge != null ? [`Ter idade máxima de ${sportsClass.maximumAge} anos.`] : []),
    ...(sportsClass.otherEligibilityRequirements ?? []),
    ...(sportsClass.requirements ?? []),
  ].map((requirement) => requirement.trim()).filter((requirement, index, all) =>
    requirement.length > 0 && all.indexOf(requirement) === index,
  );
}
