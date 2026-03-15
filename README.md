# BenchFinder

**For the hikers, the wanderers, the people who'd rather find a quiet overlook than a crowded tourist spot. Some benches are just benches, others sit at the top of a trail you almost didn't finish, facing a view you'll remember for years. Find benches with views worth the walk, share your own discoveries, and connect with a community that actually goes outside.**

![Next.js](https://img.shields.io/badge/Next.js_14-black?logo=next.js)
![Three.js](https://img.shields.io/badge/Three.js-black?logo=three.js)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?logo=prisma)

---

## Technical Highlights

### Custom Globe Rendering
- **No map tiles.** The entire Earth is a procedurally-shaded sphere with limb darkening for realistic edge falloff
- Country borders rendered from TopoJSON as `LineSegments` — with antimeridian artifact filtering to prevent visual glitches at the international date line
- Warm atmospheric halo using Fresnel shading (not the typical cold space look)

### 3D Marker System
- Bench markers positioned in true 3D space using drei's `Html` component
- **Real-time occlusion detection**: markers on the far side of the globe hide automatically using surface normal dot product calculations against camera direction
- Smooth transitions, not pop-in/pop-out

### Camera Physics
- Google Maps-style zoom behavior with momentum
- Multi-speed zoom: base 1x, Ctrl+scroll for 3x fast, Shift+scroll for 0.3x precision
- Zoom range from orbit view (50 units) down to street-level close (1.08 units)

### Performance
- Dynamic imports with SSR disabled for Three.js components
- Subtle particle system (DustMotes) instead of heavy star fields
- Optimized render loop with selective updates

---

## Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14 (App Router) |
| 3D Engine | react-three-fiber + drei + Three.js |
| Styling | Tailwind CSS (custom earth-tone palette) |
| Auth | NextAuth.js v4 (JWT sessions) |
| Database | Prisma + SQLite |
| Language | TypeScript |

---

## Design Philosophy

The UI follows a **"cozy, earthy-alive"** aesthetic, like it's a cold winter morning and you're holding a steaming hot chocolate with floating marshmallows — warm browns, muted golds, sage greens.

```
deep:     #17130e    // Near-black base
surface:  #211c15    // Card backgrounds
elevated: #2e2720    // Raised elements
ridge:    #443b30    // Borders, dividers
gold:     #c9945a    // Accents, CTAs
sage:     #6b8f6e    // Secondary accents
```

Typography: Cormorant Garamond for display, Outfit for body, JetBrains Mono for data.

---

## Project Structure

```
src/
├── components/
│   ├── GlobeScene.tsx      # R3F Canvas, camera, particles
│   ├── Earth.tsx           # Shaded sphere + atmosphere
│   ├── CountryBorders.tsx  # TopoJSON line rendering
│   ├── BenchMarkers.tsx    # 3D-positioned Html markers
│   ├── Navbar.tsx          # Navigation + auth state
│   └── Panels.tsx          # Detail + add bench UI
├── lib/
│   └── store.tsx           # React Context global state
└── app/
    └── api/                # Auth + CRUD endpoints
```

---

## License

MIT
