-- Control — configuração completa do banco
-- Gerado por `npm run db:bundle` a partir de supabase/migrations. Não edite à mão.
-- Cole TODO este conteúdo no Supabase (SQL Editor > New query) e clique em Run.
-- Pode ser executado de novo sem duplicar nada.

-- ======================================================================
-- 0001_schema.sql
-- ======================================================================
-- Control — schema inicial
-- Execute no Supabase: SQL Editor > New query > cole este arquivo > Run.
-- Todas as tabelas têm RLS: cada usuário só enxerga e altera os próprios dados.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
do $$ begin
  create type account_type as enum ('checking', 'savings', 'cash', 'investment', 'credit_card');
exception when duplicate_object then null; end $$;

do $$ begin
  create type category_kind as enum ('expense', 'income');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tx_type as enum ('expense', 'income', 'transfer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type recurrence_frequency as enum ('weekly', 'monthly', 'yearly');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Contas e cartões
-- ---------------------------------------------------------------------------
create table if not exists accounts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users on delete cascade,
  name             text not null check (length(trim(name)) between 1 and 60),
  type             account_type not null default 'checking',
  color            text not null default '#E3AE4A',
  initial_balance  numeric(14,2) not null default 0,
  -- Somente cartões de crédito
  credit_limit     numeric(14,2),
  closing_day      smallint check (closing_day between 1 and 31),
  due_day          smallint check (due_day between 1 and 31),
  include_in_total boolean not null default true,
  archived         boolean not null default false,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  constraint card_days_required check (
    type <> 'credit_card' or (closing_day is not null and due_day is not null)
  )
);
create index if not exists accounts_user_idx on accounts (user_id);

-- ---------------------------------------------------------------------------
-- Categorias
-- ---------------------------------------------------------------------------
create table if not exists categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 40),
  kind       category_kind not null,
  color      text not null default '#8B93A5',
  icon       text not null default 'circle',
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists categories_user_idx on categories (user_id);

-- ---------------------------------------------------------------------------
-- Recorrências (assinaturas, contas fixas, salário…)
-- ---------------------------------------------------------------------------
create table if not exists recurrences (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  description    text not null check (length(trim(description)) between 1 and 80),
  type           tx_type not null check (type <> 'transfer'),
  amount         numeric(14,2) not null check (amount > 0),
  account_id     uuid not null references accounts on delete cascade,
  category_id    uuid references categories on delete set null,
  frequency      recurrence_frequency not null default 'monthly',
  start_date     date not null,
  end_date       date,
  active         boolean not null default true,
  generated_until date,
  created_at     timestamptz not null default now(),
  constraint recurrence_dates check (end_date is null or end_date >= start_date)
);
create index if not exists recurrences_user_idx on recurrences (user_id);

-- ---------------------------------------------------------------------------
-- Lançamentos
-- Valores sempre positivos; o sinal vem do tipo.
-- Transferência: sai de account_id e entra em to_account_id.
-- invoice_month: 1º dia do mês de vencimento da fatura (só em cartões).
-- ---------------------------------------------------------------------------
create table if not exists transactions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users on delete cascade,
  type               tx_type not null,
  amount             numeric(14,2) not null check (amount > 0),
  date               date not null,
  description        text not null check (length(trim(description)) between 1 and 80),
  notes              text,
  account_id         uuid not null references accounts on delete cascade,
  to_account_id      uuid references accounts on delete cascade,
  category_id        uuid references categories on delete set null,
  paid               boolean not null default true,
  invoice_month      date,
  installment_group  uuid,
  installment_number smallint,
  installment_total  smallint,
  recurrence_id      uuid references recurrences on delete set null,
  created_at         timestamptz not null default now(),
  constraint transfer_target check (
    (type = 'transfer') = (to_account_id is not null)
    and (to_account_id is null or to_account_id <> account_id)
  ),
  constraint installment_consistency check (
    (installment_group is null and installment_number is null and installment_total is null)
    or (installment_group is not null and installment_number between 1 and installment_total
        and installment_total between 2 and 120)
  ),
  constraint invoice_month_first_day check (
    invoice_month is null or extract(day from invoice_month) = 1
  )
);
create index if not exists transactions_user_date_idx on transactions (user_id, date desc);
create index if not exists transactions_account_idx on transactions (account_id);
create index if not exists transactions_to_account_idx on transactions (to_account_id);
create index if not exists transactions_invoice_idx on transactions (account_id, invoice_month);
create index if not exists transactions_group_idx on transactions (installment_group);
create unique index if not exists transactions_recurrence_date_uq
  on transactions (recurrence_id, date) where recurrence_id is not null;

-- ---------------------------------------------------------------------------
-- Orçamentos: limite mensal por categoria de despesa
-- ---------------------------------------------------------------------------
create table if not exists budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  category_id uuid not null references categories on delete cascade,
  amount      numeric(14,2) not null check (amount > 0),
  created_at  timestamptz not null default now(),
  unique (user_id, category_id)
);

-- ---------------------------------------------------------------------------
-- Metas e aportes
-- ---------------------------------------------------------------------------
create table if not exists goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 60),
  target_amount numeric(14,2) not null check (target_amount > 0),
  target_date   date,
  color         text not null default '#E3AE4A',
  archived      boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists goal_contributions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  goal_id    uuid not null references goals on delete cascade,
  amount     numeric(14,2) not null check (amount <> 0),
  date       date not null default current_date,
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists goal_contributions_goal_idx on goal_contributions (goal_id);

-- ---------------------------------------------------------------------------
-- Integridade entre tabelas: referências precisam ser do mesmo usuário
-- ---------------------------------------------------------------------------
create or replace function assert_same_owner() returns trigger
language plpgsql security definer set search_path = public as $$
-- Uma função para várias tabelas: lê NEW como jsonb porque cada tabela tem colunas diferentes.
declare
  row jsonb := to_jsonb(new);
begin
  if row ? 'account_id' and not exists (
    select 1 from accounts where id = (row->>'account_id')::uuid and user_id = new.user_id) then
    raise exception 'Conta inválida';
  end if;
  if row->>'to_account_id' is not null and not exists (
    select 1 from accounts where id = (row->>'to_account_id')::uuid and user_id = new.user_id) then
    raise exception 'Conta de destino inválida';
  end if;
  if row->>'category_id' is not null and not exists (
    select 1 from categories where id = (row->>'category_id')::uuid and user_id = new.user_id) then
    raise exception 'Categoria inválida';
  end if;
  if row ? 'goal_id' and not exists (
    select 1 from goals where id = (row->>'goal_id')::uuid and user_id = new.user_id) then
    raise exception 'Meta inválida';
  end if;
  return new;
end $$;

drop trigger if exists transactions_owner on transactions;
create trigger transactions_owner before insert or update on transactions
  for each row execute function assert_same_owner();
drop trigger if exists recurrences_owner on recurrences;
create trigger recurrences_owner before insert or update on recurrences
  for each row execute function assert_same_owner();
drop trigger if exists budgets_owner on budgets;
create trigger budgets_owner before insert or update on budgets
  for each row execute function assert_same_owner();
drop trigger if exists goal_contributions_owner on goal_contributions;
create trigger goal_contributions_owner before insert or update on goal_contributions
  for each row execute function assert_same_owner();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['accounts','categories','recurrences','transactions','budgets','goals','goal_contributions']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists owner_all on %I', t);
    execute format(
      'create policy owner_all on %I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Saldos por conta (só lançamentos efetivados)
-- security_invoker: a view respeita o RLS de quem consulta.
-- Cartão: saldo negativo = valor devido.
-- ---------------------------------------------------------------------------
create or replace view account_balances with (security_invoker = true) as
select
  a.id as account_id,
  a.initial_balance
    + coalesce(sum(case
        when t.account_id = a.id and t.type = 'income' then t.amount
        when t.account_id = a.id and t.type in ('expense', 'transfer') then -t.amount
        when t.to_account_id = a.id and t.type = 'transfer' then t.amount
      end) filter (where t.paid), 0) as balance
from accounts a
left join transactions t on t.account_id = a.id or t.to_account_id = a.id
group by a.id;

-- ---------------------------------------------------------------------------
-- Gera ocorrências de recorrências até uma data (idempotente).
-- Ocorrências futuras nascem como pendentes.
-- ---------------------------------------------------------------------------
create or replace function generate_recurring(until date)
returns integer
language plpgsql security invoker set search_path = public as $$
declare
  r recurrences%rowtype;
  occ date;
  n integer;
  inserted integer := 0;
  step interval;
  limit_date date;
  card accounts%rowtype;
  inv date;
  rows_added integer;
begin
  for r in
    select * from recurrences
    where user_id = auth.uid() and active
      and start_date <= until
      and (generated_until is null or generated_until < least(until, coalesce(end_date, until)))
  loop
    step := case r.frequency
      when 'weekly' then interval '1 week'
      when 'monthly' then interval '1 month'
      else interval '1 year' end;
    limit_date := least(until, coalesce(r.end_date, until));
    select * into card from accounts where id = r.account_id;
    n := 0;
    loop
      -- Somar o intervalo à data inicial (e não à anterior) preserva o dia 31.
      occ := (r.start_date + step * n)::date;
      exit when occ > limit_date;
      if r.generated_until is null or occ > r.generated_until then
        inv := null;
        if card.type = 'credit_card' then
          inv := invoice_month_for(occ, card.closing_day, card.due_day);
        end if;
        insert into transactions
          (user_id, type, amount, date, description, account_id, category_id, paid, invoice_month, recurrence_id)
        values
          (r.user_id, r.type, r.amount, occ, r.description, r.account_id, r.category_id,
           card.type = 'credit_card' or occ <= current_date, inv, r.id)
        on conflict (recurrence_id, date) where recurrence_id is not null do nothing;
        get diagnostics rows_added = row_count;
        inserted := inserted + rows_added;
      end if;
      n := n + 1;
      exit when n > 1000;
    end loop;
    update recurrences set generated_until = limit_date where id = r.id;
  end loop;
  return inserted;
end $$;

-- Mês da fatura (1º dia do mês de vencimento) para uma compra no cartão.
-- Compras a partir do dia de fechamento entram na fatura seguinte.
-- Espelha src/domain/invoice.ts — mantenha os dois iguais.
create or replace function invoice_month_for(d date, closing_day int, due_day int)
returns date language sql immutable as $$
  select (
    date_trunc('month', d)
    + (case when extract(day from d) >= closing_day then interval '1 month' else interval '0' end)
    + (case when due_day <= closing_day then interval '1 month' else interval '0' end)
  )::date
$$;

-- ---------------------------------------------------------------------------
-- Categorias padrão para cada novo usuário
-- ---------------------------------------------------------------------------
create or replace function seed_default_categories() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into categories (user_id, name, kind, color, icon) values
    (new.id, 'Moradia',       'expense', '#7C8CF8', 'home'),
    (new.id, 'Mercado',       'expense', '#5CCF9B', 'shopping-cart'),
    (new.id, 'Restaurantes',  'expense', '#FF9F5A', 'utensils'),
    (new.id, 'Transporte',    'expense', '#4FB8E8', 'car'),
    (new.id, 'Saúde',         'expense', '#FF7B9C', 'heart-pulse'),
    (new.id, 'Educação',      'expense', '#B98CF5', 'graduation-cap'),
    (new.id, 'Lazer',         'expense', '#F2D45C', 'party-popper'),
    (new.id, 'Assinaturas',   'expense', '#E37BD8', 'repeat'),
    (new.id, 'Compras',       'expense', '#F07E6E', 'shopping-bag'),
    (new.id, 'Contas da casa','expense', '#6FD0C8', 'zap'),
    (new.id, 'Outros gastos', 'expense', '#8B93A5', 'circle'),
    (new.id, 'Salário',       'income',  '#5CCF9B', 'briefcase'),
    (new.id, 'Freelance',     'income',  '#4FB8E8', 'laptop'),
    (new.id, 'Rendimentos',   'income',  '#E3AE4A', 'trending-up'),
    (new.id, 'Outras receitas','income', '#8B93A5', 'circle');
  return new;
end $$;

drop trigger if exists on_auth_user_created_seed on auth.users;
create trigger on_auth_user_created_seed after insert on auth.users
  for each row execute function seed_default_categories();

-- ---------------------------------------------------------------------------
-- Permissões: só usuários logados executam as funções do app
-- ---------------------------------------------------------------------------
revoke execute on function generate_recurring(date) from public;
grant execute on function generate_recurring(date) to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function generate_recurring(date) from anon;
    revoke all on account_balances from anon;
  end if;
end $$;

-- ======================================================================
-- 0002_import.sql
-- ======================================================================
-- Control — importação de extratos (OFX/CSV)
-- Execute no Supabase depois da 0001: SQL Editor > New query > cole este arquivo > Run.

-- Identificador da transação no banco (FITID do OFX ou hash estável no CSV).
-- Impede que o mesmo extrato importado duas vezes duplique lançamentos.
alter table transactions add column if not exists external_id text;
-- Lote de importação, para poder desfazer uma importação inteira.
alter table transactions add column if not exists import_id uuid;

create unique index if not exists transactions_external_uq
  on transactions (account_id, external_id) where external_id is not null;
create index if not exists transactions_import_idx
  on transactions (import_id) where import_id is not null;

-- Identifica de qual conta do banco veio o arquivo (banco + número da conta),
-- para escolher a conta certa automaticamente nas próximas importações.
alter table accounts add column if not exists import_key text;

alter table transactions drop constraint if exists external_id_length;
alter table transactions add constraint external_id_length check (external_id is null or length(external_id) <= 200);
alter table accounts drop constraint if exists import_key_length;
alter table accounts add constraint import_key_length check (import_key is null or length(import_key) <= 120);

-- ======================================================================
-- 0003_description_rules.sql
-- ======================================================================
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
