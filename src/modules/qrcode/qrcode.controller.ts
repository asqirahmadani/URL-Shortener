import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  Header,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';

import { QrCodeService } from './qrcode.service';

/* 
QR Code Controller - Endpoints for generate QR codes
*/
@Controller('api/qrcode')
export class QrCodeController {
  constructor(private readonly qrCodeService: QrCodeService) {}

  /* 
  Get QR Code as PNG image
  */
  @Get(':shortCode.png')
  @Header('Content-Type', 'image/png')
  @Header('Cache-Control', 'public, max-age=86400')
  async getPNG(
    @Param('shortCode') shortCode: string,
    @Query('size', new ParseIntPipe({ optional: true })) size?: number,
    @Query('margin', new ParseIntPipe({ optional: true })) margin?: number,
    @Query('dark') darkColor?: string,
    @Query('light') lightColor?: string,
    @Res() res?: Response,
  ): Promise<void> {
    // Validate size
    if (size && (size < 100 || size > 2000)) {
      throw new BadRequestException('Size must be between 100 and 2000');
    }

    const buffer = await this.qrCodeService.generatePNG(shortCode, {
      size,
      margin,
      color: {
        dark: darkColor,
        light: lightColor,
      },
    });

    res?.send(buffer);
  }

  /* 
  GET QR Code as SVG
  */
  @Get(':shortCode.svg')
  @Header('Content-Type', 'image/svg+xml')
  @Header('Cache-Control', 'public, max-age=86400')
  async getSVG(
    @Param('shortCode') shortCode: string,
    @Query('size', new ParseIntPipe({ optional: true })) size?: number,
    @Query('dark') darkColor?: string,
    @Query('light') lightColor?: string,
  ): Promise<string> {
    return this.qrCodeService.generateSVG(shortCode, {
      size,
      color: {
        dark: darkColor,
        light: lightColor,
      },
    });
  }

  /* 
  GET QR Code as URL data (JSON response)
  */
  @Get(':shortCode')
  async getDataURL(
    @Param('shortCode') shortCode: string,
    @Query('size', new ParseIntPipe({ optional: true })) size?: number,
    @Query('dark') darkColor?: string,
    @Query('light') lightColor?: string,
  ): Promise<{ qrCode: string; shortCode: string }> {
    const dataURL = await this.qrCodeService.generateDataURL(shortCode, {
      size,
      color: {
        dark: darkColor,
        light: lightColor,
      },
    });

    return {
      qrCode: dataURL,
      shortCode,
    };
  }
}
