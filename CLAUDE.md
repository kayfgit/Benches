# BenchFinder - Claude Instructions

## Development Server

**DO NOT run `npm run dev` automatically.** Let the user start the dev server manually.

There is a concurrency issue where running the dev server from Claude causes JavaScript to fail to load on the site. The user can restart the server faster manually when this happens.

## Stack

- Next.js 14 (App Router) + TypeScript
- react-three-fiber + drei + Three.js for 3D globe
- Tailwind CSS
- Prisma + PostgreSQL
- NextAuth.js v4 (credentials provider)

## Key Commands

```bash
npm run dev          # Start dev server (user runs manually)
npm run build        # Production build
npx prisma db push   # Push schema to database
npx tsx prisma/seed.ts  # Seed database
```

## Architecture

- Globe rendered with react-three-fiber (SSR disabled via dynamic import)
- Layers render based on zoom level:
  - Country borders (always visible)
  - State/province boundaries (zoom ~2.1)
  - Lakes (filled polygons), rivers, urban areas, roads (zoom ~1.6)
  - Street tiles (zoom ~1.15) - uses OpenFreeMap (FREE, no API key)
- Warm earth-tone aesthetic, NOT cold/space/tech

## Map Tiles

Uses **Versatiles OSM** for street-level detail - completely free with no API key required.
- Roads, water bodies, buildings rendered as vector tiles
- Tile URL: `https://tiles.versatiles.org/tiles/osm/{z}/{x}/{y}`
- Uses OpenMapTiles schema (layers: transportation, water, waterway, building)
