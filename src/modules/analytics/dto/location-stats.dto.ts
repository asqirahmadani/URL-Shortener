export class LocationStatsItemDto {
  country: string;
  countryCode: string;
  clicks: number;
  percentage: number;
}

export class LocationStatsDto {
  countries: LocationStatsItemDto[];
  cities: Array<{
    city: string;
    country: string;
    clicks: number;
  }>;
  totalClicks: number;
}
