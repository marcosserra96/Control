# Control

Controle financeiro pessoal que funciona no celular e no computador, instalável como aplicativo (PWA).

- **Contas e cartões** — saldos por conta, faturas de cartão com fechamento e vencimento, pagamento de fatura, transferências.
- **Lançamentos** — despesas, receitas e transferências, com busca, filtros e pendentes.
- **Parcelas e recorrentes** — compras parceladas distribuídas nas faturas; contas fixas e assinaturas criadas automaticamente.
- **Orçamento** — limite mensal por categoria, com aviso de ritmo de gasto.
- **Metas** — objetivos de economia, aportes e quanto guardar por mês.
- **Relatórios** — entradas e saídas por mês e gastos por categoria.
- **Exportação** — todos os lançamentos em CSV.

## Como colocar no ar

São três etapas: banco de dados (Supabase), hospedagem (Vercel) e instalação no aparelho. Leva uns 15 minutos.

### 1. Supabase (banco e login)

1. Crie uma conta em [supabase.com](https://supabase.com) e um projeto novo (região **South America (São Paulo)**). Guarde a senha do banco.
2. No projeto, abra **SQL Editor → New query**, cole todo o conteúdo de [`supabase/migrations/0001_schema.sql`](supabase/migrations/0001_schema.sql) e clique em **Run**.
3. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public**.
4. Em **Authentication → URL Configuration**, preencha **Site URL** com o endereço do Vercel (ex.: `https://control-xyz.vercel.app`) depois do passo 2 abaixo. Sem isso, os links de confirmação e de redefinir senha apontam para o lugar errado.

> A chave *anon* é pública por design. O que protege seus dados são as políticas de segurança por linha (RLS) criadas pelo SQL: cada usuário só lê e altera o que é dele.

**Depois de criar sua conta no app**, desative novos cadastros em **Authentication → Sign In / Providers → Allow new users to sign up** (desligado). Assim ninguém mais consegue se cadastrar no seu app.

### 2. Vercel (hospedagem)

1. Em [vercel.com/new](https://vercel.com/new), importe o repositório `marcosserra96/Control`. O Vercel detecta o Vite sozinho.
2. Em **Environment Variables**, adicione:
   - `VITE_SUPABASE_URL` — a Project URL
   - `VITE_SUPABASE_ANON_KEY` — a chave anon public
3. Clique em **Deploy**. A cada `git push` na `main`, o Vercel publica de novo.

### 3. Instalar no aparelho

- **Android / Chrome / Edge:** abra o site e use **Ajustes → Instalar app** dentro do Control, ou o menu do navegador.
- **iPhone:** no Safari, toque em **Compartilhar → Adicionar à Tela de Início**.

Quando sair uma versão nova, o app mostra um aviso **Nova versão disponível** para atualizar.

## Desenvolvimento

```bash
npm install
cp .env.example .env.local   # preencha com os dados do Supabase
npm run dev                  # http://localhost:5173
```

**Modo demonstração** — roda com dados fictícios em memória, sem Supabase e sem login. Útil para mexer na interface:

```bash
npm run demo
```

### Verificações

| Comando | O que faz |
| --- | --- |
| `npm run typecheck` | Checagem de tipos |
| `npm test` | Regras de dinheiro, datas, faturas, parcelas, orçamento e metas |
| `npm run build` | Tipos + build de produção (o mesmo que o Vercel roda) |
| `npm run test:db` | Schema contra um Postgres local: RLS, saldos, faturas, recorrências (`PGHOST`, `PGPORT`, `PGUSER`) |
| `npm run test:ui` | Com `npm run demo` rodando: fluxo de lançamento parcelado e checagem de layout no celular |

## Arquitetura

```
src/
  domain/      Regras de negócio puras e testadas (sem React, sem banco)
  data/        Repositório: interface única, implementações Supabase e memória (demo); hooks React Query
  components/  Componentes de interface reutilizáveis
  features/    Telas, por área (dashboard, transactions, accounts, plan, reports, settings)
  app/         Shell: rotas, navegação, tema, mês em foco, PWA
supabase/      Migração SQL e testes do schema
```

Decisões que vale conhecer:

- **SPA com Supabase direto do navegador.** Não há servidor próprio para manter. A segurança fica no banco (RLS + gatilhos que impedem referenciar contas e categorias de outro usuário).
- **Dinheiro em centavos inteiros** em todo o app; conversão para decimal só na borda com o banco.
- **Fatura do cartão = mês de vencimento.** Compras a partir do dia de fechamento vão para a fatura seguinte. A regra existe em `src/domain/invoice.ts` e em `invoice_month_for()` no SQL — mantenha as duas iguais (há testes para as duas).
- **Pagar fatura = transferência** da conta para o cartão, vinculada ao mês da fatura. O saldo do cartão negativo é o valor devido.
- **Recorrências são geradas no banco** (`generate_recurring`), de forma idempotente, até o fim do mês corrente; as futuras nascem como pendentes. Celular e computador abrindo juntos não duplicam lançamentos.
- **Offline:** o app abre e mostra os últimos dados salvos no aparelho; lançar exige conexão. O cache local é apagado ao sair da conta. Dados financeiros nunca vão para o cache do service worker.

## Próximos passos possíveis

- Importar extrato bancário (OFX/CSV)
- Lançar offline com sincronização posterior
- Histórico de patrimônio (saldo total mês a mês)
- Pendentes atrasados de meses anteriores no Início
- Notificações de vencimento de fatura
