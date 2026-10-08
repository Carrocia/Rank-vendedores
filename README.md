# Ranking de Vendas — UNI Internet

Versão organizada para publicação como site estático no GitHub Pages.

## Estrutura

- `index.html`: página de entrada.
- `assets/css/`: estilos do site, painel administrativo e cards.
- `assets/js/`: scripts carregados na ordem declarada no HTML.

As imagens que já faziam parte da página foram mantidas incorporadas ao HTML e aos dados para preservar a aparência atual.

## Criar contas administrativas regionais

A área **Contas Regionais** fica disponível somente para o superadministrador. Ela cria contas no Supabase Auth e vincula cada conta a uma filial; não permite criar outro superadministrador. A senha inicial deve ser entregue ao novo administrador por um canal seguro.

A criação roda na Edge Function `gerenciar-admins`, que usa a chave secreta do projeto somente no servidor. Nunca coloque uma chave secreta ou `service_role` no HTML, JavaScript do navegador ou em variáveis públicas. A função lê as chaves disponibilizadas no ambiente das Edge Functions pelo Supabase.

Para publicar a função no projeto Supabase:

```powershell
npx supabase login
npx supabase functions deploy gerenciar-admins --project-ref xmpurrxwfgzhnrqhrzyt
```

Mantenha a verificação JWT da função habilitada. Depois, publique também a versão atualizada do site estático para liberar a nova área no painel.

## Publicação

Copie o conteúdo desta pasta para a raiz do repositório do site no GitHub. Mantenha a pasta `assets` ao lado do `index.html`. O Supabase continua sendo acessado pelo navegador usando a chave pública configurada no código; as permissões devem continuar protegidas pelas políticas RLS do projeto.
