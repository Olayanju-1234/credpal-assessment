import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('wallets')
@Unique('UQ_user_currency', ['user_id', 'currency'])
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_wallet_user')
  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, (user) => user.wallets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    default: 0,
  })
  balance: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
