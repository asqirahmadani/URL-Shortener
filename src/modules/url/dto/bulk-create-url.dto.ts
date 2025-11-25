import { IsArray, ValidateNested, ArrayMaxSize } from 'class-validator';
import { CreateUrlDto } from './create-url.dto';
import { Type } from 'class-transformer';

/* 
DTO for bulk URL creation
*/
export class BulkCreateUrlDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateUrlDto)
  @ArrayMaxSize(100, { message: 'Maximum 100 URLs per batch' })
  urls: CreateUrlDto[];
}
