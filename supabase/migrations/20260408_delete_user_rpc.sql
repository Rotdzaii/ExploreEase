-- GDPR: allow authenticated users to delete their own account.
-- SECURITY DEFINER is required because auth.users is not directly writable by regular clients.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Defensive cleanup in case profiles FK is not ON DELETE CASCADE in some environments.
  delete from public.profiles where id = v_user_id;

  -- Main delete: this removes the auth user and cascades dependent data where FK is configured.
  delete from auth.users where id = v_user_id;
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
