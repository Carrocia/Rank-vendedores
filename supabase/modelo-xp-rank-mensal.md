# Pontuação do rank mensal (separada do XP de carreira)

Os pontos desta regra classificam o desempenho do mês e são recalculados a partir das atividades do período. Eles não são o XP comercial permanente de carreira definido em `guia-xp-comercial-acumulado.md` e `xp-comercial-acumulado.sql`.

Este modelo substitui a exigência de atingir M3/M2/M1 para receber um rank mensal. O XP é calculado novamente a partir dos registros do mês: inclusão, alteração ou cancelamento de venda atualiza a pontuação.

## Pontuação

| Componente | Limite | Regra inicial |
| --- | ---: | --- |
| Vendas | 50 XP | Pontos proporcionais às vendas em relação à meta M1, com crédito desde a primeira venda. M1 completa esta categoria; não é requisito para rank. |
| Ticket / valor | 20 XP | Pontuação gradual comparada ao ticket de referência da filial. Abaixo de 80%: 0; 80%: 0; 95%: 10; 110% ou mais: 20. |
| Evolução semanal | 20 XP | Compara o total de ativações nos últimos sete dias com os sete anteriores. Crescimento de 50% ou mais recebe 20 XP; crescimento menor pontua proporcionalmente. Sem base anterior, uma janela atual com ativações recebe 8 XP. |
| Renovações | 10 XP | +0,5 XP por renovação, limitado a 10. Para vendedores externos, este componente vale 0 e não é requisito. |

Não há pontos por fechar vendas em dias consecutivos ou por concentrar várias ativações no mesmo dia. O sistema registra a data de ativação, que não revela quando a negociação começou ou quanto tempo levou.

## Faixas iniciais

| Rank | XP mínimo |
| --- | ---: |
| D | 20 |
| C | 35 |
| B | 50 |
| A | 65 |
| S | 80 |

Ticket deixa de ser uma barreira eliminatória e passa a contribuir para o XP. A falta de M1 não impede o rank. O peso maior fica nas vendas; evolução semanal e ticket complementam o resultado, e renovações somam um bônus menor para internos. Os vendedores continuam sem rank quando ainda não têm pontuação suficiente ou os dados essenciais não permitem o cálculo.

## Calibração e histórico

Os pesos e limites são parâmetros iniciais. A distribuição deve ser conferida com os dados reais do primeiro mês antes de tratar as faixas como definitivas. O mês vigente é recalculado continuamente. Os meses fechados continuam usando o snapshot já consolidado, e a progressão de carreira/SS permanece separada deste rank mensal.

## Limite de validação

O repositório não contém uma cópia dos dados reais do Supabase; portanto, não é possível calcular aqui quantos vendedores ficariam em cada faixa. A simulação de distribuição deve ser feita no banco conectado antes de consolidar as faixas.
