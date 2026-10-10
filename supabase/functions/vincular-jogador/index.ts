// Edge Function `vincular-jogador` (mesa-estatica-multiplayer-completo.md §6, §V.2)
//
// Recebe { owner_token }, resolve quem está chamando pelo JWT anônimo (Authorization
// header, já injetado pelo supabase.functions.invoke), e vincula auth.uid() à linha
// de characters_privado dona daquele owner_token. Reatribuível de propósito: o token
// é o credencial (doc §6) — trocar de aparelho com o mesmo link revincula sem drama.
// Roda com service_role só aqui dentro; nunca sai desta função.
//
// Auditoria mínima (migração 0023, tabela `vinculo_jogador_log`): não bloqueia reuso (quebraria
// o fluxo legítimo de troca de aparelho) — só registra auth_uid anterior → novo, pro mestre
// poder desconfiar depois se um link vazou e alguém mais o usou.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ erro: 'método não permitido' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ erro: 'sem autenticação' }, 401);

  let ownerToken: string | undefined;
  try {
    const body = await req.json();
    ownerToken = body.owner_token;
  } catch {
    // corpo inválido — cai no check abaixo
  }
  if (!ownerToken) return jsonResponse({ erro: 'owner_token ausente' }, 400);
  if (typeof ownerToken !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ownerToken)) {
    return jsonResponse({ erro: 'link inválido' }, 404);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  // cliente "do chamador" — só pra descobrir quem é o dono do JWT anônimo recebido
  const clienteChamador = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await clienteChamador.auth.getUser();
  if (userError || !userData.user) return jsonResponse({ erro: 'sessão inválida' }, 401);
  const authUid = userData.user.id;

  // cliente com privilégio total — service_role nunca sai desta função
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // A RPC serializa revogação + atribuição na mesma transação (migração 0043).
  // O UID vem exclusivamente do JWT validado, nunca do corpo enviado pelo cliente.
  // Sem fallback para updates separados: banco indisponível ou migração ausente
  // deve falhar fechado, preservando o ownership confirmado no banco.
  try {
    const { data: characterId, error: vinculoError } = await admin.rpc('vincular_jogador_atomico', {
      p_owner_token: ownerToken,
      p_auth_uid: authUid,
    });

    if (vinculoError) return jsonResponse({ erro: 'falha ao vincular' }, 500);
    if (!characterId) return jsonResponse({ erro: 'link inválido' }, 404);

    return jsonResponse({ ok: true, characterId }, 200);
  } catch {
    return jsonResponse({ erro: 'falha ao vincular' }, 500);
  }
});
