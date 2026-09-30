"""
05 — Junção final: monta o painel consumido pelo front-end

Junta as saídas dos scripts 01-04 (população, notificações de
dengue/chikungunya, internações por diarreia aguda, déficit de
saneamento) por (codigo_ibge, ano), calcula as taxas de saúde por 100 mil
habitantes e grava o JSON final que `js/data.js` carrega via fetch.

Se alguma fonte ainda não tiver sido processada (ex.: 04_sinisa_saneamento
não rodou porque o export manual ainda não foi baixado), os campos
correspondentes ficam como `null` no JSON — o front-end trata a ausência
de dado explicitamente, em vez de mostrar um valor inventado.

Gera:
  data/processed/painel_pe.json
"""
import json

import pandas as pd

from config import ANO_FIM, ANO_INICIO, PROCESSED_DIR, UF_SIGLA


def carregar_opcional(nome: str) -> pd.DataFrame | None:
    path = PROCESSED_DIR / nome
    if not path.exists():
        print(f"  aviso: {nome} não encontrado — campos correspondentes ficarão nulos")
        return None
    return pd.read_csv(path)


def anos_cobertos(indicador: str) -> set[int]:
    """Anos em que o download da fonte de `indicador` foi 100% bem-sucedido.

    Usado para diferenciar "zero casos" (ano coberto, nenhuma notificação/
    internação) de "sem dado ainda" (ano não baixado) — ver docstrings de
    02_sinan_saude.py e 03_sih_diarreia.py.
    """
    anos = set()
    for nome in ("saude_cobertura_pe.csv", "saude_cobertura_diarreia_pe.csv"):
        df = carregar_opcional(nome)
        if df is None:
            continue
        anos |= set(df.loc[df["indicador"] == indicador, "ano"].astype(int))
    return anos


def main():
    municipios = pd.read_csv(PROCESSED_DIR / "municipios_pe.csv")
    base = municipios[["codigo_ibge", "municipio", "ano", "populacao", "mesorregiao"]].copy()

    notificacoes = carregar_opcional("saude_notificacoes_pe.csv")
    internacoes = carregar_opcional("saude_internacoes_dda_pe.csv")
    saneamento = carregar_opcional("saneamento_pe.csv")
    investimento = carregar_opcional("investimento_saneamento_pe.csv")

    if notificacoes is not None:
        pivot = notificacoes.pivot_table(
            index=["codigo_ibge", "ano"], columns="indicador", values="casos", aggfunc="sum"
        ).reset_index()
        base = base.merge(pivot, on=["codigo_ibge", "ano"], how="left")

    if internacoes is not None:
        base = base.merge(
            internacoes.rename(columns={"internacoes": "casos_diarreia"}),
            on=["codigo_ibge", "ano"], how="left",
        )

    if saneamento is not None:
        base = base.merge(saneamento, on=["codigo_ibge", "ano"], how="left")

    if investimento is not None:
        base = base.merge(investimento, on=["codigo_ibge", "ano"], how="left")

    # correção monetária do investimento para R$ do ano de referência (IPCA, ver
    # 04e_ibge_ipca.py). Sem o arquivo do IPCA, o investimento fica null — nunca
    # publicamos valor nominal como se fosse corrigido.
    ipca = carregar_opcional("ipca_anual.csv")
    ano_ref_ipca = None
    cols_invest = ["investimentoPrestador", "investimentoMunicipio", "investimentoEstado"]
    if ipca is not None and investimento is not None:
        ano_ref_ipca = int(ipca["ano_ref"].iloc[0])
        base = base.merge(ipca[["ano", "fator_para_ref"]], on="ano", how="left")
        for col in cols_invest:
            base[col] = base[col] * base["fator_para_ref"]  # ano sem fator -> NaN -> null
    elif investimento is not None:
        print("  aviso: ipca_anual.csv ausente — rode 04e_ibge_ipca.py; investimento ficará nulo")
        for col in cols_invest:
            base[col] = None

    # Em anos com cobertura completa da fonte, "sem notificação" é um zero
    # real (SINAN/SIH são censitários) — preenche só nesses anos, para não
    # confundir "zero casos" com "ano ainda não baixado" nos demais.
    for casos_col, indicador in (("taxaDengue", "taxaDengue"), ("taxaChikungunya", "taxaChikungunya"), ("casos_diarreia", "taxaDiarreia")):
        if casos_col not in base.columns:
            continue
        cobertos = base["ano"].isin(anos_cobertos(indicador))
        base.loc[cobertos, casos_col] = base.loc[cobertos, casos_col].fillna(0)

    # taxas de saúde por 100 mil habitantes (null se não houver contagem ou população)
    def taxa(casos_col):
        if casos_col not in base.columns:
            return pd.Series([None] * len(base))
        return (base[casos_col] / base["populacao"] * 100_000).round(1)

    base["taxaDengue"] = taxa("taxaDengue") if "taxaDengue" in base.columns else taxa("__nada__")
    base["taxaChikungunya"] = taxa("taxaChikungunya") if "taxaChikungunya" in base.columns else taxa("__nada__")
    base["taxaDiarreia"] = taxa("casos_diarreia") if "casos_diarreia" in base.columns else taxa("__nada__")

    # investimento em saneamento (R$) por 100 mil habitantes, por entidade executora
    # (2 casas: são valores monetários, não contagens de caso como as taxas de saúde acima)
    def taxa_investimento(col):
        if col not in base.columns:
            return pd.Series([None] * len(base))
        return (base[col] / base["populacao"] * 100_000).round(2)

    base["investimentoPrestadorPer100k"] = taxa_investimento("investimentoPrestador")
    base["investimentoMunicipioPer100k"] = taxa_investimento("investimentoMunicipio")
    base["investimentoEstadoPer100k"] = taxa_investimento("investimentoEstado")

    colunas_finais = [
        "codigo_ibge", "municipio", "ano", "populacao", "mesorregiao",
        "deficitAgua", "deficitEsgoto", "deficitResiduos",
        "taxaDengue", "taxaChikungunya", "taxaDiarreia",
        "investimentoPrestadorPer100k", "investimentoMunicipioPer100k", "investimentoEstadoPer100k",
    ]
    for c in colunas_finais:
        if c not in base.columns:
            base[c] = None
    base = base[colunas_finais]
    base.insert(1, "uf", UF_SIGLA)

    # NaN -> None para virar `null` no JSON (não 0 nem string vazia)
    registros = json.loads(base.to_json(orient="records"))

    payload = {
        "uf": UF_SIGLA,
        "anoInicio": ANO_INICIO,
        "anoFim": ANO_FIM,
        "fontes": {
            "populacao": "IBGE (API de Localidades + SIDRA, agregado 6579)",
            "saude": "DATASUS/SINAN (dengue, chikungunya) e SIH-SUS (internações por doenças infecciosas intestinais A00-A09, proxy de diarreia aguda)",
            "saneamento": "SINISA/SNIS (Ministério das Cidades) — importação manual, ver data/scripts/04_sinisa_saneamento.py",
            "investimento": "SNIS via Base dos Dados (basedosdados.br_mdr_snis) — investimento total em água+esgoto por entidade executora (prestador/município/estado), 2015-2022, ver data/scripts/04d_snis_investimento.py",
            "correcaoMonetaria": "IBGE/SIDRA tabela 1737 (IPCA, média anual do número-índice) — ver data/scripts/04e_ibge_ipca.py",
        },
        # ano cujos preços o investimento está expresso (null = sem correção disponível)
        "investimentoPrecosDe": ano_ref_ipca,
        "geradoEm": pd.Timestamp.utcnow().isoformat(),
        "municipios": registros,
    }

    out_path = PROCESSED_DIR / "painel_pe.json"
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK: {out_path} ({len(registros)} linhas, {base['codigo_ibge'].nunique()} municípios)")


if __name__ == "__main__":
    main()
