import requests
import csv
import json
import os
from datetime import datetime
import zipfile
import io

DEST_FOLDER = "prospeccao"
CITY = "AMERICANA"
UF = "SP"

URL = "https://dadosabertos.rfb.gov.br/CNPJ/Estabelecimentos.zip"


def baixar_e_filtrar():
    print("📥 Baixando base oficial da Receita (ZIP)...")
    r = requests.get(URL, stream=True)
    r.raise_for_status()

    print("📦 Extraindo arquivo ZIP em memória...")
    z = zipfile.ZipFile(io.BytesIO(r.content))

    nome_csv = [n for n in z.namelist() if n.endswith(".csv")][0]

    print("🔍 Processando CSV... Isso pode levar alguns segundos.")
    empresas = []

    with z.open(nome_csv) as f:
        reader = csv.reader(io.TextIOWrapper(f, "latin1"), delimiter=';')

        for row in reader:
            try:
                municipio = row[15].upper()
                uf = row[16].upper()

                if municipio == CITY and uf == UF:
                    cnpj = row[0]
                    razao = row[4]
                    fantasia = row[5]
                    situacao = row[6]
                    abertura = row[10]
                    cnae = row[17]

                    empresas.append({
                        "cnpj": cnpj,
                        "razao_social": razao,
                        "nome_fantasia": fantasia,
                        "situacao": situacao,
                        "data_abertura": abertura,
                        "cnae_principal": cnae,
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

    print(f"💾 JSON salvo em: {destino}")


if __name__ == "__main__":
    gerar_json()
    print("✅ Finalizado!")
