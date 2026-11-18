-- 0008_ai_support.sql  (Milestone M8: AI assistant support tables)
-- See docs/memory.md and docs/guardrails.md. The AI never writes business data; it only
-- reads through the caller's JWT and may suggest memory items that a human confirms.

create table public.shop_memory (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references public.shops on delete cascade,
  kind       text not null check (kind in ('alias', 'preference', 'fact')),
  key        text not null check (char_length(key) between 1 and 80),
  value      text not null check (char_length(value) between 1 and 300),
  created_by uuid references auth.users,
  created_at timestamptz not null default now(),
  unique (shop_id, kind, key)
);
create index shop_memory_shop_idx on public.shop_memory (shop_id);

create table public.ai_usage (
  id            bigint generated always as identity primary key,
  shop_id       uuid not null references public.shops on delete cascade,
  user_id       uuid,
  agent         text not null check (agent in ('entry_parser', 'insights', 'reminder')),
  input_tokens  int,
  output_tokens int,
  ok            boolean,
  created_at    timestamptz not null default now()
);
create index ai_usage_shop_idx on public.ai_usage (shop_id, created_at desc);

alter table public.shop_memory enable row level security;
alter table public.ai_usage    enable row level security;

create policy memory_select on public.shop_memory for select to authenticated using (public.is_member(shop_id));
create policy memory_insert on public.shop_memory for insert to authenticated with check (public.is_member(shop_id));
create policy memory_update on public.shop_memory for update to authenticated
  using (public.is_member(shop_id)) with check (public.is_member(shop_id));
create policy memory_delete on public.shop_memory for delete to authenticated using (public.is_member(shop_id));

-- Owners can read usage; only the service role (Edge Functions) writes it.
create policy ai_usage_select on public.ai_usage for select to authenticated using (public.is_owner(shop_id));

grant select, delete on public.shop_memory to authenticated;
grant insert (shop_id, kind, key, value, created_by) on public.shop_memory to authenticated;
grant update (value) on public.shop_memory to authenticated;
grant select on public.ai_usage to authenticated;

-- 200 items per shop, and every change is audited.
create function public.shop_memory_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.shop_memory m where m.shop_id = new.shop_id) >= 200 then
      raise exception 'LIMIT_EXCEEDED' using errcode = 'P0001';
    end if;
    new.created_by := (select auth.uid());
    perform public.write_audit(new.shop_id, 'memory_created', 'shop_memory', new.id, jsonb_build_object('kind', new.kind));
    return new;
  elsif tg_op = 'UPDATE' then
    perform public.write_audit(new.shop_id, 'memory_edited', 'shop_memory', new.id, jsonb_build_object('kind', new.kind));
    return new;
  end if;
  if current_setting('app.shop_deletion', true) = 'on' then return old; end if;  -- whole shop is being deleted
  perform public.write_audit(old.shop_id, 'memory_deleted', 'shop_memory', old.id, jsonb_build_object('kind', old.kind));
  return old;
end $$;
create trigger shop_memory_guard_ins_upd before insert or update on public.shop_memory
  for each row execute function public.shop_memory_guard();
create trigger shop_memory_audit_del after delete on public.shop_memory
  for each row execute function public.shop_memory_guard();
