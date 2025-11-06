import { Exclude, Expose, Transform } from 'class-transformer';

// DTO for response URL to client
export class UrlResponseDto {
  @Expose()
  id: string;

  @Expose()
  originalUrl: string;

  @Expose()
  shortCode: string;

  @Expose()
  @Transform(({ obj }) => `${process.env.BASE_URL}/${obj.shortCode}`)
  shortUrl: string;

  @Expose()
  customAlias: string | null;

  @Expose()
  title: string | null;

  @Expose()
  clickCount: number;

  @Expose()
  expiresAt: Date | null;

  @Expose()
  isActive: boolean;

  @Expose()
  maxClicks: number | null;

  @Expose()
  createdAt: Date;

  // Hide sensitive field
  @Exclude()
  password: string | null;

  @Exclude()
  userId: string | null;

  @Exclude()
  deletedAt: Date | null;
}
