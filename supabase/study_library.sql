-- Referencia para aplicar en el proyecto Supabase cuando se autorice la sincronización remota.
-- No se ejecuta automáticamente en el entorno local.
create table if not exists public.study_library (
    user_id uuid not null references auth.users(id) on delete cascade,
    id text not null,
    kind text not null check (kind in ('doctoria', 'guia', 'simulacion')),
    title text not null,
    topic text not null,
    topic_key text not null,
    payload jsonb not null,
    created_at timestamptz not null,
    last_viewed_at timestamptz not null,
    view_count integer not null default 1 check (view_count > 0),
    is_favorite boolean not null default false,
    version integer not null default 1,
    primary key (user_id, id)
);

create index if not exists study_library_recent_idx
    on public.study_library (user_id, last_viewed_at desc);

create index if not exists study_library_kind_idx
    on public.study_library (user_id, kind, last_viewed_at desc);

alter table public.study_library enable row level security;

grant select, insert, update, delete on public.study_library to authenticated;

drop policy if exists "study_library_select_own" on public.study_library;
create policy "study_library_select_own"
    on public.study_library for select
    to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "study_library_insert_own" on public.study_library;
create policy "study_library_insert_own"
    on public.study_library for insert
    to authenticated
    with check ((select auth.uid()) = user_id);

drop policy if exists "study_library_update_own" on public.study_library;
create policy "study_library_update_own"
    on public.study_library for update
    to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

drop policy if exists "study_library_delete_own" on public.study_library;
create policy "study_library_delete_own"
    on public.study_library for delete
    to authenticated
    using ((select auth.uid()) = user_id);
