import requests
import csv
import json
import os
from datetime import datetime

DEST_FOLDER = "prospeccao"
CITY = "AMERICANA"
UF = "SP"

URL = f"https://ab2csv.com/v1/cnpj/estabelecimentos/{UF}.csv"


def baixar_e_filtrar():
    print("📥 Baixando base de SP da AB2CSV...")
    r = requests.get(URL, stream=True)
    r.raise_for_status()

    empresas = []
    print("🔍 Filtrando Americana/SP...")

    for line in r.iter_lines(decode_unicode=True):
        if not line:
            continue

        cols = line.split(";")
        try:
            municipio = cols[15].upper()
            uf = cols[16].upper()

            if municipio == CITY and uf == UF:
                empresas.append({
                    "cnpj": cols[0],
                    "razao_social": cols[4],
                    "nome_fantasia": cols[5],
                    "situacao": cols[6],
                    "data_abertura": cols[10],
                    "cnae_principal": cols[17],
                    "municipio": municipio,
                    "uf": uf
                })
        except:
            continue

    print(f"🏙️ Empresas encontradas em Americana/SP: {len(empresas)}")
    return empresas


def gerar_json():
    empresas = baixar_e_filtrar()
    os.makedirs(DEST_FOLDER, exist_ok=True)

    hoje = datetime.now().strftime("%Y-%m")
    destino = f"{DEST_FOLDER}/cnpjs-americana-{hoje}.json"

    with open(destino, "w", encoding="utf8") as f:
        json.dump(empresas, f, ensure_ascii=False, indent=2)

    print(f"💾 JSON salvo: {destino}")


if __name__ == "__main__":
    gerar_json()
    print("✅ Finalizado!")
