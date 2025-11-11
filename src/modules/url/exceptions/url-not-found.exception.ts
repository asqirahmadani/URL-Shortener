import { NotFoundException } from '@nestjs/common';

/* 
Custom exception for URL not found
*/
export class UrlNotFoundException extends NotFoundException {
  constructor(shortCode: string) {
    super(`Short URL "${shortCode}" tidak ditemukan!`);
  }
}
