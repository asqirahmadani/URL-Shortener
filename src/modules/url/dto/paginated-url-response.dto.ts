import { UrlResponseDto } from './url-response.dto';

export class PaginatedResponseDto {
  urls: UrlResponseDto[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}
