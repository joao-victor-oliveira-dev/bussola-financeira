"""Leitor de CSV com presets de banco e mapeamento personalizado de colunas."""

import csv
import hashlib
import io
from collections import Counter
from datetime import date, datetime

from apps.finance.importers.common import ParsedRow, ParseResult, normalize_text, parse_decimal

DATE_FORMATS = {"dd/mm/aaaa": "%d/%m/%Y", "aaaa-mm-dd": "%Y-%m-%d", "mm/dd/aaaa": "%m/%d/%Y"}

PRESETS = {
    "nubank_conta": {
        "date": "Data",
        "description": "Descrição",
        "amount": "Valor",
        "id": "Identificador",
        "date_format": "dd/mm/aaaa",
        "decimal": ".",
    },
}


def _hash_id(day: date, amount, description: str, occurrence: int) -> str:
    # Sem identificador do banco: data + valor + descrição + nº da repetição no arquivo.
    # Estável entre reimportações e distingue dois lançamentos iguais no mesmo dia.
    key = f"{day.isoformat()}|{amount}|{normalize_text(description)}|{occurrence}"
    return "h:" + hashlib.sha1(key.encode()).hexdigest()[:24]


def _mapping(preset: str, mapping: dict | None) -> dict:
    if preset in PRESETS:
        return PRESETS[preset]
    if not mapping or not all(mapping.get(k) for k in ("date", "description", "amount")):
        raise ValueError("Informe as colunas de data, descrição e valor.")
    return {"date_format": "dd/mm/aaaa", "decimal": ",", **mapping}


def parse_csv(text: str, preset: str, mapping: dict | None = None) -> ParseResult:
    cfg = _mapping(preset, mapping)
    sample = text[:2048]
    delimiter = ";" if sample.count(";") > sample.count(",") else ","
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")), delimiter=delimiter)
    headers = [h.strip() for h in (reader.fieldnames or [])]
    reader.fieldnames = headers
    missing = [cfg[k] for k in ("date", "description", "amount") if cfg[k] not in headers]
    if missing:
        raise ValueError(f"Colunas não encontradas no arquivo: {', '.join(missing)}.")

    date_format = DATE_FORMATS.get(cfg["date_format"], "%d/%m/%Y")
    result = ParseResult()
    seen: Counter[tuple] = Counter()
    for row in reader:
        line = reader.line_num  # linha real no arquivo (o DictReader pula as vazias)
        if not any((v or "").strip() for v in row.values()):
            continue  # linha vazia
        try:
            day = datetime.strptime((row[cfg["date"]] or "").strip(), date_format).date()
            amount = parse_decimal(row[cfg["amount"]] or "", cfg["decimal"])
            if amount == 0:
                continue
            description = (row[cfg["description"]] or "").strip()[:140] or "Sem descrição"
            ext = (row.get(cfg.get("id") or "") or "").strip()
            if not ext:
                key = (day, amount, normalize_text(description))
                seen[key] += 1
                ext = _hash_id(day, amount, description, seen[key])
            result.rows.append(ParsedRow(line, day, description, amount, ext[:100]))
        except (ValueError, KeyError) as e:
            result.errors.append((line, str(e) or "linha inválida"))
    return result
