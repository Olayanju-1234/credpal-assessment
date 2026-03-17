import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { OtpService } from '../otp/otp.service';
import { MailService } from '../mail/mail.service';
import { Role } from '../../common/enums';
import jwtConfig from '../../config/jwt.config';

jest.mock('bcrypt');
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('AuthService', () => {
  let service: AuthService;

  const mockUserService = {
    findByEmail: jest.fn(),
    findByEmailWithPassword: jest.fn(),
    markEmailVerified: jest.fn(),
  };

  const mockOtpService = {
    generate: jest.fn(),
    generateCode: jest.fn(),
    verify: jest.fn(),
  };

  const mockMailService = {
    sendOtp: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  // QueryRunner mock for atomic registration
  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      create: jest.fn(),
      save: jest.fn(),
    },
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
  };

  const mockJwtConf = {
    secret: 'test-secret',
    expiresIn: '15m',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: mockUserService },
        { provide: OtpService, useValue: mockOtpService },
        { provide: MailService, useValue: mockMailService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: jwtConfig.KEY, useValue: mockJwtConf },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    const registerDto = {
      email: 'john@example.com',
      password: 'SecureP@ss1',
      first_name: 'John',
      last_name: 'Doe',
    };

    it('should atomically create user, wallet, and OTP then send email', async () => {
      mockUserService.findByEmail.mockResolvedValue(null);
      (mockedBcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      mockOtpService.generateCode.mockReturnValue('482910');

      const savedUser = { id: 'user-1', email: 'john@example.com' };
      mockQueryRunner.manager.create.mockReturnValue({});
      mockQueryRunner.manager.save
        .mockResolvedValueOnce(savedUser) // user
        .mockResolvedValueOnce({}) // wallet
        .mockResolvedValueOnce({}); // otp

      const result = await service.register(registerDto);

      expect(result.user_id).toBe('user-1');
      expect(result.email).toBe('john@example.com');
      expect(result.message).toContain('Registration successful');

      // Verify atomic transaction
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();

      // Verify email sent AFTER commit
      expect(mockMailService.sendOtp).toHaveBeenCalledWith(
        'john@example.com',
        '482910',
      );
    });

    it('should hash password with salt rounds of 12', async () => {
      mockUserService.findByEmail.mockResolvedValue(null);
      (mockedBcrypt.hash as jest.Mock).mockResolvedValue('hashed');
      mockOtpService.generateCode.mockReturnValue('123456');
      mockQueryRunner.manager.create.mockReturnValue({});
      mockQueryRunner.manager.save.mockResolvedValue({
        id: 'user-2',
        email: 'john@example.com',
      });

      await service.register(registerDto);

      expect(mockedBcrypt.hash).toHaveBeenCalledWith('SecureP@ss1', 12);
    });

    it('should throw ConflictException for duplicate email', async () => {
      mockUserService.findByEmail.mockResolvedValue({
        id: 'existing-user',
        email: 'john@example.com',
      });

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.register(registerDto)).rejects.toThrow(
        'Email already registered',
      );

      // Should not start a transaction
      expect(mockQueryRunner.startTransaction).not.toHaveBeenCalled();
    });

    it('should rollback transaction on error', async () => {
      mockUserService.findByEmail.mockResolvedValue(null);
      (mockedBcrypt.hash as jest.Mock).mockResolvedValue('hashed');
      mockQueryRunner.manager.create.mockReturnValue({});
      mockQueryRunner.manager.save.mockRejectedValue(new Error('DB error'));

      await expect(service.register(registerDto)).rejects.toThrow('DB error');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  describe('verifyOtp', () => {
    const verifyDto = { email: 'john@example.com', code: '482910' };

    it('should mark email as verified for valid OTP', async () => {
      mockUserService.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'john@example.com',
        email_verified_at: null,
      });
      mockOtpService.verify.mockResolvedValue(true);
      mockUserService.markEmailVerified.mockResolvedValue(undefined);

      const result = await service.verifyOtp(verifyDto);

      expect(result.message).toBe('Email verified successfully.');
      expect(mockOtpService.verify).toHaveBeenCalledWith('user-1', '482910');
      expect(mockUserService.markEmailVerified).toHaveBeenCalledWith('user-1');
    });

    it('should throw BadRequestException for invalid OTP', async () => {
      mockUserService.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'john@example.com',
        email_verified_at: null,
      });
      mockOtpService.verify.mockResolvedValue(false);

      await expect(service.verifyOtp(verifyDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.verifyOtp(verifyDto)).rejects.toThrow(
        'Invalid or expired OTP',
      );

      expect(mockUserService.markEmailVerified).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for non-existent email', async () => {
      mockUserService.findByEmail.mockResolvedValue(null);

      await expect(
        service.verifyOtp({ email: 'nobody@example.com', code: '123456' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.verifyOtp({ email: 'nobody@example.com', code: '123456' }),
      ).rejects.toThrow('Invalid or expired OTP');
    });

    it('should throw BadRequestException if email already verified', async () => {
      mockUserService.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'john@example.com',
        email_verified_at: new Date('2026-03-15T00:00:00Z'),
      });

      await expect(service.verifyOtp(verifyDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.verifyOtp(verifyDto)).rejects.toThrow(
        'Email already verified',
      );

      expect(mockOtpService.verify).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const loginDto = { email: 'john@example.com', password: 'SecureP@ss1' };

    it('should return access_token for valid credentials', async () => {
      mockUserService.findByEmailWithPassword.mockResolvedValue({
        id: 'user-1',
        email: 'john@example.com',
        password: 'hashed-password',
        role: Role.USER,
      });
      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign.mockReturnValue('jwt-token-abc');

      const result = await service.login(loginDto);

      expect(result.access_token).toBe('jwt-token-abc');
      expect(result.expires_in).toBe(900);

      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: 'user-1',
        role: Role.USER,
      });
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      mockUserService.findByEmailWithPassword.mockResolvedValue({
        id: 'user-1',
        email: 'john@example.com',
        password: 'hashed-password',
        role: Role.USER,
      });
      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginDto)).rejects.toThrow(
        'Invalid credentials',
      );

      expect(mockJwtService.sign).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      mockUserService.findByEmailWithPassword.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'anything' }),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.login({ email: 'nobody@example.com', password: 'anything' }),
      ).rejects.toThrow('Invalid credentials');

      expect(mockedBcrypt.compare).not.toHaveBeenCalled();
    });

    it('should call bcrypt.compare with correct args', async () => {
      mockUserService.findByEmailWithPassword.mockResolvedValue({
        id: 'user-1',
        email: 'john@example.com',
        password: '$2b$12$hashedvalue',
        role: Role.USER,
      });
      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign.mockReturnValue('token');

      await service.login(loginDto);

      expect(mockedBcrypt.compare).toHaveBeenCalledWith(
        'SecureP@ss1',
        '$2b$12$hashedvalue',
      );
    });
  });
});
