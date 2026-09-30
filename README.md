# SaneData — Painel de Priorização em Saneamento & Saúde Pública

Painel interativo para priorização de investimentos em saneamento e saúde pública nos municípios de Pernambuco, desenvolvido no âmbito do PPGECAM.

**Demo:** https://sanerdata.vercel.app/

## Telas

- **Tela Inicial** — abertura institucional e navegação.
- **Apresentação** — o que é o SaneData, como o índice de priorização é
  calculado (resumo) e como usar cada tela do painel.
- **Dashboard** — índice de priorização (ranking clicável, mapa geográfico
  por camada, decomposição, distribuição, índice por mesorregião,
  investimento em saneamento por município, matriz de correlação, pontos
  de atenção com modo curadoria) e "Município em foco" (evolução temporal,
  comparação com a média, correlação/dispersão).
- **Relatórios** — ranking completo do ano com investimento em saneamento
  por município e exportação em CSV, Excel, imagem e impressão/PDF.
- **Comparações** — dois municípios lado a lado.
- **Perfil do Município** — ficha técnica de um município (indicadores do ano
  com média estadual e da mesorregião, posição, variação anual, trajetória
  2015-2024, pontos de atenção), imprimível e com link próprio
  (`#perfil/<código IBGE>`).
- **Séries Históricas** — evolução estadual de cada indicador (mediana, faixa
  interquartil, média por mesorregião) e maiores melhoras/pioras entre dois anos.
- **Simulador de Cenários** — ajusta os indicadores de um município (ou aplica
  cenários prontos, como universalizar água e esgoto) e recalcula o índice e a
  posição no ranking do ano; o cenário é hipotético e não altera as outras telas.
- **Metodologia & Dados** — fórmula do índice, pesos e robustez do ranking
  entre esquemas, dicionário de indicadores, cobertura de dado por ano, dados
  abertos para download e referência para citação.

Cada tela tem endereço próprio (`#dashboard`, `#series`...), então links podem
ser compartilhados e o botão "voltar" do navegador funciona.

## Estrutura

- `index.html`, `css/`, `js/` — aplicação.
- `data/raw/` — dados brutos (IBGE, SINISA/DATASUS etc.).
- `data/scripts/` — scripts de coleta e processamento dos dados.
- `data/processed/` — dados tratados consumidos pela aplicação.
- `docs/` — memorial descritivo, decisões de metodologia e notas para a dissertação.
