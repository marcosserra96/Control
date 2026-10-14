-- Teste do schema contra um Postgres local com um esqueleto do auth do Supabase.
-- Uso: psql -v ON_ERROR_STOP=1 -f supabase/tests/auth_stub.sql -f supabase/migrations/0001_schema.sql -f supabase/tests/schema.test.sql
\set QUIET on

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

do $$ begin
  assert (select count(*) from categories where user_id = '11111111-1111-1111-1111-111111111111') = 15,
    'categorias padrão criadas';
end $$;

-- Age como o usuário 1
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

insert into accounts (id, name, type, initial_balance) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Corrente', 'checking', 1000);
insert into accounts (id, name, type, closing_day, due_day, credit_limit) values
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Cartão', 'credit_card', 25, 5, 5000);

insert into transactions (type, amount, date, description, account_id, category_id) values
  ('expense', 150.50, '2026-10-01', 'Mercado', 'aaaaaaaa-0000-0000-0000-000000000001',
    (select id from categories where name = 'Mercado' limit 1)),
  ('income', 3000, '2026-10-05', 'Salário', 'aaaaaaaa-0000-0000-0000-000000000001',
    (select id from categories where name = 'Salário' limit 1));
insert into transactions (type, amount, date, description, account_id, paid) values
  ('expense', 99, '2026-10-20', 'Conta futura', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into transactions (type, amount, date, description, account_id, invoice_month) values
  ('expense', 200, '2026-10-10', 'Compra cartão', 'aaaaaaaa-0000-0000-0000-000000000002',
    invoice_month_for('2026-10-10', 25, 5));
insert into transactions (type, amount, date, description, account_id, to_account_id, invoice_month) values
  ('transfer', 200, '2026-11-05', 'Pagamento fatura', 'aaaaaaaa-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000002', '2026-11-01');

do $$ begin
  assert (select balance from account_balances where account_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 3649.50,
    'saldo da corrente: 1000 - 150,50 + 3000 - 200 (pendente ignorado)';
  assert (select balance from account_balances where account_id = 'aaaaaaaa-0000-0000-0000-000000000002') = 0,
    'cartão quitado';
  assert invoice_month_for('2026-10-10', 25, 5) = '2026-11-01', 'antes do fechamento: vence no mês seguinte';
  assert invoice_month_for('2026-10-26', 25, 5) = '2026-12-01', 'depois do fechamento: pula uma fatura';
  assert invoice_month_for('2026-10-02', 3, 10) = '2026-10-01', 'vencimento no mesmo mês';
  assert invoice_month_for('2026-10-03', 3, 10) = '2026-11-01', 'no dia do fechamento já vai para a próxima';
end $$;

-- Recorrência mensal no dia 31: deve cair no último dia dos meses curtos
insert into recurrences (id, description, type, amount, account_id, frequency, start_date) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Aluguel', 'expense', 1800,
   'aaaaaaaa-0000-0000-0000-000000000001', 'monthly', '2026-08-31');
select generate_recurring('2026-12-31');
select generate_recurring('2026-12-31'); -- idempotente

do $$ begin
  assert (select count(*) from transactions where recurrence_id = 'bbbbbbbb-0000-0000-0000-000000000001') = 5,
    'ago, set, out, nov, dez';
  assert exists (select 1 from transactions where recurrence_id = 'bbbbbbbb-0000-0000-0000-000000000001'
    and date = '2026-09-30'), 'setembro cai no dia 30';
  assert exists (select 1 from transactions where recurrence_id = 'bbbbbbbb-0000-0000-0000-000000000001'
    and date = '2026-10-31'), 'outubro volta ao dia 31';
end $$;

-- Importação: o mesmo ID do banco não entra duas vezes na mesma conta
insert into transactions (type, amount, date, description, account_id, external_id) values
  ('expense', 10, '2026-10-01', 'Importado', 'aaaaaaaa-0000-0000-0000-000000000001', 'f:ABC');
do $$ begin
  begin
    insert into transactions (type, amount, date, description, account_id, external_id) values
      ('expense', 10, '2026-10-01', 'Importado', 'aaaaaaaa-0000-0000-0000-000000000001', 'f:ABC');
    raise exception 'deveria ter falhado';
  exception when unique_violation then null;
  end;
end $$;

-- Isolamento: o usuário 2 não vê nem usa dados do usuário 1
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$ begin
  assert (select count(*) from accounts) = 0, 'RLS em contas';
  assert (select count(*) from transactions) = 0, 'RLS em lançamentos';
  assert (select count(*) from account_balances) = 0, 'RLS na view de saldos';
  assert (select count(*) from categories) = 15, 'vê só as próprias categorias';
end $$;

do $$ begin
  begin
    insert into transactions (type, amount, date, description, account_id)
    values ('expense', 10, '2026-10-01', 'Invasão', 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'deveria ter falhado';
  exception when others then
    assert sqlerrm <> 'deveria ter falhado', 'não pode lançar em conta alheia';
  end;
  begin
    insert into accounts (user_id, name) values ('11111111-1111-1111-1111-111111111111', 'Forjada');
    raise exception 'deveria ter falhado';
  exception when others then
    assert sqlerrm <> 'deveria ter falhado', 'não pode criar dados em nome de outro usuário';
  end;
end $$;

reset role;
\echo 'OK: todos os testes de schema passaram'
