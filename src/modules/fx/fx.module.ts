import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import fxConfig from '../../config/fx.config';
import redisConfig from '../../config/redis.config';
import { FxRateSnapshot } from './entities/fx-rate-snapshot.entity';
import { FxService } from './fx.service';
import { FxClientService } from './fx-client.service';
import { FxController } from './fx.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([FxRateSnapshot]),
    HttpModule.register({ timeout: 5000 }),
    ConfigModule.forFeature(fxConfig),
    ConfigModule.forFeature(redisConfig),
  ],
  controllers: [FxController],
  providers: [
    FxService,
    FxClientService,
    {
      provide: 'REDIS_CLIENT',
      useFactory: (config: ConfigType<typeof redisConfig>) => {
        return new Redis({
          host: config.host,
          port: config.port,
          password: config.password,
          lazyConnect: false,
        });
      },
      inject: [redisConfig.KEY],
    },
  ],
  exports: [FxService, 'REDIS_CLIENT'],
})
export class FxModule {}
