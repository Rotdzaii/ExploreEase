-- Seed more realistic Vietnam destinations for discovery/home screens.
-- Safe behavior:
-- - Inserts only when destination name does not already exist (case-insensitive).
-- - Auto-links category_id to the closest existing category name when available.
-- - Works whether the destination title column is name (current app) or title.

do $$
declare
  destination_title_col text;
  has_category_id boolean;
  has_is_featured boolean;
  insert_columns text;
  insert_values text;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'destinations'
      and column_name = 'name'
  ) then
    destination_title_col := 'name';
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'destinations'
      and column_name = 'title'
  ) then
    destination_title_col := 'title';
  else
    raise exception 'public.destinations must have either a name or title column.';
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'destinations'
      and column_name = 'category_id'
  ) into has_category_id;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'destinations'
      and column_name = 'is_featured'
  ) into has_is_featured;

  insert_columns := format(
    '%I, description, location, latitude, longitude, rating, price, image_url',
    destination_title_col
  );
  insert_values :=
    's.title, s.description, s.location, s.latitude, s.longitude, s.rating, s.price, s.image_url';

  if has_category_id then
    insert_columns := insert_columns || ', category_id';
    insert_values := insert_values || ', s.category_id';
  end if;

  if has_is_featured then
    insert_columns := insert_columns || ', is_featured';
    insert_values := insert_values || ', s.is_featured';
  end if;

  execute format(
    $sql$
      with seed_base as (
        select *
        from (
          values
            ('Ha Long Bay', 'UNESCO World Heritage seascape with limestone karsts, caves, and overnight cruises.', 'Ha Long, Quang Ninh', 20.9101, 107.1839, 850000::numeric, 'https://images.unsplash.com/photo-1488085061387-422e29b40080?auto=format&fit=crop&w=1600&q=80', 'nature', true),
            ('Hoi An Ancient Town', 'Historic riverside trading town with lantern-lit streets, heritage houses, and night markets.', 'Hoi An, Quang Nam', 15.8801, 108.3380, 120000::numeric, 'https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=1600&q=80', 'heritage', true),
            ('Ben Thanh Market', 'Iconic central market for local food, souvenirs, and cultural street-life in Ho Chi Minh City.', 'District 1, Ho Chi Minh City', 10.7720, 106.6983, 0::numeric, 'https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=1600&q=80', 'market', false),
            ('Fansipan Peak', 'Highest mountain in Indochina with cable car access, cloud views, and alpine trekking routes.', 'Sa Pa, Lao Cai', 22.3033, 103.7786, 800000::numeric, 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1600&q=80', 'mountain', true),
            ('Phu Quoc Island', 'Tropical island destination known for beaches, snorkeling, fishing villages, and sunsets.', 'Phu Quoc, Kien Giang', 10.2899, 103.9840, 300000::numeric, 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80', 'island', true),
            ('Trang An Landscape Complex', 'Scenic boat routes through karst valleys, caves, and temples in Ninh Binh.', 'Ninh Binh', 20.2506, 105.9745, 250000::numeric, 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1600&q=80', 'nature', true),
            ('Golden Bridge - Ba Na Hills', 'Famous pedestrian bridge held by giant stone hands with panoramic Da Nang mountain views.', 'Da Nang', 15.9950, 107.9964, 950000::numeric, 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1600&q=80', 'mountain', true),
            ('Hue Imperial City', 'Former Nguyen dynasty citadel featuring palaces, gates, and royal architecture.', 'Hue, Thua Thien Hue', 16.4637, 107.5909, 200000::numeric, 'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=1600&q=80', 'heritage', true),
            ('My Son Sanctuary', 'Ancient Cham temple complex surrounded by lush valleys and historic ruins.', 'Duy Xuyen, Quang Nam', 15.7735, 108.1237, 150000::numeric, 'https://images.unsplash.com/photo-1539650116574-75c0c6d73f3f?auto=format&fit=crop&w=1600&q=80', 'heritage', false),
            ('Xuan Huong Lake', 'Central highland lake in Da Lat with walking paths, cafés, and cool-weather scenery.', 'Da Lat, Lam Dong', 11.9404, 108.4419, 0::numeric, 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1600&q=80', 'city', false),
            ('Cat Ba Island', 'Gateway island to Lan Ha Bay with beaches, limestone cliffs, and kayaking spots.', 'Cat Hai, Hai Phong', 20.7278, 107.0469, 180000::numeric, 'https://images.unsplash.com/photo-1528181304800-259b08848526?auto=format&fit=crop&w=1600&q=80', 'island', false),
            ('Ba Be Lake', 'Large freshwater lake in a national park with caves, waterfalls, and ethnic village culture.', 'Ba Be, Bac Kan', 22.4101, 105.6196, 120000::numeric, 'https://images.unsplash.com/photo-1439066615861-d1af74d74000?auto=format&fit=crop&w=1600&q=80', 'nature', false),
            ('Con Dao Islands', 'Remote archipelago with pristine beaches, coral reefs, and protected marine life.', 'Con Dao, Ba Ria - Vung Tau', 8.6861, 106.6084, 400000::numeric, 'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1600&q=80', 'island', false),
            ('Mui Ne Sand Dunes', 'Coastal dunes with sunrise views, jeep rides, and nearby fishing village experiences.', 'Phan Thiet, Binh Thuan', 10.9385, 108.2845, 100000::numeric, 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80', 'nature', false),
            ('Hoan Kiem Lake', 'Historic lake and walking district in Hanoi with Ngoc Son Temple and weekend street activities.', 'Hoan Kiem, Hanoi', 21.0288, 105.8523, 0::numeric, 'https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=1600&q=80', 'city', true)
        ) as rows(title, description, location, latitude, longitude, price, image_url, category_hint, is_featured)
      ),
      seed_with_scores as (
        select
          b.*,
          round((4 + random())::numeric, 1) as rating,
          case
            when %s then coalesce(
              (
                select c.id
                from public.categories c
                where
                  (
                    b.category_hint = 'nature'
                    and lower(c.name) similar to '%%(nature|natural|park|landscape|outdoor|adventure)%%'
                  )
                  or (
                    b.category_hint = 'heritage'
                    and lower(c.name) similar to '%%(heritage|history|historical|culture|cultural|temple|museum)%%'
                  )
                  or (
                    b.category_hint = 'market'
                    and lower(c.name) similar to '%%(market|shopping|food|street)%%'
                  )
                  or (
                    b.category_hint = 'mountain'
                    and lower(c.name) similar to '%%(mountain|hiking|trek|nature)%%'
                  )
                  or (
                    b.category_hint = 'island'
                    and lower(c.name) similar to '%%(island|beach|sea|coast|water)%%'
                  )
                  or (
                    b.category_hint = 'city'
                    and lower(c.name) similar to '%%(city|urban|culture|shopping|food)%%'
                  )
                order by c.id
                limit 1
              ),
              (
                select c.id
                from public.categories c
                order by c.id
                limit 1
              )
            )
            else null
          end as category_id
        from seed_base b
      )
      insert into public.destinations (%s)
      select %s
      from seed_with_scores s
      where not exists (
        select 1
        from public.destinations d
        where lower(d.%I) = lower(s.title)
      );
    $sql$,
    case when has_category_id then 'true' else 'false' end,
    insert_columns,
    insert_values,
    destination_title_col
  );
end
$$;