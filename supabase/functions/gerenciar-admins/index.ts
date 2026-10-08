import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders as sdkCorsHeaders } from 'npm:@supabase/supabase-js@^2/cors';

const corsHeaders = {
  ...sdkCorsHeaders,
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { error: 'Método não permitido.' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const readDefaultKey = (name: string) => {
    const raw = Deno.env.get(name);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed?.default === 'string' ? parsed.default : null;
    } catch {
      return raw;
    }
  };
  const anonKey = readDefaultKey('SUPABASE_PUBLISHABLE_KEYS')
    || Deno.env.get('SUPABASE_ANON_KEY')
    || Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  const serverKey = readDefaultKey('SUPABASE_SECRET_KEYS')
    || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serverKey) {
    console.error('[gerenciar-admins] Variáveis padrão do Supabase ausentes.');
    return json(500, { error: 'A função ainda não está configurada no Supabase.' });
  }

  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json(401, { error: 'Faça login como superadministrador.' });

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceClient = createClient(supabaseUrl, serverKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userResult, error: authError } = await authClient.auth.getUser(token);
  const user = userResult?.user;
  if (authError || !user) return json(401, { error: 'Sessão inválida ou expirada. Entre novamente.' });

  const { data: admin, error: adminError } = await serviceClient
    .from('admin_usuarios')
    .select('user_id, is_superadmin, ativo')
    .eq('user_id', user.id)
    .eq('ativo', true)
    .maybeSingle();
  if (adminError) {
    console.error('[gerenciar-admins] Falha ao consultar autorização:', adminError.message);
    return json(500, { error: 'Não foi possível validar o acesso administrativo.' });
  }
  if (!admin || admin.is_superadmin !== true) {
    return json(403, { error: 'Somente o superadministrador pode gerenciar contas regionais.' });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return json(400, { error: 'Envie uma solicitação válida.' });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return json(400, { error: 'Envie uma solicitação válida.' });
  }

  if (body.action === 'list') {
    const [{ data: accounts, error: accountsError }, { data: branches, error: branchesError }] = await Promise.all([
      serviceClient.from('admin_usuarios')
        .select('user_id, filial_id, is_superadmin, ativo')
        .eq('is_superadmin', false)
        .not('filial_id', 'is', null)
        .order('filial_id'),
      serviceClient.from('filiais').select('id, nome'),
    ]);
    if (accountsError || branchesError) {
      console.error('[gerenciar-admins] Falha ao listar contas regionais:', accountsError?.message || branchesError?.message);
      return json(500, { error: 'Não foi possível carregar as contas regionais.' });
    }

    const branchName = new Map((branches || []).map(branch => [String(branch.id), branch.nome]));
    const result = await Promise.all((accounts || []).map(async account => {
      const { data, error } = await serviceClient.auth.admin.getUserById(account.user_id);
      if (error) console.warn('[gerenciar-admins] Conta sem usuário Auth correspondente:', account.user_id);
      return {
        user_id: account.user_id,
        email: data?.user?.email || '(usuário Auth não localizado)',
        filial_id: account.filial_id,
        filial_nome: branchName.get(String(account.filial_id)) || 'Regional não localizada',
        ativo: account.ativo === true,
      };
    }));
    return json(200, { admins: result });
  }

  if (body.action === 'delete') {
    const userId = typeof body.user_id === 'string' ? body.user_id.trim() : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      return json(400, { error: 'A conta selecionada é inválida.' });
    }
    if (userId === user.id) return json(400, { error: 'Você não pode excluir a própria conta.' });

    const { data: target, error: targetError } = await serviceClient
      .from('admin_usuarios')
      .select('user_id, filial_id, is_superadmin, ativo')
      .eq('user_id', userId)
      .maybeSingle();
    if (targetError) {
      console.error('[gerenciar-admins] Falha ao localizar conta para exclusão:', targetError.message);
      return json(500, { error: 'Não foi possível localizar a conta regional.' });
    }
    if (!target || target.is_superadmin === true || target.filial_id == null) {
      return json(404, { error: 'A conta regional não foi encontrada ou não pode ser excluída por esta tela.' });
    }

    const { data: removedLink, error: unlinkError } = await serviceClient
      .from('admin_usuarios')
      .delete()
      .eq('user_id', userId)
      .eq('is_superadmin', false)
      .not('filial_id', 'is', null)
      .select('user_id, filial_id, is_superadmin, ativo')
      .maybeSingle();
    if (unlinkError || !removedLink) {
      console.error('[gerenciar-admins] Falha ao remover vínculo regional:', unlinkError?.message || 'vínculo não encontrado');
      return json(500, { error: 'Não foi possível remover o vínculo da conta com a regional.' });
    }

    const { error: deleteAuthError } = await serviceClient.auth.admin.deleteUser(userId);
    if (deleteAuthError) {
      const { error: restoreError } = await serviceClient.from('admin_usuarios').insert(removedLink);
      if (restoreError) {
        console.error('[gerenciar-admins] Falha ao restaurar vínculo após erro no Auth:', restoreError.message);
        return json(500, { error: 'O acesso regional foi removido, mas a conta Auth não pôde ser excluída nem restaurada. Revise esta conta no Supabase.' });
      }
      console.error('[gerenciar-admins] Falha ao excluir usuário Auth:', deleteAuthError.message);
      return json(500, { error: 'Não foi possível excluir a conta de autenticação. O acesso regional foi restaurado.' });
    }

    return json(200, { deleted: true, user_id: userId });
  }

  if (body.action !== 'create') return json(400, { error: 'Ação inválida.' });

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const filialId = Number(body.filial_id);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json(400, { error: 'Informe um e-mail válido.' });
  }
  if (password.length < 8 || password.length > 128) {
    return json(400, { error: 'A senha inicial deve ter entre 8 e 128 caracteres.' });
  }
  if (!Number.isSafeInteger(filialId) || filialId <= 0) {
    return json(400, { error: 'Selecione uma regional válida.' });
  }

  const { data: branch, error: branchError } = await serviceClient
    .from('filiais')
    .select('id, nome, ativo')
    .eq('id', filialId)
    .eq('ativo', true)
    .maybeSingle();
  if (branchError || !branch) return json(400, { error: 'A regional selecionada não existe ou está inativa.' });

  const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    console.error('[gerenciar-admins] Não foi possível criar usuário Auth:', createError?.message);
    return json(400, { error: createError?.message || 'Não foi possível criar a conta de autenticação.' });
  }

  const { error: linkError } = await serviceClient.from('admin_usuarios').insert({
    user_id: created.user.id,
    filial_id: filialId,
    is_superadmin: false,
    ativo: true,
  });
  if (linkError) {
    const { error: rollbackError } = await serviceClient.auth.admin.deleteUser(created.user.id);
    if (rollbackError) console.error('[gerenciar-admins] Falha ao limpar usuário Auth após erro no vínculo:', rollbackError.message);
    console.error('[gerenciar-admins] Falha ao vincular conta à regional:', linkError.message);
    if (linkError.code === '23505') return json(409, { error: 'Já existe um vínculo administrativo para esta conta.' });
    return json(500, {
      error: rollbackError
        ? 'A conta foi criada no Auth, mas o vínculo falhou e a limpeza automática também falhou. Revise a conta no Supabase Auth.'
        : 'Não foi possível vincular a conta à regional. A conta Auth foi removida automaticamente.',
    });
  }

  return json(201, {
    admin: {
      user_id: created.user.id,
      email: created.user.email,
      filial_id: filialId,
      filial_nome: branch.nome,
      ativo: true,
    },
  });
});
