import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async create(data: Partial<User>): Promise<User> {
    const user = this.userRepo.create(data);
    return this.userRepo.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email } });
  }

  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async markEmailVerified(userId: string): Promise<void> {
    await this.userRepo.update(userId, { email_verified_at: new Date() });
  }

  async listUsers(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.userRepo.findAndCount({
      order: { created_at: 'DESC' },
      skip,
      take: limit,
      select: [
        'id',
        'email',
        'first_name',
        'last_name',
        'role',
        'email_verified_at',
        'created_at',
      ],
    });

    return {
      data,
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }
}
