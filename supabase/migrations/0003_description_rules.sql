-- Control — de/para de nomes do extrato
-- Execute no Supabase depois da 0002: SQL Editor > New query > cole este arquivo > Run.

-- Texto original do banco, normalizado (minúsculas, sem acentos e pontuação).
-- Guardado na importação para as regras poderem renomear lançamentos já importados.
alter table transactions add column if not exists bank_text text;
alter table transactions drop constraint if exists bank_text_length;
alter table transactions add constraint bank_text_length check (bank_text is null or length(bank_text) <= 200);

-- "Quando o extrato contiver <pattern>, chamar de <rename_to> (e usar a categoria)".
create table if not exists description_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  pattern     text not null check (pattern ~ '^[a-z0-9 ]{3,120}$'),
  rename_to   text not null check (length(trim(rename_to)) between 1 and 80),
  category_id uuid references categories on delete set null,
  created_at  timestamptz not null default now(),
  unique (user_id, pattern)
);

alter table description_rules enable row level security;
drop policy if exists owner_all on description_rules;
create policy owner_all on description_rules for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop trigger if exists description_rules_owner on description_rules;
create trigger description_rules_owner before insert or update on description_rules
  for each row execute function assert_same_owner();
