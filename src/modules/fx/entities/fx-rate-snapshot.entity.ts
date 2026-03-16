import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
@Entity('fx_rate_snapshots')
@Index('IDX_rate_pair_created', [
  'base_currency',
  'target_currency',
  'created_at',
])
export class FxRateSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 3 })
  base_currency: string;

  @Column({ type: 'varchar', length: 3 })
  target_currency: string;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  rate: string;

  @Column({ type: 'varchar', length: 100 })
  provider: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
