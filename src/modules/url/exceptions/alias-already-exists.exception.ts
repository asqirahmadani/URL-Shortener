import { ConflictException } from '@nestjs/common';

export class AliasAlreadyExistsException extends ConflictException {
  constructor(alias: string) {
    super(`Custom alias "${alias}" sudah digunakan!`);
  }
}
