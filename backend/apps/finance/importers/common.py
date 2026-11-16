"""Tipos e utilitários comuns aos leitores de extrato."""

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation


@dataclass(frozen=True)
class ParsedRow:
    line: int
    date: date
    description: str
    amount: Decimal  # com sinal: negativo = saída
    external_id: str


@dataclass
class ParseResult:
    rows: list[ParsedRow] = field(default_factory=list)
    errors: list[tuple[int, str]] = field(default_factory=list)  # (linha, mensagem)


def normalize_text(text: str) -> str:
    """Minúsculas, sem acentos e espaços colapsados: base para regras e comparações."""
    no_accents = "".join(
        c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c)
    )
    return " ".join(no_accents.lower().split())


def parse_decimal(raw: str, decimal: str = ",") -> Decimal:
    """'1.234,56' (decimal=',') ou '1,234.56' (decimal='.') → Decimal. Inválido → ValueError."""
    cleaned = re.sub(r"[^\d,.\-]", "", raw.strip())
    thousands = "." if decimal == "," else ","
    cleaned = cleaned.replace(thousands, "").replace(decimal, ".")
    try:
        value = Decimal(cleaned)
    except InvalidOperation:
        raise ValueError(f"valor inválido: {raw!r}") from None
    if not value.is_finite():
        raise ValueError(f"valor inválido: {raw!r}")
    return value.quantize(Decimal("0.01"))


def guess_decimal(raw: str) -> str:
    """Separador decimal de um valor solto: o último entre ',' e '.' que aparece.

    '1,234.56' → '.', '1.234,56' → ',', '-42,90' → ',', '7800.00' → '.'.
    """
    comma, dot = raw.rfind(","), raw.rfind(".")
    return "," if comma > dot else "."


def decode_bytes(data: bytes) -> str:
    """UTF-8 (com ou sem BOM); se falhar, Latin-1 (comum em extratos de bancos brasileiros)."""
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("latin-1")
