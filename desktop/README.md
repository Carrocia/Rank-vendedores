# UNI Gestão para Windows

Aplicativo desktop administrativo em WPF, separado do site público. A primeira etapa cobre a estrutura nativa, autenticação do Supabase, validação em `admin_usuarios`, seleção de filial permitida pela conta e leitura do ranking mensal pela função `calcular_rank_mensal_filial` já usada pelo ADM do site.

## Requisitos para compilar

- Windows 10 ou 11
- .NET 10 SDK (LTS; o SDK inclui o runtime necessário para compilar WPF)

O app já usa a URL e a chave **publicável** do mesmo projeto configurado no site. Se precisar apontar para outro ambiente, pode sobrescrever com as variáveis abaixo. Não coloque `service_role` ou outra chave secreta no aplicativo:

- `UNI_SUPABASE_URL`
- `UNI_SUPABASE_PUBLISHABLE_KEY`

Depois, abra `RankVendedores.Admin.csproj` no Visual Studio ou execute `dotnet run` na pasta do projeto.

O app não salva credenciais nem tokens em disco nesta etapa. Os módulos de alteração de dados serão migrados gradualmente, mantendo a validação de acesso via RLS.
