import { Entity, Column, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Click } from '../../analytics/entities/click.entity';
import { config } from 'dotenv';

config();

// URL Entity - Main table shortened URLs
@Entity('urls')
@Index(['shortCode'], { unique: true })
@Index(['userId'])
@Index(['expiresAt'])
export class Url extends BaseEntity {
  @Column({ type: 'text' })
  originalUrl: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  shortCode: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  customAlias: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  userId: string | null;

  @Column({ type: 'int', default: 0 })
  clickCount: number;

  @Column({ type: 'timestamp with time zone', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'varchar', length: 60, nullable: true })
  password: string | null;

  @Column({ type: 'int', default: 0 })
  maxClicks: number | null;

  // Relation to click tracking
  @OneToMany(() => Click, (click) => click.url, {
    cascade: false,
  })
  clicks: Click[];

  get shortUrl(): string {
    return `${process.env.BASE_URL}/${this.shortCode}`;
  }
}
