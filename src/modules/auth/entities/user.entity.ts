import { Entity, Column, Index, OneToMany } from 'typeorm';
import { Exclude } from 'class-transformer';

import { BaseEntity } from '../../../common/entities/base.entity';
import { Url } from '../../url/entities/url.entity';

export enum UserRole {
  USER = 'user',
  PREMIUM = 'premium',
  ADMIN = 'admin',
}

/* 
User Entity - User accounts for authentication
*/
@Entity('users')
@Index(['email'], { unique: true })
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 60 })
  @Exclude() // not return this column in response
  password: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Column({ type: 'boolean', default: false })
  isEmailVerified: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @Exclude()
  emailVerificationToken: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @Exclude()
  refreshToken: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastLoginAt: Date | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  // Relations
  @OneToMany(() => Url, (url) => url.userId)
  urls: Url[];
}
