import { IsString, IsOptional, IsIP, MaxLength } from 'class-validator';

// DTO for event tracking click
export class ClickEventDto {
  @IsString()
  urlId: string;

  @IsIP('4', { message: 'IP address tidak valid' })
  ipAddress: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  userAgent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  referer?: string;
}
