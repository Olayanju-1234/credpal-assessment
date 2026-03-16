import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { randomInt } from 'crypto';
import { Otp } from './entities/otp.entity';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @InjectRepository(Otp)
    private readonly otpRepo: Repository<Otp>,
  ) {}

  generateCode(): string {
    return randomInt(100000, 999999).toString();
  }

  async generate(userId: string): Promise<string> {
    // Invalidate any existing unused OTPs for this user
    await this.otpRepo.update({ user_id: userId, used: false }, { used: true });

    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const otp = this.otpRepo.create({
      user_id: userId,
      code,
      expires_at: expiresAt,
    });

    await this.otpRepo.save(otp);
    this.logger.log(`OTP generated for user ${userId}`);
    return code;
  }

  async verify(userId: string, code: string): Promise<boolean> {
    const otp = await this.otpRepo.findOne({
      where: {
        user_id: userId,
        code,
        used: false,
        expires_at: MoreThan(new Date()),
      },
    });

    if (!otp) {
      return false;
    }

    await this.otpRepo.update(otp.id, { used: true });
    return true;
  }
}
