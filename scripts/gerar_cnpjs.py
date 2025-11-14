import requests
import json
import os
from datetime import datetime
import time

DEST_FOLDER = "prospeccao"
CITY = "AMERICANA"
UF = "SP"

BASE_URL = "https://jucesp-sp-api.vercel.app/empresas"


def listar_todas():
    pagina = 1
    todas = []

    while True:
        print(f"🔎 Página {pagina}...")

        r = requests.get(BASE_URL, params={
            "municipio": CITY,
            "uf": UF,
            "page": pagina
        })

        if r.status_code != 200:
            print("⚠️ Erro HTTP:", r.status_code)
            print(r.text)
            break

        data = r.json()

        empresas = data.get("empresas", [])
        if not empresas:
            break

        todas.extend(empresas)

        if not data.get("hasMore"):
            break

        pagina += 1
        time.sleep(0.1)

    print(f"📦 Total de empresas encontradas: {len(todas)}")
    return todas


def gerar_json():
    empresas = listar_todas()

    os.makedirs(DEST_FOLDER, exist_ok=True)

    hoje = datetime.now().strftime("%Y-%m")
    destino = f"{DEST_FOLDER}/cnpjs-americana-{hoje}.json"

    with open(destino, "w", encoding="utf8") as f:
        json.dump(empresas, f, ensure_ascii=False, indent=2)

    print(f"💾 JSON salvo em: {destino}")


if __name__ == "__main__":
    gerar_json()
    print("✅ Finalizado!")
