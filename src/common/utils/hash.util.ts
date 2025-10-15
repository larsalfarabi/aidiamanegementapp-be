import * as dotenv from 'dotenv';
dotenv.config();
import { hash, compare } from 'bcryptjs';
import * as crypto from 'crypto';
import { Injectable } from '@nestjs/common';

@Injectable()
export class HashUtil {
  private readonly defaultSaltRounds: number = 12;
  private readonly defaultAlgorithm: string = 'sha256';

  async hashPassword(
    password: string,
    saltRounds = this.defaultSaltRounds,
  ): Promise<string> {
    try {
      return await hash(password, saltRounds);
    } catch (error) {
      throw new Error(`Failed to hash password: ${error.message}`);
    }
  }

  async verifyPassword(
    password: string,
    hashedPassword: string,
  ): Promise<boolean> {
    try {
      return await compare(password, hashedPassword);
    } catch (error) {
      throw new Error(`Failed to verify password: ${error.message}`);
    }
  }

  createHmac(
    data: string,
    secret: string,
    algorithm = this.defaultAlgorithm,
  ): string {
    return crypto.createHmac(algorithm, secret).update(data).digest('hex');
  }

  hashSensitiveData(data: string): string {
    const secret = process.env.HASH_SECRET!;
    return this.createHmac(data, secret);
  }
}
