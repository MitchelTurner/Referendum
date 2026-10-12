export const STAFF_ROLES = [
  'ADMIN',
  'CLERK',
  'DEPUTY_CLERK',
  'STAFF',
  'REVIEWER',
  'MEMBER',
  'CHAIR',
  'VIEWER',
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export const ACTIONS = [
  'government.configure',
  'item.edit',
  'review.decide',
  'item.publish',
  'live.run',
  'vote.record',
  'motion.accept',
  'comment.hide',
  'staffquestion.ask',
  'record.read',
  'data.export',
  // SPEC-GAP: §5 has no records-request row. Clerks and deputies run intake; viewers do not see requester contact details.
  'records.manage',
] as const;

export type Action = (typeof ACTIONS)[number];

/**
 * Permission table from spec §5.
 * `data.export` is SPEC-GAP: the sales promise limits full export to admins.
 */
export function can(input: {
  role: StaffRole;
  action: Action;
  ownsResource?: boolean;
  assigned?: boolean;
}): boolean {
  const { role, action, ownsResource = false, assigned = false } = input;
  switch (action) {
    case 'government.configure':
      return role === 'ADMIN' || role === 'CLERK';
    case 'item.edit':
      return (
        role === 'ADMIN' ||
        role === 'CLERK' ||
        role === 'DEPUTY_CLERK' ||
        (role === 'STAFF' && ownsResource)
      );
    case 'review.decide':
      return role === 'REVIEWER' && assigned;
    case 'item.publish':
      return role === 'ADMIN' || role === 'CLERK' || role === 'DEPUTY_CLERK';
    case 'live.run':
    case 'vote.record':
      return role === 'ADMIN' || role === 'CLERK' || role === 'DEPUTY_CLERK' || role === 'CHAIR';
    case 'motion.accept':
      return role === 'ADMIN' || role === 'CLERK' || role === 'DEPUTY_CLERK';
    case 'comment.hide':
      return role === 'ADMIN' || role === 'CLERK';
    case 'staffquestion.ask':
      return role === 'CHAIR' || role === 'MEMBER';
    case 'record.read':
      return true;
    case 'data.export':
      return role === 'ADMIN';
    case 'records.manage':
      return role === 'ADMIN' || role === 'CLERK' || role === 'DEPUTY_CLERK';
    default:
      return false;
  }
}
