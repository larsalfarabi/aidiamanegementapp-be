import * as dotenv from 'dotenv';
dotenv.config();
export const jwtConfig = {
  secret: process.env.JWT_SECRET,
  access_token_secret: process.env.JWT_ACCESS_SECRET!,
  refresh_token_secret: process.env.JWT_REFRESH_SECRET!,
  expired: process.env.JWT_EXPIRES_IN || '1d',
};
