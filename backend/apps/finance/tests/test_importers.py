import datetime
from decimal import Decimal

import pytest

from apps.finance.importers.common import decode_bytes, normalize_text, parse_decimal
from apps.finance.importers.csv_reader import parse_csv
from apps.finance.importers.ofx import parse_ofx

D = datetime.date

OFX_SGML = """OFXHEADER:100
DATA:OFXSGML
VERSION:102
ENCODING:USASCII

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKTRANLIST>
<DTSTART>20261101000000[-3:BRT]
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261103120000[-3:BRT]
<TRNAMT>-42,90
<FITID>ABC123
<MEMO>Supermercado Dia
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261105
<TRNAMT>7800.00
<FITID>ABC124
<NAME>Salario Empresa X
</STMTTRN>
<STMTTRN>
<TRNTYPE>OTHER
<DTPOSTED>20261106
<TRNAMT>0.00
<FITID>ZERO
<MEMO>Ajuste
</STMTTRN>
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>
"""

OFX_XML = """<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="220"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261110000000.000[-3:BRT]</DTPOSTED>
<TRNAMT>-1234.56</TRNAMT><FITID>X1</FITID><NAME>Aluguel</NAME><MEMO>Novembro</MEMO></STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>
"""


# ---- utilitários ----
def test_normalize_text():
    assert normalize_text("  PAGAMENTO  Pix   João ") == "pagamento pix joao"


@pytest.mark.parametrize(
    "raw, decimal, expected",
    [
        ("1.234,56", ",", "1234.56"),
        ("-42,90", ",", "-42.90"),
        ("1,234.56", ".", "1234.56"),
        ("-7800.00", ".", "-7800.00"),
        ("R$ 10,00", ",", "10.00"),
    ],
)
def test_parse_decimal(raw, decimal, expected):
    assert parse_decimal(raw, decimal) == Decimal(expected)


def test_parse_decimal_invalid():
    with pytest.raises(ValueError):
        parse_decimal("abc", ",")


def test_decode_bytes_bom_and_latin1():
    assert decode_bytes("﻿Data;Valor".encode()) == "Data;Valor"
    assert decode_bytes("Descrição".encode("latin-1")) == "Descrição"


# ---- OFX ----
def test_ofx_sgml():
    result = parse_ofx(OFX_SGML)
    assert result.errors == []
    rows = result.rows
    assert [(r.date, r.amount, r.description, r.external_id) for r in rows] == [
        (D(2026, 11, 3), Decimal("-42.90"), "Supermercado Dia", "ABC123"),
        (D(2026, 11, 5), Decimal("7800.00"), "Salario Empresa X", "ABC124"),
    ]  # valor zero ignorado


def test_ofx_xml_joins_name_and_memo():
    rows = parse_ofx(OFX_XML).rows
    assert len(rows) == 1
    assert (rows[0].date, rows[0].amount) == (D(2026, 11, 10), Decimal("-1234.56"))
    assert rows[0].description == "Aluguel - Novembro"


def test_ofx_bad_transaction_is_reported_not_fatal():
    text = OFX_SGML.replace("<DTPOSTED>20261105", "<DTPOSTED>lixo")
    result = parse_ofx(text)
    assert len(result.rows) == 1
    assert len(result.errors) == 1


def test_ofx_without_transactions_is_error():
    with pytest.raises(ValueError):
        parse_ofx("isto não é um ofx")


# ---- CSV ----
NUBANK = """Data,Valor,Identificador,Descrição
03/11/2026,-42.90,aaa-111,Compra no débito - Supermercado
05/11/2026,7800.00,aaa-222,Transferência recebida - Empresa X
"""


def test_csv_nubank_preset():
    rows = parse_csv(NUBANK, "nubank_conta").rows
    assert [(r.date, r.amount, r.description, r.external_id) for r in rows] == [
        (D(2026, 11, 3), Decimal("-42.90"), "Compra no débito - Supermercado", "aaa-111"),
        (D(2026, 11, 5), Decimal("7800.00"), "Transferência recebida - Empresa X", "aaa-222"),
    ]


def test_csv_custom_semicolon_comma_decimal_and_errors():
    text = (
        "data;historico;valor\n2026-11-03;Padaria;-12,50\n\n"
        "2026-11-04;Erro;abc\n2026-11-05;Pix;1.200,00\n"
    )
    mapping = {
        "date": "data",
        "description": "historico",
        "amount": "valor",
        "date_format": "aaaa-mm-dd",
        "decimal": ",",
    }
    result = parse_csv(text, "personalizado", mapping)
    assert [(r.date, r.amount) for r in result.rows] == [
        (D(2026, 11, 3), Decimal("-12.50")),
        (D(2026, 11, 5), Decimal("1200.00")),
    ]
    assert [line for line, _ in result.errors] == [4]


def test_csv_hash_id_is_stable_and_distinguishes_repeats():
    text = "data;desc;valor\n03/11/2026;Café;-5,00\n03/11/2026;Café;-5,00\n"
    mapping = {"date": "data", "description": "desc", "amount": "valor"}
    a = parse_csv(text, "personalizado", mapping).rows
    b = parse_csv(text, "personalizado", mapping).rows
    assert [r.external_id for r in a] == [r.external_id for r in b]  # estável
    assert a[0].external_id != a[1].external_id  # dois cafés iguais no mesmo dia


def test_csv_missing_column_is_error():
    mapping = {"date": "data", "description": "desc", "amount": "valor"}
    with pytest.raises(ValueError, match="valor"):
        parse_csv("data;desc\n03/11/2026;x\n", "personalizado", mapping)


def test_csv_custom_requires_mapping():
    with pytest.raises(ValueError):
        parse_csv(NUBANK, "personalizado", None)
