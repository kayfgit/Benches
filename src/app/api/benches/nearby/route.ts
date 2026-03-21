import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Haversine formula to calculate distance between two points in meters
function getDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat') || '');
    const lng = parseFloat(searchParams.get('lng') || '');
    const radius = parseFloat(searchParams.get('radius') || '50'); // Default 50 meters

    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
    }

    // Approximate bounding box for initial filtering (1 degree ≈ 111km)
    const latDelta = radius / 111000;
    const lngDelta = radius / (111000 * Math.cos(lat * Math.PI / 180));

    const benches = await prisma.bench.findMany({
      where: {
        latitude: {
          gte: lat - latDelta,
          lte: lat + latDelta,
        },
        longitude: {
          gte: lng - lngDelta,
          lte: lng + lngDelta,
        },
      },
      include: {
        photos: { take: 1 }, // Just need first photo for thumbnail
        user: { select: { username: true } },
      },
    });

    // Filter by exact distance and sort by proximity
    const nearby = benches
      .map((b) => ({
        id: b.id,
        name: b.name,
        description: b.description,
        latitude: b.latitude,
        longitude: b.longitude,
        thumbnail: b.photos[0]?.url || null,
        userName: b.user.username,
        distance: getDistanceMeters(lat, lng, b.latitude, b.longitude),
      }))
      .filter((b) => b.distance <= radius)
      .sort((a, b) => a.distance - b.distance);

    return NextResponse.json(nearby);
  } catch (error) {
    console.error('GET /api/benches/nearby error:', error);
    return NextResponse.json({ error: 'Failed to fetch nearby benches' }, { status: 500 });
  }
}
