// Junta todas as migrações em supabase/setup.sql, para colar de uma vez no SQL Editor do Supabase.
// Uso: npm run db:bundle
import { readdir, readFile, writeFile } from 'node:fs/promises'

export async function bundle() {
  const dir = new URL('../supabase/migrations/', import.meta.url)
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
  const parts = [
    '-- Control — configuração completa do banco',
    '-- Gerado por `npm run db:bundle` a partir de supabase/migrations. Não edite à mão.',
    '-- Cole TODO este conteúdo no Supabase (SQL Editor > New query) e clique em Run.',
    '-- Pode ser executado de novo sem duplicar nada.',
  ]
  for (const f of files) {
    parts.push('', `-- ${'='.repeat(70)}`, `-- ${f}`, `-- ${'='.repeat(70)}`, (await readFile(new URL(f, dir), 'utf8')).trimEnd())
  }
  return parts.join('\n') + '\n'
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await writeFile(new URL('../supabase/setup.sql', import.meta.url), await bundle())
  console.log('supabase/setup.sql atualizado')
}
