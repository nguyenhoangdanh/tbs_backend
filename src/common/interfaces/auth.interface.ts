
export interface JwtPayload {
  sub: number;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface UserFromToken {
  id: number;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  officeId: number;
  departmentId: number;
  positionId: number;
}
