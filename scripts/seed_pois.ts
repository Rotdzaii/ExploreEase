#!/usr/bin/env ts-node
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { generateEmbedding } from '../src/services/aiService';

const EMBEDDING_DIMENSION = 384;
const EMBEDDING_DELAY_MS = 220;

type SeedPoi = {
  name: string;
  city: 'Nha Trang' | 'Da Nang';
  category: 'Culture' | 'Nature' | 'Food' | 'Adventure';
  description: string;
  latitude: number;
  longitude: number;
  image_url: string;
};

type CategoryRow = {
  id: string | number;
  name?: string | null;
};

const POIS: SeedPoi[] = [
  {
    name: 'Thap Ba Ponagar',
    city: 'Nha Trang',
    category: 'Culture',
    description:
      'Ancient Cham temple complex on a hill above the Cai River with historic architecture, incense rituals, and panoramic city views that feel calm at sunrise.',
    latitude: 12.2659,
    longitude: 109.1954,
    image_url:
      'https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: 'Long Son Pagoda',
    city: 'Nha Trang',
    category: 'Culture',
    description:
      'Buddhist pagoda known for its giant white seated Buddha and stairway viewpoint, ideal for reflective walks and quiet moments away from beach crowds.',
    latitude: 12.2452,
    longitude: 109.1836,
    image_url:
      'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: 'Hon Chong Promontory',
    city: 'Nha Trang',
    category: 'Nature',
    description:
      'Rocky coastline with stacked granite formations and open sea breeze, a quiet place for sunset photography, ocean soundscapes, and gentle evening walks.',
    latitude: 12.2779,
    longitude: 109.2022,
    image_url:
      'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: 'Nha Trang Beach',
    city: 'Nha Trang',
    category: 'Nature',
    description:
      'Long urban beach with soft sand, clear morning light, and calm water suitable for jogging, swimming, and relaxing sunrise views before the day gets busy.',
    latitude: 12.2388,
    longitude: 109.1967,
    image_url:
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: 'Dam Market',
    city: 'Nha Trang',
    category: 'Food',
    description:
      'Local market with seafood snacks, dried specialties, and street-food stalls where travelers can taste regional flavors and observe everyday trading culture.',
    latitude: 12.2542,
    longitude: 109.1898,
    image_url:
      'https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: 'Institute of Oceanography',
    city: 'Nha Trang',
    category: 'Nature',
    description:
      'Marine science museum featuring preserved sea species, coral exhibits, and educational displays that help visitors understand local biodiversity and coastal ecosystems.',
    latitude: 12.2069,
    longitude: 109.2147,
    image_url:
      'https://images.unsplash.com/photo-1493558103817-58b2924bce98?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: 'Ba Ho Waterfalls',
    city: 'Nha Trang',
    category: 'Adventure',
    description:
      'Three-tier waterfall trail with rock scrambling, natural pools, and forest paths, suitable for active travelers seeking light trekking and freshwater swimming.',
    latitude: 12.1613,
    longitude: 109.2243,
    image_url:
      'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: 'Ba Na Hills',
    city: 'Da Nang',
    category: 'Adventure',
    description:
      'Mountain resort reached by cable car with cool climate, hillside gardens, and elevated viewpoints that are popular for cloud scenery and family day trips.',
    latitude: 15.995,
    longitude: 107.9964,
    image_url:
      'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: 'Golden Bridge',
    city: 'Da Nang',
    category: 'Culture',
    description:
      'Iconic pedestrian bridge supported by giant stone-hand sculptures, famous for dramatic mountain panoramas and early-morning photography in soft light.',
    latitude: 15.9985,
    longitude: 107.9968,
    image_url:
      'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: 'Son Tra Peninsula',
    city: 'Da Nang',
    category: 'Nature',
    description:
      'Coastal peninsula with winding roads, jungle viewpoints, and sea-facing cliffs, recommended for sunrise rides and quiet lookout points over Da Nang Bay.',
    latitude: 16.1138,
    longitude: 108.2967,
    image_url:
      'https://images.unsplash.com/photo-1482192596544-9eb780fc7f66?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: 'Marble Mountains',
    city: 'Da Nang',
    category: 'Culture',
    description:
      'Cluster of limestone hills with cave temples, stone stairways, and historic pagodas blending natural geology with spiritual heritage and scenic overlooks.',
    latitude: 16.0037,
    longitude: 108.2648,
    image_url:
      'https://images.unsplash.com/photo-1526481280695-3c469f2f14f6?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: 'My Khe Beach',
    city: 'Da Nang',
    category: 'Nature',
    description:
      'Wide sandy beach with gentle waves, ideal for morning swimming, sunset walks, and relaxed oceanfront evenings close to the city center.',
    latitude: 16.0678,
    longitude: 108.2443,
    image_url:
      'https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: 'Dragon Bridge',
    city: 'Da Nang',
    category: 'Culture',
    description:
      'Modern landmark bridge shaped like a dragon, known for night illumination and weekend fire-and-water shows that create a vibrant urban riverfront atmosphere.',
    latitude: 16.0616,
    longitude: 108.2278,
    image_url:
      'https://images.unsplash.com/photo-1441716844725-09cedc13a4e7?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: 'Han Market',
    city: 'Da Nang',
    category: 'Food',
    description:
      'Central market with local snacks, noodle ingredients, and household goods where visitors can explore authentic food culture and everyday city life.',
    latitude: 16.0721,
    longitude: 108.2237,
    image_url:
      'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1600&q=80',
  },
];

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  culture: ['culture', 'heritage', 'history', 'landmark', 'temple', 'museum', 'van hoa', 'lich su'],
  nature: ['nature', 'beach', 'mountain', 'waterfall', 'outdoor', 'sea', 'thien nhien'],
  food: ['food', 'market', 'street food', 'cuisine', 'seafood', 'am thuc'],
  adventure: ['adventure', 'hiking', 'trek', 'climb', 'explore', 'phieu luu'],
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const readEnv = (key: string) => String(process.env[key] ?? '').trim();

const removeDiacritics = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const normalizeText = (value: string) => removeDiacritics(String(value ?? '').trim().toLowerCase());

const toVectorLiteral = (values: number[]) => {
  if (values.length !== EMBEDDING_DIMENSION) {
    throw new Error(`Embedding size mismatch. Expected ${EMBEDDING_DIMENSION}, received ${values.length}.`);
  }

  const normalized = values.map((value) => (Number.isFinite(value) ? Number(value.toFixed(8)) : 0));
  return `[${normalized.join(',')}]`;
};

const getSupabaseCredentials = () => {
  const url = readEnv('EXPO_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = readEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');

  if (!url) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL.');
  }

  const key = serviceRoleKey || anonKey;
  if (!key) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  }

  if (!serviceRoleKey) {
    console.warn('[warning] Using anon key. Prefer SUPABASE_SERVICE_ROLE_KEY for seed scripts.');
  }

  return { url, key };
};

const resolveCategoryId = (category: string, categoryRows: CategoryRow[]): string | number | null => {
  if (!categoryRows.length) return null;

  const target = normalizeText(category);

  for (const row of categoryRows) {
    const rowName = normalizeText(row.name ?? '');
    if (rowName && rowName === target) return row.id;
  }

  const keywords = CATEGORY_KEYWORDS[target] ?? [target];
  for (const row of categoryRows) {
    const rowName = normalizeText(row.name ?? '');
    if (!rowName) continue;
    if (keywords.some((keyword) => rowName.includes(keyword))) {
      return row.id;
    }
  }

  return null;
};

const buildEmbeddingText = (poi: SeedPoi) => {
  return [
    `POI: ${poi.name}`,
    `City: ${poi.city}`,
    `Category: ${poi.category}`,
    `Description: ${poi.description}`,
  ].join('\n');
};

async function getDestinationColumns(
  supabase: SupabaseClient<any, 'public', any, any, any>
): Promise<Set<string>> {
  const infoQuery = await supabase
    .from('information_schema.columns')
    .select('column_name')
    .eq('table_schema', 'public')
    .eq('table_name', 'destinations');

  if (!infoQuery.error && Array.isArray(infoQuery.data) && infoQuery.data.length > 0) {
    return new Set(infoQuery.data.map((row: any) => String(row.column_name ?? '').trim()).filter(Boolean));
  }

  if (infoQuery.error) {
    console.warn('[warning] Could not read information_schema.columns:', infoQuery.error.message);
  }

  const probe = await supabase.from('destinations').select('*').limit(1);
  if (probe.error) {
    throw new Error(`Unable to inspect destinations table schema: ${probe.error.message}`);
  }

  const firstRow = (probe.data ?? [])[0] as Record<string, unknown> | undefined;
  if (firstRow) {
    return new Set(Object.keys(firstRow));
  }

  return new Set(['name', 'description', 'location', 'latitude', 'longitude', 'image_url', 'embedding']);
}

async function main() {
  const { url, key } = getSupabaseCredentials();

  const supabase = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const destinationColumns = await getDestinationColumns(supabase);

  const nameColumn = destinationColumns.has('name')
    ? 'name'
    : destinationColumns.has('title')
      ? 'title'
      : null;

  if (!nameColumn) {
    throw new Error('destinations table must contain either name or title column.');
  }

  let categoryRows: CategoryRow[] = [];
  if (destinationColumns.has('category_id')) {
    const categoryQuery = await supabase.from('categories').select('id, name');
    if (categoryQuery.error) {
      console.warn('[warning] Could not load categories:', categoryQuery.error.message);
    } else {
      categoryRows = (categoryQuery.data ?? []) as CategoryRow[];
    }
  }

  let insertedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  if (!process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim() && !process.env.GEMINI_API_KEY?.trim()) {
    throw new Error(
      'Missing Gemini API key. Set EXPO_PUBLIC_GEMINI_API_KEY (or GEMINI_API_KEY) before running scripts/seed_pois.ts.'
    );
  }

  for (let i = 0; i < POIS.length; i += 1) {
    const poi = POIS[i];

    try {
      let existsQuery = supabase
        .from('destinations')
        .select('id')
        .eq(nameColumn, poi.name)
        .limit(1);

      if (destinationColumns.has('location')) {
        existsQuery = existsQuery.ilike('location', `%${poi.city}%`);
      }

      const existing = await existsQuery;
      if (existing.error) {
        throw existing.error;
      }

      if ((existing.data ?? []).length > 0) {
        skippedCount += 1;
        console.log(`[${i + 1}/${POIS.length}] Skipped existing: ${poi.name}`);
        continue;
      }

      const embeddingText = buildEmbeddingText(poi);
      const embedding = await generateEmbedding(embeddingText);
      const vectorLiteral = toVectorLiteral(embedding);

      const payload: Record<string, unknown> = {
        [nameColumn]: poi.name,
      };

      if (destinationColumns.has('city')) payload.city = poi.city;
      if (destinationColumns.has('location')) payload.location = `${poi.city}, Vietnam`;
      if (destinationColumns.has('category')) payload.category = poi.category;
      if (destinationColumns.has('description')) payload.description = poi.description;
      if (destinationColumns.has('latitude')) payload.latitude = poi.latitude;
      if (destinationColumns.has('longitude')) payload.longitude = poi.longitude;
      if (destinationColumns.has('lat')) payload.lat = poi.latitude;
      if (destinationColumns.has('lng')) payload.lng = poi.longitude;
      if (destinationColumns.has('image_url')) payload.image_url = poi.image_url;
      if (destinationColumns.has('embedding')) payload.embedding = vectorLiteral;
      if (destinationColumns.has('rating')) payload.rating = 4.7;
      if (destinationColumns.has('price')) payload.price = 0;
      if (destinationColumns.has('is_featured')) payload.is_featured = true;

      if (destinationColumns.has('category_id')) {
        const categoryId = resolveCategoryId(poi.category, categoryRows);
        if (categoryId != null) {
          payload.category_id = categoryId;
        }
      }

      const insertResult = await supabase.from('destinations').insert(payload);
      if (insertResult.error) {
        throw insertResult.error;
      }

      insertedCount += 1;
      console.log(`[${i + 1}/${POIS.length}] Inserted: ${poi.name}`);
    } catch (error: any) {
      failedCount += 1;
      console.error(`[${i + 1}/${POIS.length}] Failed ${poi.name}:`, error?.message ?? error);
    }

    await sleep(EMBEDDING_DELAY_MS);
  }

  console.log(`[done] Seed complete. Inserted: ${insertedCount}, Skipped: ${skippedCount}, Failed: ${failedCount}`);

  if (failedCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[fatal] seed_pois failed:', error);
  process.exitCode = 1;
});
