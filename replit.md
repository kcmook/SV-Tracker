# 급상승 모델 레이더 (Danawa Rising Model Radar)

## Overview

A Korean automotive sales analytics dashboard that tracks and displays "rapidly rising" car models based on Danawa's sales data. The application analyzes month-over-month sales changes, ranking shifts, and calculates composite scores to identify trending vehicle models in both domestic and imported car markets.

The core functionality includes:
- Displaying top rising car models with sales metrics
- Filtering by domestic vs import vehicles
- Month-to-month historical comparison
- Composite scoring algorithm weighing sales growth, percentage change, and rank improvements

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack Query for server state
- **Styling**: Tailwind CSS with shadcn/ui component library
- **Build Tool**: Vite with custom plugins for Replit integration

The frontend follows a component-based architecture with:
- Page components in `client/src/pages/`
- Reusable UI components in `client/src/components/`
- shadcn/ui primitives in `client/src/components/ui/`
- Custom hooks in `client/src/hooks/`

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **API Pattern**: RESTful JSON API under `/api/*`
- **Development**: Vite middleware for HMR
- **Production**: Static file serving from built assets

Key backend files:
- `server/routes.ts` - API endpoint definitions
- `server/storage.ts` - Data access layer (currently in-memory with sample data)
- `server/vite.ts` - Development server configuration

### Data Model
The `RadarModel` entity captures:
- Model identification (name, brand, nation)
- Current and previous sales figures
- Rank and rank changes
- Month-over-month absolute and percentage changes
- Composite score for sorting

### Scoring Algorithm
Models are scored based on weighted combination of:
- Sales volume thresholds (minimum 300 units default)
- Month-over-month growth (absolute and percentage)
- Rank improvement from previous month

## External Dependencies

### Database
- **ORM**: Drizzle ORM configured for PostgreSQL
- **Schema**: Defined in `shared/schema.ts`
- **Migrations**: Output to `./migrations` directory
- **Current State**: Storage layer uses in-memory sample data; ready for PostgreSQL when DATABASE_URL is configured

### UI Component Library
- **shadcn/ui**: Full component suite with Radix UI primitives
- **Icons**: Lucide React
- **Fonts**: Inter + Noto Sans KR (Google Fonts)

### Key NPM Packages
- `@tanstack/react-query` - Data fetching and caching
- `drizzle-orm` / `drizzle-zod` - Database ORM with Zod validation
- `class-variance-authority` - Component variant styling
- `date-fns` - Date manipulation utilities

### External Data Source
- **Danawa Auto**: Korean automotive sales data portal
- URL patterns documented in `attached_assets/` for domestic and import models
- Data includes monthly sales, market share, and period-over-period changes

## Netlify Deployment

The application is configured for Netlify deployment:

### Configuration
- **netlify.toml**: Build settings and redirects
- **netlify/functions/radar.ts**: Serverless function for API

### Build Settings
- Build command: `npm run build`
- Publish directory: `dist/public`
- Functions directory: `netlify/functions`

### Deployment Steps
1. Connect your Netlify account to the Git repository
2. Netlify will automatically detect the `netlify.toml` configuration
3. Set any required environment variables in Netlify dashboard
4. Deploy

### API Redirects
- `/api/*` requests are redirected to `/.netlify/functions/*`
- SPA fallback routes all other paths to `index.html`