import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const BENCHES = [
  {
    name: 'Hallstatt Lakeside Bench',
    description:
      'A weathered wooden bench overlooking the mirror-still waters of Hallstattersee, with the iconic pastel village and towering Dachstein mountains reflected in the lake. Best visited at dawn when mist rises off the water.',
    latitude: 47.5622,
    longitude: 13.6493,
    country: 'Austria',
    altitude: 511,
  },
  {
    name: 'Cinque Terre Cliff Bench',
    description:
      'Perched on the Via dell\'Amore cliffside trail between Riomaggiore and Manarola, this stone bench offers a vertigo-inducing view of the turquoise Ligurian Sea crashing against colorful clifftop villages.',
    latitude: 44.0993,
    longitude: 9.7275,
    country: 'Italy',
    altitude: 120,
  },
  {
    name: 'Trolltunga Summit Seat',
    description:
      'A natural rock ledge at the tip of Trolltunga (Troll\'s Tongue), jutting 700 meters above Lake Ringedalsvatnet. The 12-hour round trip hike rewards you with one of Norway\'s most dramatic panoramas.',
    latitude: 60.124,
    longitude: 6.74,
    country: 'Norway',
    altitude: 1180,
  },
  {
    name: 'Lake Bled Island View',
    description:
      'A simple bench on the northern shore of Lake Bled, perfectly framed to capture the fairy-tale island church, medieval cliff castle, and the Julian Alps rising behind. Magical in autumn foliage.',
    latitude: 46.3688,
    longitude: 14.0803,
    country: 'Slovenia',
    altitude: 475,
  },
  {
    name: 'Signal Hill Sunset Bench',
    description:
      'At the summit of Signal Hill, this bench faces Table Mountain\'s dramatic flat top on one side and the vast Atlantic on the other. The sunset paints the mountain in layers of gold, pink, and violet.',
    latitude: -33.9235,
    longitude: 18.3896,
    country: 'South Africa',
    altitude: 350,
  },
  {
    name: 'Lake Louise Viewpoint',
    description:
      'A red Adirondack chair near the Chateau, facing the impossibly turquoise Lake Louise backed by Victoria Glacier and the soaring Canadian Rockies. The color of the water defies belief.',
    latitude: 51.4254,
    longitude: -116.1773,
    country: 'Canada',
    altitude: 1731,
  },
  {
    name: 'Queenstown Skyline Bench',
    description:
      'A wooden bench at the Skyline gondola summit overlooking Queenstown, the Remarkables mountain range, and the serpentine Lake Wakatipu. Paragliders drift past at eye level.',
    latitude: -45.0312,
    longitude: 168.6626,
    country: 'New Zealand',
    altitude: 790,
  },
  {
    name: 'Amalfi Coast Terrace',
    description:
      'A tiled ceramic bench on a terraced lemon grove above Positano, with cascading white buildings tumbling down to the Mediterranean. The scent of lemon blossoms fills the warm air.',
    latitude: 40.634,
    longitude: 14.4845,
    country: 'Italy',
    altitude: 280,
  },
  {
    name: 'Arashiyama Bamboo Rest',
    description:
      'A moss-covered stone bench hidden within Kyoto\'s towering bamboo grove. Shafts of light filter through the canopy, and the bamboo creaks softly in the wind. Utterly serene.',
    latitude: 35.017,
    longitude: 135.6713,
    country: 'Japan',
    altitude: 68,
  },
  {
    name: 'Grindelwald Valley Bench',
    description:
      'A hand-carved bench on a wildflower meadow below the Eiger North Face. The sheer limestone wall towers 1,800 meters above, and distant cowbells echo across the valley.',
    latitude: 46.6244,
    longitude: 8.0413,
    country: 'Switzerland',
    altitude: 1034,
  },
  {
    name: 'Santorini Caldera Bench',
    description:
      'A whitewashed stone bench in Oia, facing the vast volcanic caldera as the sun sinks into the Aegean. The blue-domed churches glow amber, and the sky erupts in color.',
    latitude: 36.4618,
    longitude: 25.3763,
    country: 'Greece',
    altitude: 150,
  },
  {
    name: 'Patagonia Glacier Bench',
    description:
      'A wind-battered bench at Mirador Los Glaciares in El Chalten, facing the jagged granite spires of Fitz Roy. When clouds part to reveal the peak, it takes your breath away.',
    latitude: -49.2715,
    longitude: -72.9436,
    country: 'Argentina',
    altitude: 850,
  },
];

async function main() {
  console.log('Seeding database...');

  // Create demo user
  const hashedPw = await bcrypt.hash('demo1234', 12);
  const user = await prisma.user.upsert({
    where: { email: 'demo@benchfinder.com' },
    update: {},
    create: {
      email: 'demo@benchfinder.com',
      name: 'Trail Scout',
      password: hashedPw,
    },
  });

  console.log(`Created user: ${user.email}`);

  // Create benches
  for (const bench of BENCHES) {
    const existing = await prisma.bench.findFirst({
      where: { name: bench.name },
    });
    if (existing) {
      console.log(`  Skipping existing: ${bench.name}`);
      continue;
    }

    await prisma.bench.create({
      data: {
        ...bench,
        userId: user.id,
        photos: {
          create: [
            {
              url: `https://picsum.photos/seed/${encodeURIComponent(bench.name.toLowerCase().replace(/\s+/g, '-'))}/800/600`,
            },
          ],
        },
      },
    });
    console.log(`  Created: ${bench.name}`);
  }

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
