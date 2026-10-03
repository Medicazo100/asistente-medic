-- Esquema de la Biblioteca de Estudio Compartida para Supabase (AICLINIC)
-- Permite que cualquier dispositivo que abra el enlace vea los casos y articulos compartidos.

create table if not exists public.study_library (
    id text not null primary key,
    user_id text,
    kind text not null check (kind in ('doctoria', 'guia', 'simulacion', 'articulo', 'quiz')),
    title text not null,
    topic text not null,
    topic_key text not null,
    payload jsonb not null,
    created_at timestamptz not null default now(),
    last_viewed_at timestamptz not null default now(),
    view_count integer not null default 1 check (view_count > 0),
    is_favorite boolean not null default false,
    version integer not null default 1
);

create index if not exists study_library_recent_idx
    on public.study_library (last_viewed_at desc);

create index if not exists study_library_kind_idx
    on public.study_library (kind, last_viewed_at desc);

alter table public.study_library enable row level security;

-- Politicas para permitir lectura y guardado compartido entre dispositivos por el mismo enlace
drop policy if exists "study_library_select_public" on public.study_library;
create policy "study_library_select_public"
    on public.study_library for select
    to anon, authenticated
    using (true);

drop policy if exists "study_library_insert_public" on public.study_library;
create policy "study_library_insert_public"
    on public.study_library for insert
    to anon, authenticated
    with check (true);

drop policy if exists "study_library_update_public" on public.study_library;
create policy "study_library_update_public"
    on public.study_library for update
    to anon, authenticated
    using (true)
    with check (true);

grant select, insert, update on public.study_library to anon, authenticated;
