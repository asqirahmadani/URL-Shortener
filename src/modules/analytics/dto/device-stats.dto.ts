export class DeviceStatsDto {
  byType: Array<{
    deviceType: string;
    clicks: number;
    percentage: number;
  }>;

  byBrowser: Array<{
    browser: string;
    version: string | null;
    clicks: number;
    percentage: number;
  }>;

  byOS: Array<{
    os: string;
    version: string | null;
    clicks: number;
    percentage: number;
  }>;

  totalClicks: number;
}
