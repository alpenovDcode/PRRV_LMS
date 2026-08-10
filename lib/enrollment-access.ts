export interface EnrollmentAccessLists {
  restrictedModules: string[];
  restrictedLessons: string[];
  forcedModules: string[];
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function normalizeEnrollmentAccess(
  access: EnrollmentAccessLists
): EnrollmentAccessLists {
  const restrictedModules = unique(access.restrictedModules);
  const restrictedModuleIds = new Set(restrictedModules);

  return {
    restrictedModules,
    restrictedLessons: unique(access.restrictedLessons),
    forcedModules: unique(access.forcedModules).filter(
      (moduleId) => !restrictedModuleIds.has(moduleId)
    ),
  };
}
