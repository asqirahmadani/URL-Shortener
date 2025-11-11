import {
  IsOptional,
  IsString,
  MaxLength,
  IsBoolean,
  IsDateString,
  IsInt,
  Min,
} from 'class-validator';

export class UpdateUrlDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxClicks?: number;
}
