import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const benches = await prisma.bench.findMany({
      include: {
        photos: true,
        user: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = benches.map((b) => ({
      id: b.id,
      name: b.name,
      description: b.description,
      latitude: b.latitude,
      longitude: b.longitude,
      country: b.country,
      altitude: b.altitude,
      photos: b.photos,
      userId: b.userId,
      userName: b.user.name,
      createdAt: b.createdAt.toISOString(),
    }));

    return NextResponse.json(formatted);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch benches' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as Record<string, unknown>).id as string;
    const { name, description, latitude, longitude, country, altitude, photoUrls } = await request.json();

    if (!name || !description || latitude == null || longitude == null) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const bench = await prisma.bench.create({
      data: {
        name,
        description,
        latitude,
        longitude,
        country: country || '',
        altitude: altitude || null,
        userId,
        photos: {
          create: (photoUrls || []).map((url: string) => ({ url })),
        },
      },
      include: {
        photos: true,
        user: { select: { name: true } },
      },
    });

    return NextResponse.json({
      id: bench.id,
      name: bench.name,
      description: bench.description,
      latitude: bench.latitude,
      longitude: bench.longitude,
      country: bench.country,
      altitude: bench.altitude,
      photos: bench.photos,
      userId: bench.userId,
      userName: bench.user.name,
      createdAt: bench.createdAt.toISOString(),
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create bench' }, { status: 500 });
  }
}
