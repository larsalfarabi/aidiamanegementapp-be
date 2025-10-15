export interface jwtPayload {
  id: number;
  firstname?: string;
  lastname?: string;
  email: string;
  isEmailVerified?: boolean;
  roleId?: number;
  isActive?: boolean;
  lastLoginAt?: Date;
}
