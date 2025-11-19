import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as QRCode from 'qrcode';

/* 
QR Code Service - Generate QR codes for short URLs
*/
@Injectable()
export class QrCodeService {
  private readonly logger = new Logger(QrCodeService.name);
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('BASE_URL')!;
  }

  /* 
  Generate QR Code as PNG buffer
  */
  async generatePNG(
    shortCode: string,
    options?: {
      size?: number;
      margin?: number;
      color?: { dark?: string; light?: string };
    },
  ): Promise<Buffer> {
    const url = `${this.baseUrl}/${shortCode}`;

    try {
      const qrOptions: QRCode.QRCodeToBufferOptions = {
        type: 'png',
        width: options?.size || 300,
        margin: options?.margin || 1,
        color: {
          dark: options?.color?.dark || '#000000',
          light: options?.color?.light || '#FFFFFF',
        },
        errorCorrectionLevel: 'M',
      };

      const buffer = await QRCode.toBuffer(url, qrOptions);
      this.logger.debug(`Generated PNG QR code for ${shortCode}`);
      return buffer;
    } catch (error) {
      this.logger.error(`Failed to generate QR code: ${error.message}`);
      throw new BadRequestException('Failed to generate QR code');
    }
  }

  /* 
  Generate QR Code as SVG string
  */
  async generateSVG(
    shortCode: string,
    options?: {
      size?: number;
      margin?: number;
      color?: { dark?: string; light?: string };
    },
  ): Promise<string> {
    const url = `${this.baseUrl}/${shortCode}`;

    try {
      const qrOptions: QRCode.QRCodeToStringOptions = {
        type: 'svg',
        width: options?.size || 300,
        margin: options?.margin || 1,
        color: {
          dark: options?.color?.dark || '#000000',
          light: options?.color?.light || '#FFFFFF',
        },
      };

      const svg = await QRCode.toString(url, qrOptions);
      this.logger.debug(`Generated SVG QR code for ${shortCode}`);
      return svg;
    } catch (error) {
      this.logger.error(`Failed to generate SVG QR code: ${error.message}`);
      throw new BadRequestException('Failed to generate QR code');
    }
  }

  /* 
  Generate QR Code as URL Data (base64)
  */
  async generateDataURL(
    shortCode: string,
    options?: {
      size?: number;
      margin?: number;
      color?: { dark?: string; light?: string };
    },
  ): Promise<string> {
    const url = `${this.baseUrl}/${shortCode}`;

    try {
      const qrOptions: QRCode.QRCodeToDataURLOptions = {
        width: options?.size || 300,
        margin: options?.margin || 1,
        color: {
          dark: options?.color?.dark || '#000000',
          light: options?.color?.light || '#FFFFFF',
        },
      };

      const dataURL = await QRCode.toDataURL(url, qrOptions);
      this.logger.debug(`Generated Data URL QR code for ${shortCode}`);
      return dataURL;
    } catch (error) {
      this.logger.error(
        `Failed to generate Data URL QR code: ${error.message}`,
      );
      throw new BadRequestException('Failed to generate QR code');
    }
  }

  /* 
  Generate QR Code with logo/image in the middle
  */
  async generateWithLogo(
    shortCode: string,
    logoBuffer: Buffer,
  ): Promise<Buffer> {
    // TODO: implement with sharp for merge QR + logo
    return this.generatePNG(shortCode);
  }
}
