import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Role } from '../../../common/enums';
import { Wallet } from '../../wallet/entities/wallet.entity';
import { Transaction } from '../../transaction/entities/transaction.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  first_name: string;

  @Column({ type: 'varchar', length: 100 })
  last_name: string;

  @Index('IDX_user_email', { unique: true })
  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255, select: false })
  password: string;

  @Column({ type: 'enum', enum: Role, default: Role.USER })
  role: Role;

  @Column({ type: 'timestamptz', nullable: true, default: null })
  email_verified_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @OneToMany(() => Wallet, (wallet) => wallet.user)
  wallets: Wallet[];

  @OneToMany(() => Transaction, (tx) => tx.user)
  transactions: Transaction[];
}
