# data/scripts — pipeline de dados (SaneData — Painel de Priorização em Saneamento & Saúde Pública)

Pipeline em Python que importa, trata e padroniza dados **oficiais** de
IBGE, DATASUS (SINAN e SIH-SUS) e SINISA/SNIS para os municípios de
**Pernambuco**, no período de **2015 a 2024** (ajustável em `config.py`).
Não há nenhum dado fictício/ilustrativo em nenhum passo — quando uma fonte
ainda não foi processada, o campo correspondente fica `null` no JSON final,
nunca um valor inventado.

## Como rodar

```bash
cd data/scripts
pip install -r requirements.txt
python run_pipeline.py        # roda 01 a 05 em sequência
```

Ou passo a passo (útil para depurar uma fonte específica):

```bash
python 01_ibge_municipios.py     # municípios + população (IBGE)
python 02_sinan_saude.py         # dengue e chikungunya (SINAN/DATASUS)
python 03_sih_diarreia.py        # internações por diarreia aguda (SIH-SUS)
python 04_sinisa_saneamento.py   # déficit de saneamento (SINISA/SNIS) — passo manual, ver abaixo
python 04a_sinisa_basedosdados.py --billing-project SEU_PROJETO_GCP  # água/esgoto 2015-2022, automatizado — ver abaixo
python 04b_sinisa_dashboard_publico.py                    # água 2023+, automatizado — ver abaixo
python 04c_sinisa_dashboard_publico_esgoto_residuos.py    # esgoto e resíduos 2023+, automatizado — ver abaixo
python 04d_snis_investimento.py  # investimento em água/esgoto 2015-2022, automatizado — ver abaixo
python 05_build_painel.py        # junta tudo em data/processed/painel_pe.json
python 06_ibge_malha_municipios.py  # polígonos dos municípios, para o mapa
```

Todo download é cacheado em `data/raw/` — rodar de novo não baixa o que já
existe, então o pipeline é seguro e rápido para **atualizações futuras**
(reexecute `run_pipeline.py` periodicamente; ver seção "Atualizações
futuras" no fim deste arquivo).

## Fontes e o que cada script faz

### 01 — IBGE (município e população)
- **API de Localidades** (`servicodados.ibge.gov.br`): lista oficial dos
  185 municípios de PE, com código IBGE de 7 dígitos.
- **API SIDRA**, agregado 6579 ("População residente estimada"), variável
  9324: série anual de população por município.
- 100% automatizado, sem chave de API.
- Anos de Censo (ex.: 2022) não têm estimativa nesta tabela do SIDRA — a
  lacuna é preenchida por interpolação linear entre os anos com dado real
  adjacentes da própria série (marcado na coluna `pop_interpolada`), não
  por um valor inventado.

### 02 — SINAN (dengue e chikungunya)
- FTP público `ftp.datasus.gov.br/dissemin/publicos/SINAN/DADOS/FINAIS/`,
  arquivos nacionais `DENGBR<AA>.dbc` / `CHIKBR<AA>.dbc` (um por ano).
- 100% automatizado. Cada notificação é filtrada pelo município de
  **residência** do paciente (`ID_MN_RESI`) e contada por município/ano.
- **Não usamos o pacote `pysus`** para o download em si: as versões
  testadas (1.0.1 e 2.6.3) têm um bug de mistura de separador de caminho
  (`/` vs `\`) que quebra tanto o cliente novo (catálogo DuckLake em nuvem)
  quanto o cliente antigo (varredura recursiva de diretório) no Windows.
  Em vez disso, `lib/datasus.py` acessa o FTP diretamente (`ftplib`) e usa
  só `pyreaddbc` (dependência do próprio pysus) para descompactar o
  formato `.dbc` — isso é estável e não depende da parte com bug.
- A leitura do `.dbf` resultante usa um leitor binário rápido feito com
  `struct` (`lib.datasus.dbf_read_columns`) em vez da biblioteca `dbfread`
  linha a linha: para os arquivos nacionais de dengue (até ~1,6 milhão de
  registros/ano) isso reduz o tempo de leitura de ~3,5 minutos para
  ~1-2 segundos por arquivo, o que é o que torna viável reprocessar o
  histórico inteiro numa atualização futura.
- O `.dbf` descompactado (bem maior que o `.dbc` original — um único ano de
  dengue nacional chega a ~2 GB descompactado) é apagado logo depois de
  lido; só o `.dbc` fica cacheado em `data/raw/sinan/`. Reconstituir o
  `.dbf` a partir do `.dbc` cacheado leva poucos segundos, então isso não
  penaliza reexecuções — e evita que o cache ocupe dezenas de GB à toa.

### 03 — SIH-SUS (proxy de diarreia aguda)
- FTP público, arquivos **já recortados por UF**:
  `.../SIHSUS/200801_/Dados/RDPE<AA><MM>.dbc` (um por mês).
- **Por que SIH e não SINAN para "diarreia aguda"?** O SINAN só recebe
  notificação de **surtos** de doença diarreica aguda (Portaria GM/MS
  204/2016) — não existe uma série anual de casos individuais por
  município comparável a dengue/chikungunya nessa base. Por isso usamos
  como proxy as internações hospitalares (SIH-SUS) cujo diagnóstico
  principal (CID-10) está no capítulo "Doenças infecciosas intestinais"
  (A00-A09) — abordagem padrão na literatura de saúde ambiental. Ver
  `config.CID_DIARREIA_AGUDA_PREFIXOS` para trocar a definição, se a
  metodologia da tese exigir outro recorte.
- 100% automatizado.

### 04 — SINISA/SNIS (déficit de água, esgoto e resíduos) — **passo manual**
Diferente das outras três fontes, o SINISA (que sucedeu o SNIS em 2024)
**não tem API pública de download em massa**. Isso foi verificado
diretamente antes de decidir o desenho deste script:
- o portal de dados abertos do Ministério das Cidades
  (`dadosabertos.cidades.gov.br`) só aponta para o aplicativo web de
  consulta, sem recurso CSV/JSON direto;
- o antigo aplicativo de Série Histórica (`app4.mdr.gov.br/serieHistorica`)
  saiu do ar (domínio não resolve mais, confirmado em 2026-07-08);
- o novo Painel de Indicadores SINISA é só interface de formulário (Vue/
  Inertia), sem endpoint JSON documentado — as rotas internas de consulta
  (`/indicador`, `/situacao-municipio`) dependem de estado de sessão do
  formulário e retornam erro sem os parâmetros exatos que só a navegação
  pelo navegador monta corretamente (confirmado testando essas rotas
  diretamente).

Para água/esgoto 2015-2022 há um atalho automatizado — ver
`04a_sinisa_basedosdados.py` abaixo — que não depende deste passo manual.
Resíduos sólidos e os anos 2023-2024 de água/esgoto continuam exigindo o
passo manual:
1. Acesse **https://indicadores-sinisa-2025.cidades.gov.br/**.
2. Filtre por **Estado = Pernambuco**, todos os municípios, e pelos anos
   configurados em `config.ANO_INICIO`..`config.ANO_FIM`.
3. Exporte a planilha (CSV ou XLSX) com os indicadores de:
   - Água: índice de atendimento (total ou urbano) com rede de água
   - Esgoto: índice de atendimento (total ou urbano) com rede de esgoto
   - Resíduos sólidos: taxa de cobertura do serviço de coleta domiciliar
4. Salve o arquivo, sem renomear, em `data/raw/sinisa/`.
5. Rode `python 04_sinisa_saneamento.py`.

O script reconhece automaticamente as colunas de código de município, ano
e cobertura (tanto pelos códigos clássicos do SNIS quanto por trechos do
nome do indicador — ver `CAMPOS_COBERTURA` no topo do script). Se a
planilha baixada usar cabeçalhos diferentes dos esperados, o script avisa
exatamente quais colunas não conseguiu casar (com a lista de colunas
disponíveis no arquivo) em vez de gerar um déficit errado ou fictício —
ajuste `CAMPOS_COBERTURA`/`CAMPOS_MUNICIPIO`/`CAMPOS_ANO` nesse caso.

Déficit é sempre `100 - cobertura(%)`.

### 04a — Água e esgoto via Base dos Dados (BigQuery) — automatizado, cobertura parcial
Complemento automatizado ao passo 04: a [Base dos Dados](https://basedosdados.org)
mantém uma cópia tratada da série histórica do SNIS em BigQuery
(`basedosdados.br_mdr_snis.municipio_agua_esgoto`), sem precisar do
formulário manual do Ministério das Cidades. Verificado antes de escrever
o script (não presumido):

- **Só cobre água e esgoto** — não existe tabela de resíduos sólidos na
  Base dos Dados (conferido tanto na listagem completa do dataset
  `br_mdr_snis` quanto no repositório
  [`basedosdados/queries-basedosdados`](https://github.com/basedosdados/queries-basedosdados)).
  `deficitResiduos` continua exigindo o passo manual (04).
- **Só cobre até 2022** (o SNIS foi descontinuado e sucedido pelo SINISA
  em 2024) — os anos 2023-2024 de água/esgoto também continuam exigindo o
  passo manual.
- Para esgoto não existe uma coluna "índice de atendimento total" pronta
  como a de água (`indice_atendimento_total_agua`, IN023); usamos
  `indice_coleta_esgoto`, que é o indicador que o próprio SNIS publica
  para esse componente — não é equivalente 1:1 ao de água (é referido à
  população atendida com água, não à população total do município).

Requer `pip install basedosdados` e um projeto Google Cloud (nível
gratuito/sandbox do BigQuery, sem cartão) — passe o project id via
`--billing-project` ou variável de ambiente `BD_BILLING_PROJECT_ID`. Pede
login interativo (abre o navegador) na primeira execução; sem projeto
configurado, o passo é pulado (não quebra o `run_pipeline.py`).

Faz merge com `data/processed/saneamento_pe.csv` em vez de sobrescrever —
preserva `deficitResiduos` e qualquer ano já importado manualmente pelo
passo 04. O passo 04, por sua vez, também foi ajustado para fazer merge
(não sobrescrever), então a ordem entre 04 e 04a no `run_pipeline.py` não
importa para não perder dado.

### 04b — Água via o Painel de Indicadores público do SINISA — automatizado, só água
Segundo complemento automatizado: o novo Painel de Indicadores do SINISA
(`indicadores-sinisa-2025.cidades.gov.br`, sucessor do antigo app de Série
Histórica que saiu do ar) expõe, na própria rota pública `/dashboard?modulo=agua`
— sem login —, os indicadores por município já embutidos no HTML da página
(payload Inertia.js), incluindo `IAG0001` ("Atendimento da população total
com rede de abastecimento de água"), o mesmo conceito do IN023 usado no 04a.
Verificado antes de escrever o script (não presumido):

- **Só o módulo água tem indicador comparável ao IN023.** O módulo esgoto
  (`modulo=esgoto`) existe e está habilitado, mas o único indicador de
  atendimento que publica (`IES0001`) é referido à população **total**,
  diferente da base usada no 04a para esgoto (`indice_coleta_esgoto`,
  referido à população atendida com água) — misturar as duas na mesma
  coluna `deficitEsgoto` criaria uma quebra metodológica não documentada
  dentro de uma única série. Por isso o 04b só importa água; esgoto por
  este canal fica para trabalho futuro que assuma essa mudança de definição
  explicitamente (ou grave em coluna separada).
- **O módulo resíduos sólidos existe no código do front-end do painel, mas
  está desabilitado** ("Módulos disponíveis em breve", confirmado lendo o
  bundle JS da página inicial) — não publica nenhum dado ainda.
  `deficitResiduos` continua exigindo o passo manual (04) quando/se for
  disponibilizado.
- **O ano-base não vem como campo estruturado na API** — só como texto na
  página inicial ("dados do ano base 2023" no momento em que este script foi
  escrito). O script extrai esse ano do texto em tempo de execução (em vez
  de fixá-lo no código) para continuar correto quando o SINISA publicar um
  novo ciclo; se o texto mudar de formato, o script para com erro em vez de
  adivinhar o ano.
- **Possível quebra de nível entre 2022 (Base dos Dados/SNIS) e 2023
  (painel público/SINISA)** para o mesmo município — consistente com a
  descontinuação do SNIS e sucessão pelo SINISA em 2024 (mudança
  institucional documentada publicamente, não um bug deste script), mas
  quem for interpretar a série 2015-2024 completa deve tratar esse salto
  como possível efeito de metodologia, não necessariamente uma mudança real
  de cobertura.
- A rota exige um cookie de sessão já iniciado (visitar `/` antes) e um
  `User-Agent` de navegador — uma requisição "crua" (sem esses dois) é
  barrada pelo WAF na frente do portal com HTTP 500.

Não precisa de nenhuma credencial. Faz merge com
`data/processed/saneamento_pe.csv` do mesmo jeito que o 04a (só preenche
`deficitAgua` onde ainda está nulo).

### 04c — Esgoto e resíduos via o mesmo Painel público do SINISA — automatizado
Quando o 04b foi escrito (2026-07-08), o módulo `esgoto` só publicava um
indicador (`IES0001`) que o 04b decidiu não importar por parecer referido a
uma base populacional diferente da do 04a, e o módulo `residuos_solidos`
estava desabilitado ("Módulos disponíveis em breve"). Reverificado em
2026-07-11 (não presumido): os dois módulos passaram a publicar dado real
para PE:
- **`IES0001`** ("Atendimento da população total com rede coletora de
  esgoto") é, na verdade, referido à população **total** — a mesma base do
  `IAG0001` (água) já importado pelo 04b. A ressalva do 04b era sobre a
  diferença entre `IES0001` e o indicador de esgoto do 04a
  (`indice_coleta_esgoto`, referido à população atendida com água) — ou
  seja, o salto de metodologia é entre a fonte antiga (SNIS/04a, até 2022)
  e a nova (SINISA/04c, 2023 em diante), o mesmo tipo de salto institucional
  já documentado para água entre 04a e 04b.
- **`IRS0001`** ("Cobertura da população total com coleta de resíduos
  sólidos domiciliares") é exatamente o indicador que o passo manual 04 já
  esperava para `deficitResiduos` ("taxa de cobertura do serviço de coleta
  domiciliar"). Antes deste script, `deficitResiduos` não tinha **nenhuma**
  fonte preenchida em nenhum ano — sempre `null`. A partir de 2023 (o único
  ano-base publicado neste portal), passa a ter dado real para 143 dos 185
  municípios de PE.
- Assim como o 04b, o portal serve um único snapshot fixo — o parâmetro
  `?ano=` não muda o retorno (testado com 2023 e 2024, resultado idêntico).
  **Não há como obter 2024 ou 2025 por aqui**: o próximo ciclo do SINISA
  ainda não foi publicado neste portal (verificado em 2026-07-11; repita
  esta checagem quando for atualizar o painel de novo).

Faz merge com `data/processed/saneamento_pe.csv` do mesmo jeito que o 04a/04b
(só preenche `deficitEsgoto`/`deficitResiduos` onde ainda estão nulos).

`deficitResiduos` continua fora de `INDICADORES_INDICE` (`js/data.js`) — o
índice de priorização composto exige os 5 indicadores em todos os anos da
série para ser comparável ao longo do tempo, e resíduos só existe a partir
de 2023. O dado aparece mesmo assim na camada "Investimento" do mapa
geográfico e na tabela comparativa de Comparações, do jeito que o resto do
painel já mostra "sem dado" quando um indicador não está disponível.

### 04d — Investimento em saneamento (SNIS financeiro) — automatizado, cobertura parcial
Mesma tabela do 04a (`basedosdados.br_mdr_snis.municipio_agua_esgoto`), mas
lendo as colunas financeiras em vez das de cobertura: investimento total
realizado em água+esgoto, desagregado por entidade executora —
`investimento_total_prestador` (FN033), `investimento_total_municipio`
(FN048) e `investimento_total_estado` (FN058). Confirmado no `schema.yml` do
repositório
[`basedosdados/queries-basedosdados`](https://github.com/basedosdados/queries-basedosdados)
antes de escrever o script (não presumido).

Mesmas limitações do 04a, por ser a mesma fonte: só água+esgoto (não existe
indicador financeiro de resíduos sólidos nesta tabela nem em nenhuma outra do
dataset `br_mdr_snis`), só até 2022 (SNIS descontinuado, sem passo manual
equivalente para preencher 2023-2024 de investimento). O CSV guarda R$
nominais; a correção monetária é feita no 05 com o fator do 04e (abaixo).

### 04e — IPCA para correção monetária do investimento — automatizado

`python 04e_ibge_ipca.py` baixa o IPCA número-índice mensal (IBGE/SIDRA,
tabela 1737, variável 2266), calcula a média de cada ano e grava
`data/processed/ipca_anual.csv` com o fator
`IPCA_médio(ANO_FIM) ÷ IPCA_médio(ano)`. O 05 multiplica o investimento de
cada ano por esse fator, então o `painel_pe.json` traz investimento em R$ do
ano de referência (campo `investimentoPrecosDe`). Usa a média anual (e não
dezembro) porque o investimento é executado ao longo do ano. Sem o arquivo
do IPCA, o 05 grava investimento `null` em vez de publicar valor nominal
como se fosse corrigido.

Mesmo requisito do 04a (`pip install basedosdados`, projeto Google Cloud via
`--billing-project`/`BD_BILLING_PROJECT_ID`, passo pulado sem quebrar o
pipeline se não configurado). Grava
`data/processed/investimento_saneamento_pe.csv`
(`codigo_ibge, ano, investimentoPrestador, investimentoMunicipio, investimentoEstado`),
que o `05_build_painel.py` converte em taxa por 100 mil habitantes.

### 05 — Junção final
Junta as quatro fontes por `(codigo_ibge, ano)`, calcula as taxas de saúde
por 100 mil habitantes e grava `data/processed/painel_pe.json`, que é o
único arquivo que o front-end (`js/data.js`) lê. Fontes ainda não
processadas (ex.: SINISA antes do passo manual) resultam em campos `null`
— o front-end mostra "sem dado" nesses casos, nunca um número inventado.

### 06 — Malha territorial (para o mapa geográfico)
- **API de Malhas** (`servicodados.ibge.gov.br`): polígonos dos 185
  municípios de PE, qualidade "intermediária" (~220 KB, suficiente para
  mapa em tela).
- 100% automatizado, sem chave de API. Independente dos passos 01-05 e da
  ordem em que roda — a malha territorial não muda de um ano para outro.
- Gera `data/processed/malha_municipios_pe.geojson`, casado com o painel
  por `codarea` == `codigo_ibge`. Usado por `js/geo.js`.

## Atualizações futuras

O pipeline foi desenhado para ser reexecutado periodicamente sem
retrabalho manual (exceto o passo 04):

- **IBGE**: a série de população e a lista de municípios podem ser
  buscadas de novo a qualquer momento (`01_ibge_municipios.py`).
- **SINAN/SIH-SUS**: o DATASUS costuma consolidar os dados "FINAIS" de um
  ano-calendário meses depois do seu fim; reexecutar `02`/`03` mais tarde
  captura essa consolidação, e o cache em `data/raw/` evita rebaixar o que
  já está completo.
- **SINISA**: o ciclo de coleta de cada ano-base costuma abrir entre
  abril e setembro do ano seguinte (ver `gov.br/cidades/.../sinisa`); repita
  o passo manual da seção 04 quando um novo ano-base for publicado.
- Depois de cada rodada, se um novo ano tiver ficado disponível, atualize
  `config.ANO_FIM` e rode `run_pipeline.py` de novo.
- Para automatizar por completo (exceto o passo 04), agende
  `run_pipeline.py` no Agendador de Tarefas do Windows ou em um cron —
  ele é idempotente e seguro para rodar repetidamente.

## Dependências e ambiente

- Python 3.11+, ver `requirements.txt`.
- Não é necessário `pysus` como pacote instalado para os scripts
  funcionarem (só `pyreaddbc`, uma de suas dependências, para
  descompactar `.dbc`) — ver nota na seção 02 acima sobre o bug de path
  no Windows nas versões atuais do `pysus`.
