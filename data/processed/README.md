# data/processed

Dados já limpos/normalizados/padronizados, gerados a partir de `data/raw`
pelos scripts em `data/scripts/` (não editar manualmente — rode o pipeline
de novo para regenerar). Arquivos:

- `municipios_pe.csv` — município, código IBGE, população por ano (01).
- `saude_notificacoes_pe.csv` — notificações de dengue/chikungunya por
  município/ano (02).
- `saude_internacoes_dda_pe.csv` — internações por doença infecciosa
  intestinal (proxy de diarreia aguda) por município/ano (03).
- `saude_cobertura_pe.csv` / `saude_cobertura_diarreia_pe.csv` — anos em
  que o download de cada indicador de saúde foi 100% bem-sucedido (02/03);
  usados pelo script 05 para diferenciar "zero casos" (ano coberto, sem
  notificação) de "sem dado ainda" (ano não baixado) — nunca inventam um
  valor, só evitam confundir os dois casos.
- `saneamento_pe.csv` — déficit de água/esgoto/resíduos por município/ano.
  `deficitAgua`/`deficitEsgoto` 2015-2022 vêm da Base dos Dados via BigQuery
  (04a, automatizado); `deficitResiduos` e os anos 2023-2024 de água/esgoto
  só existem depois do passo manual de importação do SINISA (04) — até lá
  ficam `null`. Os dois scripts fazem merge entre si (nenhum sobrescreve o
  que o outro já preencheu).
- `ipca_anual.csv` — IPCA médio por ano e fator de correção para R$ do
  ano de referência (04e), usado pelo 05 para corrigir o investimento.
- `investimento_saneamento_pe.csv` — investimento total (R$ nominais) em
  água+esgoto por município/ano, desagregado por entidade executora
  (prestador/município/estado), vindo da Base dos Dados via BigQuery (04d,
  automatizado). Mesma cobertura do 04a: só água+esgoto, só 2015-2022 — sem
  passo manual equivalente para preencher o resto. O script 05 converte os
  totais em taxa por 100 mil habitantes antes de gravar no `painel_pe.json`;
  os valores absolutos em R$ só existem aqui.
- **`painel_pe.json`** — junção final de tudo acima (05); é o único
  arquivo que o front-end (`js/data.js`) lê, via `fetch`. Campos ainda não
  apurados aparecem como `null`, nunca como um valor fictício.
- `malha_municipios_pe.geojson` — polígonos dos 185 municípios de PE (06),
  usados pelo mapa geográfico (`js/geo.js`); cada feature tem só `codarea`
  (código IBGE de 7 dígitos, casado com `codigo_ibge` do painel) e a
  geometria. Independente do restante do pipeline.
- `pontos_atencao.json` — pontos específicos (endereço/local, não só o
  município inteiro) que precisam de obra de infraestrutura, plotados como
  marcadores no mapa geográfico. **Curadoria manual da equipe de pesquisa,
  não um cadastro público em tempo real** — o site é 100% estático, sem
  banco de dados, então não há como um visitante gravar um ponto que outros
  visitantes veriam. O painel tem um "modo curadoria" (Dashboard → mapa
  geográfico) que deixa clicar no mapa, preencher endereço/categoria/
  descrição e baixar o JSON atualizado — para o ponto valer pra todo mundo,
  baixe o arquivo e substitua este aqui, depois publique (commit + push).
  Formato de cada item:
  ```json
  {
    "codigo_ibge": 2611606,
    "endereco": "Rua Exemplo, 123 - Bairro, Município-PE",
    "lat": -8.0578,
    "lon": -34.8829,
    "categoria": "agua | esgoto | residuos | outro",
    "descricao": "texto curto explicando a necessidade de obra",
    "fonte": "quem registrou e quando (ex.: 'visita técnica, 2026-07-10')"
  }
  ```
  Vazio (`"pontos": []`) até a equipe de pesquisa cadastrar o primeiro ponto
  real — nunca preenchido com exemplo fictício.
