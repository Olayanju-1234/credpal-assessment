import {
  Injectable,
  Logger,
  Inject,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import jwtConfig from '../../config/jwt.config';
import { UserService } from '../user/user.service';
import { OtpService } from '../otp/otp.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { LoginDto } from './dto/login.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { Currency } from '../../common/enums';
import { User } from '../user/entities/user.entity';
import { Wallet } from '../wallet/entities/wallet.entity';
import { Otp } from '../otp/entities/otp.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userService: UserService,
    private readonly otpService: OtpService,
    private readonly mailService: MailService,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConf: { secret: string; expiresIn: string },
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.userService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Atomic registration: user + wallet + OTP in a single transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const user = queryRunner.manager.create(User, {
        email: dto.email,
        password: passwordHash,
        first_name: dto.first_name,
        last_name: dto.last_name,
      });
      const savedUser = await queryRunner.manager.save(User, user);

      const wallet = queryRunner.manager.create(Wallet, {
        user_id: savedUser.id,
        currency: Currency.NGN,
        balance: '0.0000',
      });
      await queryRunner.manager.save(Wallet, wallet);

      const code = this.otpService.generateCode();
      const otp = queryRunner.manager.create(Otp, {
        user_id: savedUser.id,
        code,
        expires_at: new Date(Date.now() + 10 * 60 * 1000),
      });
      await queryRunner.manager.save(Otp, otp);

      await queryRunner.commitTransaction();

      // Send email AFTER commit — fire-and-forget, outside the transaction
      void this.mailService.sendOtp(dto.email, code);

      this.logger.log(`User registered: ${savedUser.id}`);

      return {
        user_id: savedUser.id,
        email: savedUser.email,
        message: 'Registration successful. Check email for verification code.',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.userService.findByEmail(dto.email);
    if (!user) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    if (user.email_verified_at) {
      throw new BadRequestException('Email already verified');
    }

    const valid = await this.otpService.verify(user.id, dto.code);
    if (!valid) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    await this.userService.markEmailVerified(user.id);

    this.logger.log(`Email verified for user: ${user.id}`);

    return { message: 'Email verified successfully.' };
  }

  async resendOtp(dto: ResendOtpDto) {
    const user = await this.userService.findByEmail(dto.email);
    if (!user) {
      return {
        message: 'If the email is registered, a new OTP has been sent.',
      };
    }

    if (user.email_verified_at) {
      return {
        message: 'If the email is registered, a new OTP has been sent.',
      };
    }

    const code = await this.otpService.generate(user.id);
    void this.mailService.sendOtp(dto.email, code);

    this.logger.log(`OTP resent for user: ${user.id}`);

    return { message: 'If the email is registered, a new OTP has been sent.' };
  }

  async login(dto: LoginDto) {
    const user = await this.userService.findByEmailWithPassword(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    this.logger.log(`User logged in: ${user.id}`);

    const expiresInSeconds = this.parseExpiresIn(this.jwtConf.expiresIn);

    return {
      access_token: accessToken,
      expires_in: expiresInSeconds,
    };
  }

  private parseExpiresIn(value: string): number {
    const match = value.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return 900;
    const num = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };
    return num * (multipliers[unit] || 60);
  }
}
