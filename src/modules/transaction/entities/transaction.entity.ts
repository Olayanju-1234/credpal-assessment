import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import {
  Currency,
  TransactionType,
  TransactionStatus,
} from '../../../common/enums';
import { User } from '../../user/entities/user.entity';

@Entity('transactions')
@Index('IDX_tx_user_created', ['user_id', 'created_at'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, (user) => user.transactions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.COMPLETED,
  })
  status: TransactionStatus;

  @Column({ type: 'enum', enum: Currency })
  source_currency: Currency;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  source_amount: string;

  @Column({ type: 'enum', enum: Currency, nullable: true })
  target_currency: Currency | null;

  @Column({ type: 'decimal', precision: 18, scale: 4, nullable: true })
  target_amount: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 8, nullable: true })
  exchange_rate: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 8, nullable: true })
  rate_with_spread: string | null;

  @Index('IDX_tx_idempotency', { unique: true })
  @Column({ type: 'varchar', length: 255, unique: true })
  idempotency_key: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
