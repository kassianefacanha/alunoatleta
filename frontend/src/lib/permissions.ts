export type TeacherPermission =
  | 'students:read'
  | 'students:write'
  | 'attendance:write'
  | 'assignments:read'
  | 'assignments:write'
  | 'materials:write'
  | 'notifications:write'
  | 'events:write'
  | 'evaluations:write'
  | 'social:read'
  | 'social:write'
  | 'exports:read';

interface SessionUser {
  role?: string;
  teacherPermissions?: unknown;
}

export function hasPermission(permission: TeacherPermission): boolean {
  const user = JSON.parse(sessionStorage.getItem('user') ?? '{}') as SessionUser;
  if (user.role === 'admin' || user.role === 'student') return true;
  return user.role === 'teacher' &&
    Array.isArray(user.teacherPermissions) && user.teacherPermissions.includes(permission);
}
