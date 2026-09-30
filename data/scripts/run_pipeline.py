"""
Orquestrador do pipeline — roda os passos 01 a 05 em sequência.

Uso:
  python run_pipeline.py

Idempotente: cada passo cacheia seus downloads em data/raw/ e só baixa o
que ainda não existe localmente, então rodar de novo para atualizar (ex.:
todo início de ano, quando o DATASUS e o SINISA fecham o ciclo anterior)
é seguro e rápido — só o que for novo é buscado de novo.

Para automatizar (cron/Agendador de Tarefas do Windows), agende este
script para rodar periodicamente, por exemplo depois que:
  - o SINAN consolida os dados "FINAIS" do ano anterior (normalmente
    meses depois do fim do ano-calendário);
  - o ciclo de coleta do SINISA do ano-base fecha (ver
    gov.br/cidades/.../sinisa — normalmente entre abril e setembro);
  - o SIH-SUS publica a competência do mês.
Depois de cada nova rodada, ajuste config.ANO_FIM se um novo ano-base
tiver ficado disponível.
"""
import subprocess
import sys
from pathlib import Path

PASSOS = [
    "01_ibge_municipios.py",
    "02_sinan_saude.py",
    "03_sih_diarreia.py",
    "04_sinisa_saneamento.py",
    "04a_sinisa_basedosdados.py",
    "04b_sinisa_dashboard_publico.py",
    "04c_sinisa_dashboard_publico_esgoto_residuos.py",
    "04d_snis_investimento.py",
    "04e_ibge_ipca.py",
    "05_build_painel.py",
    "06_ibge_malha_municipios.py",
]


def main():
    scripts_dir = Path(__file__).resolve().parent
    for passo in PASSOS:
        print(f"\n{'='*70}\n{passo}\n{'='*70}")
        resultado = subprocess.run([sys.executable, str(scripts_dir / passo)], cwd=scripts_dir)
        if resultado.returncode != 0:
            print(f"\nPARADO: {passo} terminou com erro (código {resultado.returncode}).")
            sys.exit(resultado.returncode)
    print("\nPipeline concluído. Veja data/processed/painel_pe.json")


if __name__ == "__main__":
    main()
