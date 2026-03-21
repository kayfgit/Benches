import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user ? (session.user as Record<string, unknown>).id as string : null;

    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode'); // 'top' | 'region' | undefined (all)
    const minLat = searchParams.get('minLat');
    const maxLat = searchParams.get('maxLat');
    const minLng = searchParams.get('minLng');
    const maxLng = searchParams.get('maxLng');

    // Build query based on mode
    let whereClause = {};
    let orderByClause: any = { createdAt: 'desc' };
    let takeLimit: number | undefined = undefined;

    if (mode === 'top') {
      // Fetch top 10 globally by vote count (we'll compute votes after)
      // For now, just fetch all and sort client-side, but limit for efficiency
      takeLimit = 50; // Get top 50 to ensure we have enough after vote calculation
    } else if (mode === 'region' && minLat && maxLat && minLng && maxLng) {
      // Fetch benches within bounding box
      whereClause = {
        latitude: {
          gte: parseFloat(minLat),
          lte: parseFloat(maxLat),
        },
        longitude: {
          gte: parseFloat(minLng),
          lte: parseFloat(maxLng),
        },
      };
    }

    const benches = await prisma.bench.findMany({
      where: whereClause,
      include: {
        photos: true,
        user: { select: { username: true } },
        votes: true,
        comments: true,
      },
      orderBy: orderByClause,
      take: takeLimit,
    });

    let formatted = benches.map((b) => {
      const voteCount = b.votes.reduce((sum, v) => sum + v.value, 0);
      const userVote = userId ? b.votes.find(v => v.userId === userId)?.value || 0 : 0;

      return {
        id: b.id,
        name: b.name,
        description: b.description,
        directions: b.directions,
        latitude: b.latitude,
        longitude: b.longitude,
        country: b.country,
        altitude: b.altitude,
        photos: b.photos,
        userId: b.userId,
        userName: b.user.username,
        createdAt: b.createdAt.toISOString(),
        voteCount,
        userVote,
        commentCount: b.comments.length,
      };
    });

    // For 'top' mode, sort by votes and return top 10
    if (mode === 'top') {
      formatted = formatted
        .sort((a, b) => b.voteCount - a.voteCount)
        .slice(0, 10);
    }

    return NextResponse.json(formatted);
  } catch (error) {
    console.error('GET /api/benches error:', error);
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
    const { name, description, directions, latitude, longitude, country, altitude, photoUrls } = await request.json();

    if (!name || !description || latitude == null || longitude == null) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const bench = await prisma.bench.create({
      data: {
        name,
        description,
        directions: directions || '',
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
        user: { select: { username: true } },
      },
    });

    return NextResponse.json({
      id: bench.id,
      name: bench.name,
      description: bench.description,
      directions: bench.directions,
      latitude: bench.latitude,
      longitude: bench.longitude,
      country: bench.country,
      altitude: bench.altitude,
      photos: bench.photos,
      userId: bench.userId,
      userName: bench.user.username,
      createdAt: bench.createdAt.toISOString(),
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/benches error:', error);
    return NextResponse.json({ error: 'Failed to create bench' }, { status: 500 });
  }
}
