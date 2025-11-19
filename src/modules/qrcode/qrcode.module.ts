import { Module } from '@nestjs/common';

import { QrCodeService } from './qrcode.service';
import { QrCodeController } from './qrcode.controller';

@Module({
  providers: [QrCodeService],
  controllers: [QrCodeController],
  exports: [QrCodeService],
})
export class QrcodeModule {}
