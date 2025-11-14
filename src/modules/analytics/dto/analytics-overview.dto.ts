import { Expose } from 'class-transformer';

/* 
DTO for analytics overview/summary
 */
export class AnalyticsOverviewDto {
  @Expose()
  totalClicks: number;

  @Expose()
  uniqueVisitors: number;

  @Expose()
  topCountry: string | null;

  @Expose()
  topDevice: string | null;

  @Expose()
  topBrowser: string | null;

  @Expose()
  averageClicksPerDay: number;

  @Expose()
  lastClickAt: Date | null;

  @Expose()
  createdAt: Date;
}
