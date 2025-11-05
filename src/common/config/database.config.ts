import { ConfigService } from '@nestjs/config';
import { DataSourceOptions } from 'typeorm';

export const getDatabaseConfig = (
  configService: ConfigService,
): DataSourceOptions => ({
  type: 'postgres',
  host: configService.get<string>('DB_HOST'),
  port: configService.get<number>('DB_PORT'),
  username: configService.get<string>('DB_USERNAME'),
  password: configService.get<string>('DB_PASSWORD'),
  database: configService.get<string>('DB_DATABASE'),

  //   Entity auto-loading
  entities: [__dirname + '/../../**/*.entity{.ts,.js}'],

  // Migrations
  migrations: [__dirname + '/../../../migrations/*{.ts,.js}'],
  migrationsRun: false,

  // Settings
  synchronize: configService.get<boolean>('DB_SYNC', false),
  logging: configService.get<boolean>('DB_LOGGING', false),

  // Connection pool
  extra: {
    max: 10,
    min: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },
});
