interface EnrollmentDates {
  startDate: Date;
  expiresAt: Date | null;
}

/**
 * Moves an enrollment onto a new group schedule without changing its duration.
 * A perpetual enrollment stays perpetual; if the target group has no start date,
 * the existing dates are left untouched.
 */
export function moveEnrollmentToGroupStart(
  enrollment: EnrollmentDates,
  groupStartDate: Date | null
): EnrollmentDates {
  if (!groupStartDate) return enrollment;

  const durationMs = enrollment.expiresAt
    ? enrollment.expiresAt.getTime() - enrollment.startDate.getTime()
    : null;

  return {
    startDate: groupStartDate,
    expiresAt: durationMs === null ? null : new Date(groupStartDate.getTime() + durationMs),
  };
}
