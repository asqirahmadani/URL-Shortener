import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Exclude } from 'class-transformer';

import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from './user.entity';

/* 
API Key Entity - API keys for external integrations
*/
@Entity('api_keys')
@Index(['key'], { unique: true })
export class ApiKey extends BaseEntity {
  @Column({ type: 'varchar', length: 64, unique: true })
  // hashed API key
  key: string;

  @Column({ type: 'varchar', length: 100 })
  // descriptive name
  name: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastUsedAt: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'jsonb', nullable: true })
  permissions: string[];
}
