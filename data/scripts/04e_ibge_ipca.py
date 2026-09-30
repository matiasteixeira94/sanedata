"""
04e — IPCA (IBGE/SIDRA) para correção monetária do investimento em saneamento

O investimento do 04d vem em R$ nominais de cada ano (2015-2022). Sem
correção, comparar 2015 com 2022 mistura crescimento real com inflação
(o IPCA acumulou ~50% no período). Este passo baixa o IPCA e gera, por ano,
o fator que leva R$ daquele ano para R$ do ano de referência (ANO_FIM).

Método (documentado aqui e em data/scripts/README.md):
  - Série: IPCA número-índice mensal, Brasil (SIDRA tabela 1737, variável
    2266, base dez/1993 = 100).
  - Índice do ano = média dos 12 números-índice mensais — o investimento é
    realizado ao longo do ano inteiro, então a média é mais representativa
    que o índice de dezembro.
  - fator(ano) = índice_médio(ANO_FIM) / índice_médio(ano).
  - Ano sem os 12 meses publicados fica sem fator (e o investimento daquele
    ano fica sem correção possível -> o 05 grava null, não um valor nominal
    rotulado como corrigido).

Gera:
  data/raw/ibge/ipca_mensal.json      (cache da resposta do SIDRA)
  data/processed/ipca_anual.csv       (ano, ipca_indice_medio, meses, fator_para_ref, ano_ref)
"""
import json

import pandas as pd
import requests

from config import ANO_FIM, ANO_INICIO, PROCESSED_DIR, RAW_IBGE_DIR

SIDRA_IPCA_URL = "https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/2266/p/{inicio}01-{fim}12"


def baixar_ipca() -> list[dict]:
    cache = RAW_IBGE_DIR / "ipca_mensal.json"
    url = SIDRA_IPCA_URL.format(inicio=ANO_INICIO, fim=ANO_FIM)
    try:
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
        dados = resp.json()
        cache.write_text(json.dumps(dados, ensure_ascii=False), encoding="utf-8")
    except requests.RequestException as erro:
        if not cache.exists():
            raise
        print(f"  aviso: SIDRA indisponível ({erro}) — usando cache {cache}")
        dados = json.loads(cache.read_text(encoding="utf-8"))
    return dados[1:]  # 1ª linha do SIDRA é o cabeçalho descritivo


def main():
    linhas = baixar_ipca()
    mensal = pd.DataFrame({
        "periodo": [l["D3C"] for l in linhas],
        "indice": pd.to_numeric([l["V"] for l in linhas], errors="coerce"),
    }).dropna()
    mensal["ano"] = mensal["periodo"].str[:4].astype(int)

    anual = mensal.groupby("ano").agg(ipca_indice_medio=("indice", "mean"), meses=("indice", "size")).reset_index()
    completos = anual[anual["meses"] == 12]
    if ANO_FIM not in set(completos["ano"]):
        raise SystemExit(f"IPCA de {ANO_FIM} ainda não tem os 12 meses publicados no SIDRA — ajuste config.ANO_FIM ou rode mais tarde.")
    ref = completos.loc[completos["ano"] == ANO_FIM, "ipca_indice_medio"].iloc[0]

    anual["fator_para_ref"] = anual.apply(
        lambda r: round(ref / r["ipca_indice_medio"], 6) if r["meses"] == 12 else None, axis=1
    )
    anual["ano_ref"] = ANO_FIM
    anual["ipca_indice_medio"] = anual["ipca_indice_medio"].round(4)

    out_path = PROCESSED_DIR / "ipca_anual.csv"
    anual.to_csv(out_path, index=False)
    print(f"OK: {out_path}")
    print(anual.to_string(index=False))


if __name__ == "__main__":
    main()
