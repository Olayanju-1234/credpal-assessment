import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import fxConfig from '../../config/fx.config';
import { TradingController } from './trading.controller';
import { TradingService } from './trading.service';
import { FxModule } from '../fx/fx.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [ConfigModule.forFeature(fxConfig), FxModule, WalletModule],
  controllers: [TradingController],
  providers: [TradingService],
  exports: [TradingService],
})
export class TradingModule {}
