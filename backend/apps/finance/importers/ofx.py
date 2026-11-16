"""Leitor de OFX (SGML 1.x e XML 2.x): só o que importa, as transações do extrato."""

import re
from datetime import date

from apps.finance.importers.common import ParsedRow, ParseResult, parse_decimal

_TRANSACTION = re.compile(r"<STMTTRN>(.*?)</STMTTRN>", re.S | re.I)


def _field(block: str, tag: str) -> str | None:
    # SGML não fecha as tags: o valor vai até a próxima "<" ou fim da linha.
    m = re.search(rf"<{tag}>\s*([^<\r\n]*)", block, re.I)
    return m.group(1).strip() if m and m.group(1).strip() else None


def _date(raw: str) -> date:
    m = re.match(r"(\d{4})(\d{2})(\d{2})", raw)  # YYYYMMDD[hhmmss][.xxx][TZ]
    if not m:
        raise ValueError(f"data inválida: {raw!r}")
    return date(int(m[1]), int(m[2]), int(m[3]))


def parse_ofx(text: str) -> ParseResult:
    blocks = _TRANSACTION.findall(text)
    if not blocks and "<OFX" not in text.upper():
        raise ValueError("O arquivo não parece ser um OFX.")
    result = ParseResult()
    for i, block in enumerate(blocks, start=1):
        try:
            posted, amount_raw = _field(block, "DTPOSTED"), _field(block, "TRNAMT")
            if not posted or not amount_raw:
                raise ValueError("transação sem data ou valor")
            amount = parse_decimal(amount_raw, "," if "," in amount_raw else ".")
            if amount == 0:
                continue
            name, memo = _field(block, "NAME"), _field(block, "MEMO")
            description = " - ".join(p for p in (name, memo) if p) or "Sem descrição"
            fitid = _field(block, "FITID") or f"ofx:{_field(block, 'DTPOSTED')}:{amount}:{i}"
            result.rows.append(ParsedRow(i, _date(posted), description[:140], amount, fitid[:100]))
        except ValueError as e:
            result.errors.append((i, str(e)))
    return result
