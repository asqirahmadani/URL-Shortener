import {
  IsUrl,
  IsOptional,
  MaxLength,
  MinLength,
  Min,
  IsDateString,
  Matches,
  IsString,
  IsInt,
} from 'class-validator';
import { Transform } from 'class-transformer';

// DTO for validation input
export class CreateUrlDto {
  @IsUrl({}, { message: 'URL tidak valid. Harus format: https://example.com' })
  @MaxLength(2048, { message: 'URL terlalu panjang (max 2048 karakter)' })
  originalUrl: string;

  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Custom alias minimal 3 karakter' })
  @MaxLength(50, { message: 'Custom alias maksimal 50 karakter' })
  @Matches(/^[a-zA-Z0-9-_]+$/, {
    message: 'Custom alias hanya boleh huruf, angka, dash, underscore',
  })
  @Transform(({ value }) => value?.toLowerCase())
  customAlias?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Format tanggal tidak valid (ISO 8601)' })
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Password minimal 6 karakter' })
  password?: string;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Max clicks harus minimal 1' })
  maxClicks?: number;
}
