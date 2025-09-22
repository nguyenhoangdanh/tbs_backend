import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: number;
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}

export interface UserFromToken {
  id: number;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  officeId: number;
  departmentId: number;
  positionId: number;
}
