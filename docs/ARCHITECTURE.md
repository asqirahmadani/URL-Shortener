# Architecture Overview

## System Architecture

```
┌─────────────┐
│   Client    │
│  (Browser)  │
└──────┬──────┘
       │
       │ HTTPS
       ▼
┌─────────────────────────────────────┐
│         Load Balancer (Nginx)       │
└──────────────┬──────────────────────┘
               │
      ┌────────┴────────┐
      │                 │
      ▼                 ▼
┌──────────┐      ┌──────────┐
│  App 1   │      │  App 2   │  (Horizontally Scalable)
└────┬─────┘      └────┬─────┘
     │                 │
     └────────┬────────┘
              │
    ┌─────────┼─────────┐
    │         │         │
    ▼         ▼         ▼
┌────────┐ ┌─────┐ ┌──────────┐
│Postgres│ │Redis│ │  Worker  │
└────────┘ └─────┘ └──────────┘
```

## Module Structure

### Core Modules

- **UrlModule**: URL shortening logic
- **AnalyticsModule**: Click tracking & analytics
- **AuthModule**: Authentication & authorization
- **CacheModule**: Redis caching layer
- **QrCodeModule**: QR code generation
- **SchedulerModule**: Cron jobs & scheduled tasks
- **RateLimitModule**: Rate limiting
- **AdminModule**: Admin dashboard

### Module Dependencies

```
AppModule
├── ConfigModule (Global)
├── CacheModule (Global)
├── AuthModule
│   ├── JwtStrategy
│   ├── ApiKeyStrategy
│   └── Guards
├── UrlModule
│   ├── UrlService
│   ├── UrlController
│   └── Entities
├── AnalyticsModule
│   ├── AnalyticsService
│   ├── ClickProcessor (Worker)
│   └── Utils (UserAgent, GeoIP)
├── QrCodeModule
├── SchedulerModule
│   ├── CleanupTask
│   └── SyncCountsTask
├── RateLimitModule
└── AdminModule
```

## Data Flow

### URL Creation Flow

```
1. Client → POST /api/urls
2. JwtAuthGuard validates token
3. RateLimitGuard checks rate limit
4. UrlController receives request
5. UrlService generates short code
6. Save to PostgreSQL
7. Return response to client
```

### Redirect Flow

```
1. Client → GET /:shortCode
2. Check Redis cache
   └─ HIT: Return from cache (5ms)
   └─ MISS: Query PostgreSQL (50ms) → Cache result
3. Validate URL (active, not expired, etc)
4. Enqueue click event to BullMQ (async)
5. HTTP 302 redirect to original URL
6. Worker processes click event (background)
   └─ Parse User-Agent
   └─ Get geolocation
   └─ Save to clicks table
   └─ Increment cached count
   └─ Invalidate analytics cache
```

### Analytics Query Flow

```
1. Client → GET /api/analytics/:shortCode/overview
2. JwtAuthGuard validates token
3. Check Redis cache
   └─ HIT: Return cached data
   └─ MISS: Run aggregation queries
4. AnalyticsService aggregates data from clicks table
5. Cache result (TTL: 10 minutes)
6. Return JSON response
```

## Database Schema

### Key Tables

- **users**: User accounts
- **urls**: Short URLs metadata
- **clicks**: Click tracking events
- **api_keys**: API key management

### Relationships

```
users (1) ─────< (N) urls
urls (1) ─────< (N) clicks
users (1) ─────< (N) api_keys
```

### Indices

- `urls.shortCode` (unique, B-tree)
- `urls.userId` (B-tree)
- `clicks.urlId + createdAt` (composite)
- `clicks.country` (B-tree)
- `clicks.deviceType` (B-tree)

## Caching Strategy

### Cache Layers

1. **URL Lookup Cache** (TTL: 1 hour)
   - Key: `url:lookup:{shortCode}`
   - Hit rate target: >90%

2. **Analytics Cache** (TTL: 5-10 minutes)
   - Key: `analytics:overview:{shortCode}`
   - Key: `analytics:timeline:{shortCode}:{interval}`
   - Hit rate target: >70%

3. **Rate Limit Cache** (TTL: 60 seconds)
   - Key: `ratelimit:{ip}`
   - Purpose: Track request counts

### Invalidation Rules

- URL updated → Invalidate URL cache
- Click recorded → Invalidate analytics cache
- URL deleted → Invalidate all related caches

## Security Layers

### Authentication

1. **JWT Access Token** (15 min expiry)
   - For API access
   - Stateless verification

2. **Refresh Token** (7 days expiry)
   - Stored hashed in database
   - For obtaining new access tokens

3. **API Keys** (Optional expiry)
   - For external integrations
   - Scoped permissions

### Authorization

- **Role-Based Access Control (RBAC)**
  - USER: Create/manage own URLs
  - PREMIUM: Higher rate limits, custom features
  - ADMIN: Full system access

### Rate Limiting

- **Per IP**: 10 requests/minute (default)
- **Per User**: Custom limits based on role
- **Per Endpoint**: Different limits
  - Auth: 5/min
  - URL creation: 5/min
  - Redirects: 30/min

## Scalability Considerations

### Horizontal Scaling

- Stateless application design
- Shared Redis for cache & queues
- Database connection pooling
- Load balancer distribution

### Performance Optimizations

1. **Caching**: Reduce DB queries by 80%+
2. **Async Processing**: Non-blocking operations
3. **Connection Pooling**: Reuse DB connections
4. **Indices**: Optimize query performance
5. **CDN**: Serve static assets (QR codes)

### Bottlenecks & Solutions

| Bottleneck        | Solution                            |
| ----------------- | ----------------------------------- |
| Database writes   | Write buffer, batch inserts         |
| Analytics queries | Pre-aggregation, materialized views |
| Redis memory      | Eviction policy, compression        |
| Worker queue      | Multiple workers, prioritization    |

## Monitoring & Observability

### Key Metrics

- **Request metrics**: Rate, latency, errors
- **Database metrics**: Connections, query time
- **Redis metrics**: Hit rate, memory usage
- **Queue metrics**: Length, processing time
- **Business metrics**: URLs created, clicks tracked

### Alerting Rules

- Error rate >5% for 5 minutes
- Response time p95 >500ms for 5 minutes
- Database connections >80% capacity
- Queue length >1000 for 10 minutes
- Redis memory >90% capacity

## Disaster Recovery

### Backup Strategy

- **Database**: Daily automated backups (retention: 30 days)
- **Redis**: AOF persistence + daily snapshots
- **Logs**: 14 days retention

### Recovery Time Objectives

- **RTO** (Recovery Time Objective): <30 minutes
- **RPO** (Recovery Point Objective): <24 hours

### Failover Plan

1. Detect failure (health check, monitoring)
2. Switch to standby database (if available)
3. Deploy from last known good version
4. Restore from backup if necessary
5. Verify system functionality
6. Notify stakeholders

---
