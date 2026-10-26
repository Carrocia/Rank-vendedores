# Pontuação do rank mensal (separada do XP de carreira)

Os pontos desta regra classificam o desempenho do mês e são recalculados a partir das atividades do período. Eles não são o XP comercial permanente de carreira definido em `guia-xp-comercial-acumulado.md` e `xp-comercial-acumulado.sql`.

Este modelo substitui a exigência de atingir M3/M2/M1 para receber um rank mensal. O XP é calculado novamente a partir dos registros do mês: inclusão, alteração ou cancelamento de venda atualiza a pontuação.

## Pontuação

| Componente | Limite | Regra inicial |
| --- | ---: | --- |
| Vendas | 35 XP | Pontos proporcionais às vendas em relação à meta M1, com crédito desde a primeira venda. M1 completa esta categoria; não é requisito para rank. |
| Ticket / valor | 20 XP | Pontuação gradual comparada ao ticket de referência da filial. Abaixo de 80%: 0; 80%: 0; 95%: 10; 110% ou mais: 20. |
| Constância | 20 XP | 2 XP por dia diferente com ao menos uma venda, até 10 dias no mês. Isso evita entregar todo o bônus de constância por uma venda no começo do mês. |
| Volume diário | 10 XP | +2 XP por dia com três ou mais vendas, limitado a 10 XP. |
| Evolução semanal | 10 XP | Compara os últimos sete dias com os sete anteriores. Crescimento de 50% ou mais recebe 10 XP; crescimento menor pontua proporcionalmente. Sem base anterior, um período atual com vendas recebe no máximo 4 XP. |
| Renovações | 5 XP | +0,25 XP por renovação, limitado a 5. Para vendedores externos, este componente vale 0 e não é requisito. |

## Faixas iniciais

| Rank | XP mínimo |
| --- | ---: |
| D | 20 |
| C | 35 |
| B | 50 |
| A | 65 |
| S | 80 |

Ticket deixa de ser uma barreira eliminatória e passa a contribuir para o XP. A falta de M1 não impede o rank. Os vendedores continuam sem rank quando ainda não têm pontuação suficiente ou os dados essenciais não permitem o cálculo.

## Calibração e histórico

Os pesos e limites são parâmetros iniciais. A distribuição deve ser conferida com os dados reais do primeiro mês antes de tratar as faixas como definitivas. O mês vigente é recalculado continuamente. Os meses fechados continuam usando o snapshot já consolidado, e a progressão de carreira/SS permanece separada deste rank mensal.

## Limite de validação

O repositório não contém uma cópia dos dados reais do Supabase; portanto, não é possível calcular aqui quantos vendedores ficariam em cada faixa. A simulação de distribuição deve ser feita no banco conectado antes de consolidar as faixas.
