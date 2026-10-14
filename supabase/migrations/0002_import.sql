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
