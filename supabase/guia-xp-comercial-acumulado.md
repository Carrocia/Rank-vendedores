# XP comercial acumulado

O XP acumulado é separado da pontuação usada para calcular o rank mensal. O rank mensal é recalculado com os pontos de desempenho do período; a carreira analítica usa o XP acumulado com as faixas D (base), C 3.000, B 9.000, A 18.000, S 30.000 e SS 45.000 XP.

## Cálculo mensal

- Cada venda que já entra no agregado de `vendas_admin` vale 100 XP-base. Vendas canceladas deixam de contar quando são removidas pelo fluxo atual; pendências da conferência continuam seguindo a regra atual do rank até serem validadas ou canceladas.
- Cada renovação presente em `renovacoes_mensais` vale 60 XP. O agregado já elimina duplicação pelo contrato. Renovações em conferência contam como hoje, mesmo quando seu valor ainda é zero.
- O ticket é o mesmo `valor_total / quantidade` usado pelo cálculo atual de rank mensal, reunindo cadastros vinculados à mesma identidade de carreira.
- O multiplicador das vendas novas fica centralizado em `configuracao_xp_comercial`. As faixas padrão são inclusivas no início e exclusivas no fim: `<100: 0,80×`, `100–<101: 0,90×`, `101–<105: 1,05×`, `105–<110: 1,10×`, `110–<115: 1,20×`, `115–<120: 1,30×`, `120–<130: 1,45×` e `>=130: 1,70×`.
- Se o ticket não puder ser calculado, o vendedor recebe o XP-base das vendas novas sem multiplicador ou ajuste de ticket; o bônus de meta continua independente.
- O XP de renovações nunca recebe o multiplicador de ticket. Meta de renovação não se aplica a vendedor externo. A quantidade de renovações que ele tiver pode, ainda assim, gerar XP-base.
- As metas de vendas novas e renovações têm bônus independentes sobre seu próprio XP-base: abaixo de 70% = 0%; 70–<85% = 5%; 85–<100% = 10%; 100–<115% = 15%; 115% ou mais = 20%.
- As faixas de bônus ficam em `configuracao_xp_comercial.faixas_bonus_meta` e são inclusivas no início e exclusivas no fim. O bônus de vendas é aplicado ao XP-base de vendas novas, sem o multiplicador de ticket. O bônus de renovação é aplicado ao XP-base de renovações e não existe para vendedores externos.
- Os antigos campos de valor fixo `bonus_meta_vendas` e `bonus_meta_renovacoes` continuam na tabela somente por compatibilidade; o cálculo atual não os utiliza.
- Cada indicador usa a meta oficial do vendedor e do mês. Metas ausentes, inválidas ou incompletas não recebem bônus. O detalhamento `regra_aplicada` registra meta, validade, atingimento, faixa, XP-base e bônus concedido para cada indicador; a auditoria guarda os estados anteriores e novos.

Os valores são arredondados com `round(numeric, escala_arredondamento)`, escala padrão de duas casas. O total mensal é `(XP-base de vendas novas × multiplicador de ticket) + bônus da meta de vendas + XP-base de renovações + bônus da meta de renovações`.

## Recalcular, fechar e corrigir

`calcular_xp_comercial_vendedor` recalcula e atualiza o único snapshot provisório por identidade de carreira e mês. Reprocessar relatórios atualiza o mesmo registro; não cria uma segunda cópia de XP. Quando um mês é fechado, o cálculo retorna o snapshot persistido sem reprocessar as atividades. A consolidação aguarda o dia 8 do mês seguinte, conforme o fechamento de rank atual.

O superadministrador pode corrigir um mês fechado com `corrigir_xp_comercial_fechado`, sempre informando um motivo. As mudanças guardam os estados anterior e novo em `xp_comercial_auditoria`. Alterações de parâmetros também são auditadas. Campanhas precisam ser cadastradas antes da data de início e ficam imutáveis após começarem; seu período final é exclusivo. Campanhas sobrepostas para o mesmo vendedor e mês impedem o cálculo até a configuração ser corrigida.

## Aplicação no Supabase

Execute `xp-comercial-acumulado.sql` depois de acesso regional, progressão/fechamento de ranks e `renovacoes-mensais.sql`. Se o XP já estiver instalado, execute novamente a versão atualizada do mesmo arquivo para adicionar as faixas percentuais, habilitar o bônus e substituir o cálculo provisório; o script é idempotente. Depois publique a versão do site com o painel analítico. A classificação por XP de carreira é apresentada na camada analítica; o SQL mantém os snapshots e o total acumulado, separados do rank mensal.

## Limite dos testes locais

Os testes do repositório conferem as regras e a estrutura SQL; não há uma instância local nem uma cópia dos dados do Supabase para testar permissões, RLS ou resultados reais de uma filial. Antes de usar o fechamento no banco de produção, aplique a migração em ambiente de desenvolvimento e confira um mês com dados reais.
