import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { FxModule } from '../fx/fx.module';

@Module({
  imports: [TypeOrmModule.forFeature([Wallet]), FxModule],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
