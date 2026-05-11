-- Run this in Supabase SQL Editor after creating your login users.
-- It replaces public anon access with logged-in Supabase Auth access.

drop policy if exists "permitir tudo cargos" on cargos;
drop policy if exists "permitir tudo colegas" on colegas;
drop policy if exists "permitir tudo tarefas" on tarefas;

drop policy if exists "authenticated full access cargos" on cargos;
drop policy if exists "authenticated full access colegas" on colegas;
drop policy if exists "authenticated full access tarefas" on tarefas;

create policy "authenticated full access cargos"
on cargos
for all
to authenticated
using (true)
with check (true);

create policy "authenticated full access colegas"
on colegas
for all
to authenticated
using (true)
with check (true);

create policy "authenticated full access tarefas"
on tarefas
for all
to authenticated
using (true)
with check (true);

create table if not exists tarefa_colegas (
  tarefa_id uuid not null references tarefas(id) on delete cascade,
  colega_id uuid not null references colegas(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tarefa_id, colega_id)
);

alter table tarefa_colegas enable row level security;

drop policy if exists "authenticated full access tarefa_colegas" on tarefa_colegas;

create policy "authenticated full access tarefa_colegas"
on tarefa_colegas
for all
to authenticated
using (true)
with check (true);

insert into tarefa_colegas (tarefa_id, colega_id)
select id, colega_id
from tarefas
where colega_id is not null
on conflict do nothing;

create table if not exists eventos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  data_evento date,
  colega_id uuid references colegas(id) on delete set null,
  concluido boolean not null default false,
  created_at timestamptz not null default now()
);

alter table eventos enable row level security;

drop policy if exists "authenticated full access eventos" on eventos;

create policy "authenticated full access eventos"
on eventos
for all
to authenticated
using (true)
with check (true);
