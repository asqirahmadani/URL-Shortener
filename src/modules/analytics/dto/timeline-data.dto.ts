export class TimelineDataPointDto {
  timestamp: string;
  clicks: number;
}

export class TimelineDataDto {
  data: TimelineDataPointDto[];
  interval: 'hour' | 'day' | 'week' | 'month';
  totalClicks: number;
}
