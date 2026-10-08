-- Canal de ambiência independente da música, com biblioteca e transporte atômicos.
-- Reusa RLS (só GM escreve), Realtime e reset de midia_estado. Áudios usam sfx/ no R2.
-- Aditivo: o frontend anterior continua lendo/escrevendo suas colunas normalmente.
alter table public.midia_estado add column if not exists ambiencia jsonb not null default
  '{"faixas":[],"faixaAtualId":null,"tocando":false,"posicaoSegundos":0,"atualizadoEm":"1970-01-01T00:00:00.000Z","volume":0.5}'::jsonb
  check (jsonb_typeof(ambiencia) = 'object');
