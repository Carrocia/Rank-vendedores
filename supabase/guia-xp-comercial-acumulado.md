# XP comercial acumulado

O XP acumulado é separado da pontuação usada para calcular o rank mensal. O rank mensal atual e o histórico de rank de carreira continuam com suas regras existentes; os limites de XP para futuros ranks de carreira ainda não estão definidos.

## Cálculo mensal

- Cada venda que já entra no agregado de `vendas_admin` vale 100 XP-base. Vendas canceladas deixam de contar quando são removidas pelo fluxo atual; pendências da conferência continuam seguindo a regra atual do rank até serem validadas ou canceladas.
- Cada renovação presente em `renovacoes_mensais` vale 60 XP. O agregado já elimina duplicação pelo contrato. Renovações em conferência contam como hoje, mesmo quando seu valor ainda é zero.
- O ticket é o mesmo `valor_total / quantidade` usado pelo cálculo atual de rank mensal, reunindo cadastros vinculados à mesma identidade de carreira.
- O multiplicador das vendas novas fica centralizado em `configuracao_xp_comercial`. As faixas padrão são inclusivas no início e exclusivas no fim: `<100: 0,80×`, `100–<101: 0,90×`, `101–<105: 1,05×`, `105–<110: 1,10×`, `110–<115: 1,20×`, `115–<120: 1,30×`, `120–<130: 1,45×` e `>=130: 1,70×`.
- Se o ticket não puder ser calculado, o vendedor recebe somente o XP-base das vendas novas, sem multiplicador, bônus ou redutor de ticket.
- O XP de renovações nunca recebe o multiplicador de ticket. Meta de renovação não se aplica a vendedor externo. A quantidade de renovações que ele tiver pode, ainda assim, gerar XP-base.
- O bônus de metas está preparado, mas desativado e com valores zero. Não altera XP até os valores serem definidos e habilitados.

Os valores são arredondados com `round(numeric, escala_arredondamento)`, escala padrão de duas casas. O total mensal soma XP de vendas com multiplicador, XP de renovações e os bônus configurados.

## Recalcular, fechar e corrigir

`calcular_xp_comercial_vendedor` recalcula e atualiza o único snapshot provisório por identidade de carreira e mês. Reprocessar relatórios atualiza o mesmo registro; não cria uma segunda cópia de XP. Quando um mês é fechado, o cálculo retorna o snapshot persistido sem reprocessar as atividades. A consolidação aguarda o dia 8 do mês seguinte, conforme o fechamento de rank atual.

O superadministrador pode corrigir um mês fechado com `corrigir_xp_comercial_fechado`, sempre informando um motivo. As mudanças guardam os estados anterior e novo em `xp_comercial_auditoria`. Alterações de parâmetros também são auditadas. Campanhas precisam ser cadastradas antes da data de início e ficam imutáveis após começarem; seu período final é exclusivo. Campanhas sobrepostas para o mesmo vendedor e mês impedem o cálculo até a configuração ser corrigida.

## Aplicação no Supabase

Execute `xp-comercial-acumulado.sql` depois de acesso regional, progressão/fechamento de ranks e `renovacoes-mensais.sql`. Depois publique a versão do site com o painel analítico. O perfil exibe o XP mensal e acumulado, mas não converte XP em rank de carreira.

## Limite dos testes locais

Os testes do repositório conferem as regras e a estrutura SQL; não há uma instância local nem uma cópia dos dados do Supabase para testar permissões, RLS ou resultados reais de uma filial. Antes de usar o fechamento no banco de produção, aplique a migração em ambiente de desenvolvimento e confira um mês com dados reais.
