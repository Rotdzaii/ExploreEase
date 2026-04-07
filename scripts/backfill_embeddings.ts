#!/usr/bin/env ts-node

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding } from '../src/services/aiService';

type CategoryRelation =
  | { name?: string | null }
  | Array<{ name?: string | null }>
  | null
  | undefined;

type DestinationRow = {
  id: string | number;
  name?: string | null;
  location?: string | null;
  description?: string | null;
  categories?: CategoryRelation;
};

const EMBEDDING_DIMENSION = 384;
const FETCH_PAGE_SIZE = 200;
const EMBEDDING_DELAY_MS = 160;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const getEnv = (key: string): string => String(process.env[key] ?? '').trim();

const getSupabaseCredentials = () => {
  const url = getEnv('EXPO_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = getEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');

  if (!url) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL environment variable.');
  }

  const key = serviceRoleKey || anonKey;
  if (!key) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (preferred) or EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  }

  if (!serviceRoleKey) {
    console.warn('[warning] Using anon key. Updates may fail due to RLS. Prefer SUPABASE_SERVICE_ROLE_KEY for backfill scripts.');
  }

  return { url, key };
};

const extractCategoryName = (categories: CategoryRelation): string => {
  if (!categories) return '';

  if (Array.isArray(categories)) {
    const first = categories[0];
    return String(first?.name ?? '').trim();
  }

  return String(categories.name ?? '').trim();
};

const buildRichText = (row: DestinationRow): string => {
  const name = String(row.name ?? '').trim();
  const location = String(row.location ?? '').trim();
  const description = String(row.description ?? '').trim();
  const categoryName = extractCategoryName(row.categories);

  const segments = [
    name ? `Destination: ${name}` : '',
    location ? `Location: ${location}` : '',
    categoryName ? `Category: ${categoryName}` : '',
    description ? `Description: ${description}` : '',
  ].filter(Boolean);

  return segments.join('\n');
};

const toVectorLiteral = (values: number[]): string => {
  if (values.length !== EMBEDDING_DIMENSION) {
    throw new Error(
      `Embedding length mismatch. Expected ${EMBEDDING_DIMENSION}, received ${values.length}.`
    );
  }

  const normalized = values.map((value) => {
    if (!Number.isFinite(value)) return 0;
    return Number(value.toFixed(8));
  });

  return `[${normalized.join(',')}]`;
};

const fetchAllDestinationsMissingEmbedding = async (
  supabase: SupabaseClient<any, 'public', any, any, any>
): Promise<DestinationRow[]> => {
  const rows: DestinationRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('destinations')
      .select('id, name, location, description, categories(name)')
      .is('embedding', null)
      .order('id', { ascending: true })
      .range(offset, offset + FETCH_PAGE_SIZE - 1);

    if (error) throw error;

    const chunk = (data ?? []) as DestinationRow[];
    if (chunk.length === 0) break;

    rows.push(...chunk);
    offset += chunk.length;

    if (chunk.length < FETCH_PAGE_SIZE) break;
  }

  return rows;
};

async function main() {
  const { url, key } = getSupabaseCredentials();
  const supabase = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  console.log('[start] Loading destinations with NULL embeddings...');
  const pendingRows = await fetchAllDestinationsMissingEmbedding(supabase);

  if (pendingRows.length === 0) {
    console.log('[done] No destinations need backfill.');
    return;
  }

  console.log(`[info] Found ${pendingRows.length} destination(s) to backfill.`);

  let successCount = 0;
  let failedCount = 0;

  for (let i = 0; i < pendingRows.length; i += 1) {
    const row = pendingRows[i];
    const destinationId = String(row.id ?? '').trim();

    if (!destinationId) {
      failedCount += 1;
      console.error(`[${i + 1}/${pendingRows.length}] Skipped row with invalid id.`);
      continue;
    }

    const richText = buildRichText(row);
    if (!richText) {
      failedCount += 1;
      console.error(`[${i + 1}/${pendingRows.length}] Destination ${destinationId} has no usable text.`);
      continue;
    }

    try {
      const embedding = await generateEmbedding(richText);
      const vectorLiteral = toVectorLiteral(embedding);

      const { error: updateError } = await supabase
        .from('destinations')
        .update({ embedding: vectorLiteral })
        .eq('id', row.id);

      if (updateError) throw updateError;

      successCount += 1;
      console.log(`[${i + 1}/${pendingRows.length}] Updated destination ${destinationId}`);
    } catch (err: any) {
      failedCount += 1;
      console.error(
        `[${i + 1}/${pendingRows.length}] Failed destination ${destinationId}: ${err?.message ?? err}`
      );
    }

    await sleep(EMBEDDING_DELAY_MS);
  }

  console.log(`[done] Backfill complete. Success: ${successCount}, Failed: ${failedCount}`);

  if (failedCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[fatal] backfill_embeddings failed:', err);
  process.exitCode = 1;
});
