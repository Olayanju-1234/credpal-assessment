import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { OtpService } from '../otp/otp.service';
import { MailService } from '../mail/mail.service';
import { WalletService } from '../wallet/wallet.service';
import { Currency, Role } from '../../common/enums';

jest.mock('bcrypt');
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('AuthService', () => {
  let service: AuthService;

  const mockUserService = {
    findByEmail: jest.fn(),
    findByEmailWithPassword: jest.fn(),
    create: jest.fn(),
    markEmailVerified: jest.fn(),
  };

  const mockOtpService = {
    generate: jest.fn(),
    verify: jest.fn(),
  };

  const mockMailService = {
    sendOtp: jest.fn(),
  };

  const mockWalletService = {
    createWallet: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: mockUserService },
        { provide: OtpService, useValue: mockOtpService },
        { provide: MailService, useValue: mockMailService },
        { provide: WalletService, useValue: mockWalletService },
        { provide: JwtService, useValue: mockJwtService },
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

    it('should create user, generate OTP, create wallet, and return user_id', async () => {
      mockUserService.findByEmail.mockResolvedValue(null);
      (mockedBcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      mockUserService.create.mockResolvedValue({
        id: 'user-1',
        email: 'john@example.com',
        first_name: 'John',
        last_name: 'Doe',
        role: Role.USER,
      });
      mockWalletService.createWallet.mockResolvedValue({
        id: 'wallet-1',
        currency: Currency.NGN,
      });
      mockOtpService.generate.mockResolvedValue('482910');
      mockMailService.sendOtp.mockResolvedValue(undefined);

      const result = await service.register(registerDto);

      expect(result.user_id).toBe('user-1');
      expect(result.email).toBe('john@example.com');
      expect(result.message).toContain('Registration successful');

      // Verify user creation with hashed password
      expect(mockUserService.create).toHaveBeenCalledWith({
        email: 'john@example.com',
        password: 'hashed-password',
        first_name: 'John',
        last_name: 'Doe',
      });

      // Verify default NGN wallet creation
      expect(mockWalletService.createWallet).toHaveBeenCalledWith(
        'user-1',
        Currency.NGN,
      );

      // Verify OTP generation and email
      expect(mockOtpService.generate).toHaveBeenCalledWith('user-1');
      expect(mockMailService.sendOtp).toHaveBeenCalledWith(
        'john@example.com',
        '482910',
      );
    });

    it('should hash password with salt rounds of 12', async () => {
      mockUserService.findByEmail.mockResolvedValue(null);
      (mockedBcrypt.hash as jest.Mock).mockResolvedValue('hashed');
      mockUserService.create.mockResolvedValue({
        id: 'user-2',
        email: 'test@example.com',
      });
      mockWalletService.createWallet.mockResolvedValue({});
      mockOtpService.generate.mockResolvedValue('123456');

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

      // Should not create user or wallet
      expect(mockUserService.create).not.toHaveBeenCalled();
      expect(mockWalletService.createWallet).not.toHaveBeenCalled();
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
      ).rejects.toThrow('Invalid email or OTP');
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
