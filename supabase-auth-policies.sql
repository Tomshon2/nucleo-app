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
