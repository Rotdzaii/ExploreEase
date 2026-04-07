-- Seed data for Sprint 1: Social & Messaging
-- Requires schema migration: 20260407_social_messaging_schema.sql
-- This script is idempotent for seeded records (safe to re-run).

create extension if not exists pgcrypto;

do $$
declare
  user_ids uuid[];
  u1 uuid;
  u2 uuid;
  u3 uuid;
  u4 uuid;

  destination_target text;
  event_target text;
  review_target text;
  bookmark_target text;
  bookmark_target_type text := 'destination';

  event_id_for_group uuid;

  direct_conversation_id uuid := '4c9f27b4-2f08-4d15-9d96-7df1b3610001';
  group_conversation_id uuid := '4c9f27b4-2f08-4d15-9d96-7df1b3610002';
begin
  -- Pick a few existing users as seed actors.
  select array_agg(id order by created_at asc)
  into user_ids
  from (
    select id, created_at
    from auth.users
    order by created_at asc
    limit 8
  ) as seed_users;

  if user_ids is null or array_length(user_ids, 1) < 2 then
    raise notice 'Seed social/messaging skipped: need at least 2 users in auth.users.';
    return;
  end if;

  u1 := user_ids[1];
  u2 := user_ids[2];
  u3 := user_ids[3];
  u4 := user_ids[4];

  -- Resolve realistic activity targets from existing app data.
  if to_regclass('public.destinations') is not null then
    execute 'select id::text from public.destinations order by created_at desc nulls last, id desc limit 1'
      into destination_target;
  end if;

  if to_regclass('public.events') is not null then
    select id
    into event_id_for_group
    from public.events
    order by created_at desc nulls last, id desc
    limit 1;

    if event_id_for_group is not null then
      event_target := event_id_for_group::text;
    end if;
  end if;

  if to_regclass('public.reviews') is not null then
    execute 'select id::text from public.reviews order by created_at desc nulls last, id desc limit 1'
      into review_target;
  end if;

  if event_target is not null then
    bookmark_target := event_target;
    bookmark_target_type := 'event';
  elsif destination_target is not null then
    bookmark_target := destination_target;
    bookmark_target_type := 'destination';
  elsif review_target is not null then
    bookmark_target := review_target;
    bookmark_target_type := 'review';
  else
    bookmark_target := 'seed-target';
    bookmark_target_type := 'destination';
  end if;

  -- =========================================================
  -- 1) Follows: connect users to each other
  -- =========================================================
  insert into public.follows (follower_id, following_id, created_at)
  values
    (u1, u2, now() - interval '5 days'),
    (u2, u1, now() - interval '5 days')
  on conflict (follower_id, following_id) do nothing;

  if u3 is not null then
    insert into public.follows (follower_id, following_id, created_at)
    values
      (u1, u3, now() - interval '4 days'),
      (u3, u1, now() - interval '4 days'),
      (u2, u3, now() - interval '3 days')
    on conflict (follower_id, following_id) do nothing;
  end if;

  if u4 is not null and u3 is not null then
    insert into public.follows (follower_id, following_id, created_at)
    values
      (u4, u1, now() - interval '2 days'),
      (u4, u2, now() - interval '2 days'),
      (u3, u4, now() - interval '1 day')
    on conflict (follower_id, following_id) do nothing;
  end if;

  -- =========================================================
  -- 2) Messaging: one direct + one group conversation
  -- =========================================================
  insert into public.conversations (id, type, event_id, created_at)
  values (direct_conversation_id, 'direct', null, now() - interval '2 days')
  on conflict (id) do update
  set type = excluded.type,
      event_id = excluded.event_id;

  insert into public.conversations (id, type, event_id, created_at)
  values (group_conversation_id, 'group', event_id_for_group, now() - interval '1 day')
  on conflict (id) do update
  set type = excluded.type,
      event_id = excluded.event_id;

  -- Reset participants for seeded conversations to keep reruns clean.
  delete from public.conversation_participants
  where conversation_id in (direct_conversation_id, group_conversation_id);

  -- Direct thread participants
  insert into public.conversation_participants (conversation_id, user_id, joined_at)
  values
    (direct_conversation_id, u1, now() - interval '2 days'),
    (direct_conversation_id, u2, now() - interval '2 days');

  -- Group chat participants
  insert into public.conversation_participants (conversation_id, user_id, joined_at)
  values
    (group_conversation_id, u1, now() - interval '1 day'),
    (group_conversation_id, u2, now() - interval '1 day');

  if u3 is not null then
    insert into public.conversation_participants (conversation_id, user_id, joined_at)
    values (group_conversation_id, u3, now() - interval '23 hours');
  end if;

  if u4 is not null then
    insert into public.conversation_participants (conversation_id, user_id, joined_at)
    values (group_conversation_id, u4, now() - interval '22 hours');
  end if;

  -- Reset seeded messages in seeded conversations.
  delete from public.messages
  where conversation_id in (direct_conversation_id, group_conversation_id);

  -- Direct chat realistic messages
  insert into public.messages (id, conversation_id, sender_id, content_type, content_text, media_url, created_at)
  values
    ('4c9f27b4-2f08-4d15-9d96-7df1b3611001', direct_conversation_id, u1, 'text', 'Hey, are you free this weekend for a quick city walk?', null, now() - interval '40 hours'),
    ('4c9f27b4-2f08-4d15-9d96-7df1b3611002', direct_conversation_id, u2, 'text', 'Yes! I am thinking about Ben Thanh Market first.', null, now() - interval '39 hours'),
    ('4c9f27b4-2f08-4d15-9d96-7df1b3611003', direct_conversation_id, u1, 'text', 'Great. Let us meet at 8:30 near the main gate.', null, now() - interval '38 hours')
  on conflict (id) do update
  set content_text = excluded.content_text,
      created_at = excluded.created_at;

  -- Group chat realistic messages
  insert into public.messages (id, conversation_id, sender_id, content_type, content_text, media_url, created_at)
  values
    ('4c9f27b4-2f08-4d15-9d96-7df1b3612001', group_conversation_id, u1, 'text', 'Welcome everyone! Let us finalize our trip schedule.', null, now() - interval '20 hours'),
    ('4c9f27b4-2f08-4d15-9d96-7df1b3612002', group_conversation_id, u2, 'text', 'I can do Saturday morning. Should we start with coffee then museum?', null, now() - interval '19 hours'),
    ('4c9f27b4-2f08-4d15-9d96-7df1b3612003', group_conversation_id, coalesce(u3, u2), 'text', 'Sounds good. I will book tickets tonight.', null, now() - interval '18 hours'),
    ('4c9f27b4-2f08-4d15-9d96-7df1b3612004', group_conversation_id, u1, 'text', 'Perfect. I will share the route and budget in this chat.', null, now() - interval '17 hours')
  on conflict (id) do update
  set content_text = excluded.content_text,
      created_at = excluded.created_at;

  -- =========================================================
  -- 3) Activities: fake feed entries
  -- =========================================================
  if destination_target is not null then
    insert into public.activities (id, user_id, action_type, target_id, target_type, created_at)
    values (
      '4c9f27b4-2f08-4d15-9d96-7df1b3613001',
      u1,
      'review',
      destination_target,
      'destination',
      now() - interval '16 hours'
    )
    on conflict (id) do update
    set user_id = excluded.user_id,
        target_id = excluded.target_id,
        target_type = excluded.target_type,
        created_at = excluded.created_at;
  end if;

  insert into public.activities (id, user_id, action_type, target_id, target_type, created_at)
  values (
    '4c9f27b4-2f08-4d15-9d96-7df1b3613002',
    u2,
    'bookmark',
    bookmark_target,
    bookmark_target_type,
    now() - interval '15 hours'
  )
  on conflict (id) do update
  set user_id = excluded.user_id,
      target_id = excluded.target_id,
      target_type = excluded.target_type,
      created_at = excluded.created_at;

  if event_target is not null and u3 is not null then
    insert into public.activities (id, user_id, action_type, target_id, target_type, created_at)
    values (
      '4c9f27b4-2f08-4d15-9d96-7df1b3613003',
      u3,
      'attend_event',
      event_target,
      'event',
      now() - interval '14 hours'
    )
    on conflict (id) do update
    set user_id = excluded.user_id,
        target_id = excluded.target_id,
        target_type = excluded.target_type,
        created_at = excluded.created_at;
  end if;

  insert into public.activities (id, user_id, action_type, target_id, target_type, created_at)
  values (
    '4c9f27b4-2f08-4d15-9d96-7df1b3613004',
    u1,
    'follow',
    u2::text,
    'user',
    now() - interval '13 hours'
  )
  on conflict (id) do update
  set user_id = excluded.user_id,
      target_id = excluded.target_id,
      target_type = excluded.target_type,
      created_at = excluded.created_at;

  insert into public.activities (id, user_id, action_type, target_id, target_type, created_at)
  values (
    '4c9f27b4-2f08-4d15-9d96-7df1b3613005',
    u2,
    'message',
    direct_conversation_id::text,
    'conversation',
    now() - interval '12 hours'
  )
  on conflict (id) do update
  set user_id = excluded.user_id,
      target_id = excluded.target_id,
      target_type = excluded.target_type,
      created_at = excluded.created_at;

  insert into public.activities (id, user_id, action_type, target_id, target_type, created_at)
  values (
    '4c9f27b4-2f08-4d15-9d96-7df1b3613006',
    coalesce(u3, u1),
    'message',
    group_conversation_id::text,
    'conversation',
    now() - interval '11 hours'
  )
  on conflict (id) do update
  set user_id = excluded.user_id,
      target_id = excluded.target_id,
      target_type = excluded.target_type,
      created_at = excluded.created_at;

  raise notice 'Seed social/messaging complete. Users seeded: %, %, %, %', u1, u2, u3, u4;
end
$$;