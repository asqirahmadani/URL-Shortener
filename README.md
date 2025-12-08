<div align="center">

# 🔗 URL Shortener with Analytics

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10.3-red?logo=nestjs)](https://nestjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue?logo=postgresql)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-red?logo=redis)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-enabled-blue?logo=docker)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Test Coverage](https://img.shields.io/badge/coverage-85%25-brightgreen)](https://github.com/asqirahmadani/URL-Shortener)

**A production-ready URL shortening service with comprehensive analytics, built for scale and performance.**

[Report Bug](https://github.com/asqirahmadani/URL-Shortener/issues) · [Request Feature](https://github.com/asqirahmadani/URL-Shortener/issues)

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuration](#configuration)
  - [Running the Application](#running-the-application)
- [API Documentation](#-api-documentation)
- [Project Structure](#-project-structure)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Performance](#-performance)
- [Contributing](#-contributing)
- [License](#-license)
- [Contact](#-contact)

---

## 🎯 Overview

A full-featured URL shortening service designed for production use. This project demonstrates enterprise-level architecture, clean code principles, and modern backend development practices. Built with **NestJS**, **TypeORM**, and **PostgreSQL**, it includes real-time analytics, QR code generation, authentication, and caching strategies.

**Perfect for:**

- Portfolio projects showcasing full-stack backend capabilities
- Learning modern NestJS architecture and best practices
- Understanding production-ready application design
- Microservices architecture patterns

---

## ✨ Key Features

### Core Functionality

- 🔗 **URL Shortening** - Generate short, memorable links with custom aliases
- 📊 **Real-time Analytics** - Track clicks, geolocation, devices, browsers, and referrers
- 📱 **QR Code Generation** - PNG, SVG, and Data URL formats with customization
- 🔐 **Authentication & Authorization** - JWT-based auth with role-based access control (RBAC)
- ⏰ **Expiring Links** - Set expiration dates and maximum click limits
- 🔒 **Password Protection** - Secure sensitive links with passwords

### Advanced Features

- 🚀 **High Performance** - Redis caching for <10ms response times
- 📈 **Analytics Dashboard** - Comprehensive metrics and data visualization
- 🔄 **Background Processing** - Async click tracking with BullMQ
- 🛡️ **Rate Limiting** - IP-based rate limiting to prevent abuse
- 📦 **Bulk Operations** - Create multiple URLs in a single request
- 🌐 **Geolocation** - Automatic IP-to-location mapping
- 📅 **Scheduled Tasks** - Automated cleanup and maintenance jobs
- 🔍 **URL Preview** - Fetch Open Graph metadata for link previews

### Technical Excellence

- ✅ **85%+ Test Coverage** - Comprehensive unit, integration, and E2E tests
- 🐳 **Docker Support** - Complete containerization with Docker Compose
- 📚 **API Documentation** - Interactive Swagger/OpenAPI docs
- 🔄 **CI/CD Ready** - GitHub Actions workflows included
- 📊 **Monitoring** - Prometheus metrics and Grafana dashboards
- 🔐 **Security Hardened** - Helmet.js, CORS, input validation, SQL injection prevention

---

## 🛠️ Tech Stack

### Backend Framework

- **NestJS 10.3** - Progressive Node.js framework
- **TypeScript 5.3** - Type-safe development
- **Node.js 20 LTS** - Runtime environment

### Database & Caching

- **PostgreSQL 16** - Primary database with full-text search
- **TypeORM 0.3** - Object-relational mapping
- **Redis 7** - Caching and queue management

### Background Jobs

- **BullMQ 4** - Distributed job processing
- **Bull Board** - Queue monitoring dashboard

### Authentication & Security

- **Passport JWT** - Token-based authentication
- **bcrypt** - Password hashing
- **Helmet.js** - Security headers
- **class-validator** - Input validation

### Additional Libraries

- **nanoid** - Unique ID generation for short codes
- **qrcode** - QR code generation
- **ua-parser-js** - User agent parsing
- **geoip-lite** - IP geolocation
- **winston** - Structured logging

### DevOps & Tooling

- **Docker & Docker Compose** - Containerization
- **Jest & Supertest** - Testing framework
- **ESLint & Prettier** - Code quality
- **GitHub Actions** - CI/CD automation

---

## 🏗️ Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ HTTPS
       ▼
┌─────────────────┐
│  Load Balancer  │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌────────┐
│ App 1  │ │ App 2  │  (Horizontally Scalable)
└───┬────┘ └───┬────┘
    │          │
    └────┬─────┘
         │
    ┌────┼────┐
    │    │    │
    ▼    ▼    ▼
┌──────┐ ┌─────┐ ┌────────┐
│ PG   │ │Redis│ │ Worker │
└──────┘ └─────┘ └────────┘
```

**Design Patterns:**

- Repository Pattern for data access
- Service Layer for business logic
- Cache-Aside Pattern for caching
- Async Job Processing for analytics
- Guard Pattern for authorization

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 20.0.0 ([Download](https://nodejs.org/))
- **Docker & Docker Compose** ([Download](https://www.docker.com/))
- **PostgreSQL** 16+ (or use Docker)
- **Redis** 7+ (or use Docker)

### Installation

1. **Clone the repository**

```bash
   git clone https://github.com/asqirahmadani/URL-Shortener.git
   cd url-shortener
```

2. **Install dependencies**

```bash
   npm install
```

3. **Set up environment variables**

```bash
   cp .env.example .env
   # Edit .env with your configuration
```

### Configuration

Create a `.env` file with the following variables:

```bash
# Application
NODE_ENV=development
PORT=3000
BASE_URL=http://localhost:3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=urlshortener
DB_PASSWORD=your_secure_password
DB_DATABASE=urlshortener_db

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# JWT
JWT_SECRET=your_super_secret_jwt_key_min_32_chars
JWT_REFRESH_SECRET=your_super_secret_refresh_key_min_32_chars

# Rate Limiting
RATE_LIMIT_TTL=60
RATE_LIMIT_MAX=10

# Cache
CACHE_TTL=3600
```

### Running the Application

#### Using Docker (Recommended)

```bash
# Start all services (PostgreSQL + Redis + App)
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down
```

#### Manual Setup

```bash
# Start PostgreSQL and Redis
docker-compose up -d postgres redis

# Run database migrations
npm run migration:run

# Start development server
npm run start:dev

# Production build
npm run build
npm run start:prod
```

The application will be available at:

- **API:** `http://localhost:3000`
- **API Docs:** `http://localhost:3000/api/docs`
- **Health Check:** `http://localhost:3000/api/health`

---

## 📡 API Documentation

### Authentication

#### Register User

```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "name": "John Doe",
  "password": "SecurePass123!"
}
```

**Response:**

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

### URL Management

#### Create Short URL

```http
POST /api/urls
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "originalUrl": "https://www.example.com/very/long/url",
  "customAlias": "my-link",
  "title": "My Example Link",
  "expiresAt": "2025-12-31T23:59:59Z",
  "maxClicks": 100
}
```

**Response:**

```json
{
  "id": "uuid",
  "shortCode": "my-link",
  "shortUrl": "http://localhost:3000/my-link",
  "originalUrl": "https://www.example.com/very/long/url",
  "title": "My Example Link",
  "clickCount": 0,
  "expiresAt": "2025-12-31T23:59:59.000Z",
  "isActive": true,
  "createdAt": "2025-11-18T10:00:00.000Z"
}
```

#### Redirect to Original URL

```http
GET /{shortCode}
```

Returns `302 Redirect` to original URL.

#### Get URL Analytics

```http
GET /api/analytics/{shortCode}/overview
Authorization: Bearer {access_token}
```

**Response:**

```json
{
  "totalClicks": 1523,
  "uniqueVisitors": 892,
  "topCountry": "US",
  "topDevice": "mobile",
  "topBrowser": "Chrome",
  "averageClicksPerDay": 217.57,
  "lastClickAt": "2025-11-18T10:30:00.000Z"
}
```

### QR Code Generation

#### Get QR Code (PNG)

```http
GET /api/qrcode/{shortCode}.png?size=300&dark=000000&light=FFFFFF
```

Returns PNG image.

#### Get QR Code (Data URL)

```http
GET /api/qrcode/{shortCode}
```

**Response:**

```json
{
  "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANS...",
  "shortCode": "my-link"
}
```

### Complete API Documentation

Interactive API documentation available at: `http://localhost:3000/api/docs`

**Available Endpoints:**

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user profile
- `POST /api/urls` - Create short URL
- `GET /api/urls` - List user's URLs (paginated)
- `GET /api/urls/:id` - Get URL details
- `PUT /api/urls/:id` - Update URL
- `DELETE /api/urls/:id` - Delete URL
- `POST /api/urls/bulk` - Bulk create URLs
- `GET /:shortCode` - Redirect to original URL
- `GET /api/analytics/:shortCode/overview` - Analytics overview
- `GET /api/analytics/:shortCode/timeline` - Clicks over time
- `GET /api/analytics/:shortCode/locations` - Geographic distribution
- `GET /api/analytics/:shortCode/devices` - Device breakdown
- `GET /api/analytics/:shortCode/referrers` - Traffic sources
- `GET /api/analytics/:shortCode/export` - Export as CSV
- `GET /api/qrcode/:shortCode.png` - PNG QR code
- `GET /api/qrcode/:shortCode.svg` - SVG QR code
- `GET /api/qrcode/:shortCode` - Data URL QR code
- `GET /api/admin/stats` - System statistics (admin only)

---

## 📁 Project Structure

```
url-shortener/
├── src/
│   ├── common/                    # Shared utilities
│   │   ├── cache/                 # Cache module
│   │   ├── config/                # Configuration files
│   │   ├── decorators/            # Custom decorators
│   │   ├── entities/              # Base entities
│   │   ├── filters/               # Exception filters
│   │   ├── guards/                # Auth guards
│   │   └── interceptors/          # HTTP interceptors
│   ├── modules/
│   │   ├── auth/                  # Authentication module
│   │   │   ├── decorators/        # Auth decorators
│   │   │   ├── dto/               # Data transfer objects
│   │   │   ├── entities/          # User & API key entities
│   │   │   ├── guards/            # JWT & role guards
│   │   │   ├── strategies/        # Passport strategies
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   └── auth.module.ts
│   │   ├── url/                   # URL shortening module
│   │   │   ├── dto/
│   │   │   ├── entities/
│   │   │   ├── url.controller.ts
│   │   │   ├── url.service.ts
│   │   │   └── url.module.ts
│   │   ├── analytics/             # Analytics module
│   │   │   ├── dto/
│   │   │   ├── entities/
│   │   │   ├── processors/        # BullMQ workers
│   │   │   ├── utils/             # UA parser, GeoIP
│   │   │   ├── analytics.controller.ts
│   │   │   ├── analytics.service.ts
│   │   │   └── analytics.module.ts
│   │   ├── qrcode/                # QR code module
│   │   ├── scheduler/             # Cron jobs
│   │   ├── rate-limit/            # Rate limiting
│   │   └── admin/                 # Admin dashboard
│   ├── app.module.ts
│   └── main.ts
├── test/
│   ├── unit/                      # Unit tests
│   ├── integration/               # Integration tests
│   ├── e2e/                       # End-to-end tests
│   └── load/                      # Load tests
├── migrations/                    # Database migrations
├── docs/                          # Documentation
├── scripts/                       # Utility scripts
├── .github/workflows/             # CI/CD pipelines
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🧪 Testing

### Run All Tests

```bash
npm test                    # All tests
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests
npm run test:e2e            # End-to-end tests
npm run test:cov            # With coverage report
```

### Test Coverage

```
Statements   : 85.3%
Branches     : 78.9%
Functions    : 83.2%
Lines        : 86.1%
```

### Load Testing

```bash
# Using Artillery
npm install -g artillery
artillery run test/load/basic-flow.yml

# Using k6
k6 run test/load/stress-test.js
```

**Performance Targets:**

- URL Creation: < 50ms (p95)
- Redirect (cached): < 10ms (p95)
- Analytics Query: < 200ms (p95)
- Sustained Load: 1,000 req/s
- Peak Load: 5,000 req/s

---

## 🚀 Deployment

### Production Build

```bash
# Build Docker image
docker build -f Dockerfile.prod -t url-shortener:latest .

# Run production stack
docker-compose -f docker-compose.prod.yml up -d
```

### Environment Variables (Production)

**⚠️ Important:** Change all default secrets in production!

```bash
NODE_ENV=production
JWT_SECRET=<generate-strong-secret-min-32-chars>
JWT_REFRESH_SECRET=<generate-different-strong-secret>
DB_PASSWORD=<strong-database-password>
REDIS_PASSWORD=<strong-redis-password>
```

### Database Migrations

```bash
# Generate migration
npm run migration:generate -- migrations/MigrationName

# Run migrations
npm run migration:run

# Revert last migration
npm run migration:revert
```

### Health Checks

- **Application:** `GET /api/health`
- **Database:** Check via health endpoint
- **Redis:** Check via health endpoint

### Monitoring

- **Prometheus Metrics:** `http://localhost:9090`
- **Grafana Dashboard:** `http://localhost:3001`
- **Queue Dashboard:** `http://localhost:3000/admin/queues`

---

## ⚡ Performance

### Benchmarks

| Metric            | Value      |
| ----------------- | ---------- |
| URL Creation      | ~50ms      |
| Redirect (cached) | ~5ms       |
| Redirect (DB)     | ~50ms      |
| Analytics Query   | ~100-200ms |
| QR Generation     | ~50ms      |
| Cache Hit Rate    | >80%       |

### Optimization Strategies

- **Redis Caching** - 10x faster URL lookups
- **Background Jobs** - Non-blocking analytics processing
- **Database Indexing** - Optimized query performance
- **Connection Pooling** - Efficient resource usage
- **Horizontal Scaling** - Stateless application design

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch**

```bash
   git checkout -b feature/AmazingFeature
```

3. **Commit your changes**

```bash
   git commit -m 'Add some AmazingFeature'
```

4. **Push to the branch**

```bash
   git push origin feature/AmazingFeature
```

5. **Open a Pull Request**

### Development Guidelines

- Write tests for new features
- Follow existing code style (ESLint + Prettier)
- Update documentation as needed
- Keep commits atomic and well-described

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## 📧 Contact

**Your Name**

- Portfolio: [asqi-code-architect.lovable.app](https://asqi-code-architect.lovable.app/)
- LinkedIn: [linkedin.com/in/muhamad-asqi-rahmadani](https://www.linkedin.com/in/muhamad-asqi-rahmadani/)
- Email: rahmadaniasqi@gmail.com
- GitHub: [@asqirahmadani](https://github.com/asqirahmadani)

---

## 🙏 Acknowledgments

- [NestJS](https://nestjs.com/) - Framework foundation
- [TypeORM](https://typeorm.io/) - ORM library
- [BullMQ](https://docs.bullmq.io/) - Queue management
- All open-source contributors

---

## 📊 Project Stats

![GitHub stars](https://img.shields.io/github/stars/asqirahmadani/URL-Shortener?style=social)
![GitHub forks](https://img.shields.io/github/forks/asqirahmadani/URL-Shortener?style=social)
![GitHub issues](https://img.shields.io/github/issues/asqirahmadani/URL-Shortener)
![GitHub pull requests](https://img.shields.io/github/issues-pr/asqirahmadani/URL-Shortener)

---

<div align="center">

**⭐ Star this repo if you find it helpful!**

Made with ❤️ and ☕ by Asqi Rahmadani(https://github.com/asqirahmadani)

</div>
