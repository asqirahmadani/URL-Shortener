import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Url } from '../../url/entities/url.entity';

// Click Entity - Tracking every click to short URL
@Entity('clicks')
@Index(['urlId', 'createdAt'])
@Index(['createdAt'])
@Index(['country'])
export class Click extends BaseEntity {
  @Column({ type: 'uuid' })
  urlId: string;

  @ManyToOne(() => Url, (url) => url.clicks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'urlId' })
  url: Url;

  @Column({ type: 'varchar', length: 45 })
  ipAddress: string;

  @Column({ type: 'text', nullable: true })
  userAgent: string;

  @Column({ type: 'text', nullable: true })
  referer: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  browser: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  browserVersion: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  os: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  osVersion: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  deviceType: string | null;

  @Column({ type: 'varchar', length: 2, nullable: true })
  country: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  latitude: number | null;

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  longitude: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  timezone: string | null;
}
