from django.conf import settings
from django.db import models
from django.db.models import F, Q

MONEY = {"max_digits": 14, "decimal_places": 2}


class Owned(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class AccountType(models.TextChoices):
    CHECKING = "checking", "Conta corrente"
    SAVINGS = "savings", "Poupança"
    WALLET = "wallet", "Carteira"
    INVESTMENT = "investment", "Investimento"


class CategoryKind(models.TextChoices):
    INCOME = "income", "Receita"
    EXPENSE = "expense", "Despesa"


class TxKind(models.TextChoices):
    INCOME = "income", "Receita"
    EXPENSE = "expense", "Despesa"
    TRANSFER = "transfer", "Transferência"


class TxStatus(models.TextChoices):
    PAID = "paid", "Efetivado"
    PENDING = "pending", "Pendente"


class Frequency(models.TextChoices):
    WEEKLY = "weekly", "Semanal"
    MONTHLY = "monthly", "Mensal"
    YEARLY = "yearly", "Anual"


class Account(Owned):
    name = models.CharField("nome", max_length=80)
    type = models.CharField("tipo", max_length=12, choices=AccountType.choices)
    initial_balance = models.DecimalField("saldo inicial", default=0, **MONEY)
    color = models.CharField("cor", max_length=7, default="#2fb5a2")
    archived = models.BooleanField("arquivada", default=False)

    class Meta:
        verbose_name = "conta"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["user", "name"], name="account_unique_name"),
        ]

    def __str__(self):
        return self.name


class Category(Owned):
    name = models.CharField("nome", max_length=60)
    kind = models.CharField("tipo", max_length=7, choices=CategoryKind.choices)
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="children"
    )
    color = models.CharField("cor", max_length=7, default="#8a9ba3")

    class Meta:
        verbose_name = "categoria"
        ordering = ["name"]
        constraints = [
            # Duas constraints parciais (em vez de nulls_distinct, que o SQLite não suporta).
            models.UniqueConstraint(
                fields=["user", "kind", "parent", "name"],
                condition=Q(parent__isnull=False),
                name="category_unique_child_name",
            ),
            models.UniqueConstraint(
                fields=["user", "kind", "name"],
                condition=Q(parent__isnull=True),
                name="category_unique_root_name",
            ),
        ]

    def __str__(self):
        return f"{self.parent.name} › {self.name}" if self.parent_id else self.name


class Tag(Owned):
    name = models.CharField("nome", max_length=40)
    color = models.CharField("cor", max_length=7, default="#8a9ba3")

    class Meta:
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["user", "name"], name="tag_unique_name")]

    def __str__(self):
        return self.name


class CreditCard(Owned):
    name = models.CharField("nome", max_length=80)
    limit = models.DecimalField("limite", **MONEY)
    closing_day = models.PositiveSmallIntegerField("dia de fechamento")
    due_day = models.PositiveSmallIntegerField("dia de vencimento")
    payment_account = models.ForeignKey(
        Account, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    color = models.CharField("cor", max_length=7, default="#6c9ef8")
    archived = models.BooleanField("arquivado", default=False)

    class Meta:
        verbose_name = "cartão de crédito"
        verbose_name_plural = "cartões de crédito"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["user", "name"], name="card_unique_name"),
            # 1..28: não depende de meses curtos
            models.CheckConstraint(
                condition=Q(closing_day__gte=1, closing_day__lte=28), name="card_closing_day"
            ),
            models.CheckConstraint(
                condition=Q(due_day__gte=1, due_day__lte=28), name="card_due_day"
            ),
            models.CheckConstraint(condition=Q(limit__gte=0), name="card_limit_non_negative"),
        ]

    def __str__(self):
        return self.name


class Invoice(Owned):
    """Fatura de um mês (criada sob demanda). O status é calculado em cards.invoice_status."""

    card = models.ForeignKey(CreditCard, on_delete=models.CASCADE, related_name="invoices")
    reference = models.CharField("mês de referência", max_length=7)  # "YYYY-MM", mês do fechamento
    payment = models.OneToOneField(
        "Transaction", null=True, blank=True, on_delete=models.SET_NULL, related_name="paid_invoice"
    )

    class Meta:
        verbose_name = "fatura"
        ordering = ["-reference"]
        constraints = [
            models.UniqueConstraint(fields=["card", "reference"], name="invoice_unique_reference"),
        ]

    def __str__(self):
        return f"{self.card} {self.reference}"


class InstallmentPlan(Owned):
    card = models.ForeignKey(CreditCard, on_delete=models.PROTECT, related_name="plans")
    description = models.CharField("descrição", max_length=120)
    total = models.DecimalField("valor total", **MONEY)
    count = models.PositiveSmallIntegerField("parcelas")
    purchase_date = models.DateField("data da compra")
    category = models.ForeignKey(
        Category, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        verbose_name = "parcelamento"
        constraints = [
            models.CheckConstraint(condition=Q(total__gt=0), name="plan_total_positive"),
            models.CheckConstraint(
                condition=Q(count__gte=2, count__lte=48), name="plan_count_range"
            ),
        ]

    def __str__(self):
        return f"{self.description} ({self.count}x)"


class RecurringRule(Owned):
    kind = models.CharField("tipo", max_length=8, choices=TxKind.choices)
    amount = models.DecimalField("valor", **MONEY)
    description = models.CharField("descrição", max_length=140)
    account = models.ForeignKey(
        Account, null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    credit_card = models.ForeignKey(
        CreditCard, null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    to_account = models.ForeignKey(
        Account, null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    category = models.ForeignKey(
        Category, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    frequency = models.CharField("frequência", max_length=8, choices=Frequency.choices)
    start_date = models.DateField("início")
    end_date = models.DateField("fim", null=True, blank=True)
    active = models.BooleanField("ativa", default=True)

    class Meta:
        verbose_name = "recorrência"
        ordering = ["description"]
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="rule_amount_positive"),
            models.CheckConstraint(
                condition=Q(account__isnull=False, credit_card__isnull=True)
                | Q(account__isnull=True, credit_card__isnull=False),
                name="rule_one_source",
            ),
        ]

    def __str__(self):
        return self.description


class Transaction(Owned):
    kind = models.CharField("tipo", max_length=8, choices=TxKind.choices)
    amount = models.DecimalField("valor", **MONEY)
    date = models.DateField("data")
    description = models.CharField("descrição", max_length=140)
    category = models.ForeignKey(
        Category, null=True, blank=True, on_delete=models.PROTECT, related_name="transactions"
    )
    account = models.ForeignKey(
        Account, null=True, blank=True, on_delete=models.PROTECT, related_name="transactions"
    )
    credit_card = models.ForeignKey(
        CreditCard, null=True, blank=True, on_delete=models.PROTECT, related_name="purchases"
    )
    to_account = models.ForeignKey(
        Account, null=True, blank=True, on_delete=models.PROTECT, related_name="incoming"
    )
    to_credit_card = models.ForeignKey(
        CreditCard, null=True, blank=True, on_delete=models.PROTECT, related_name="payments"
    )
    invoice = models.ForeignKey(
        Invoice, null=True, blank=True, on_delete=models.SET_NULL, related_name="items"
    )
    installment_plan = models.ForeignKey(
        InstallmentPlan,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="installments",
    )
    installment_number = models.PositiveSmallIntegerField(null=True, blank=True)
    recurring_rule = models.ForeignKey(
        RecurringRule,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="occurrences",
    )
    status = models.CharField(max_length=7, choices=TxStatus.choices, default=TxStatus.PAID)
    notes = models.TextField("notas", blank=True)
    tags = models.ManyToManyField(Tag, blank=True, related_name="transactions")

    class Meta:
        verbose_name = "lançamento"
        ordering = ["-date", "-id"]
        indexes = [models.Index(fields=["user", "date"])]
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="tx_amount_positive"),
            # origem: conta OU cartão
            models.CheckConstraint(
                condition=Q(account__isnull=False, credit_card__isnull=True)
                | Q(account__isnull=True, credit_card__isnull=False),
                name="tx_one_source",
            ),
            models.CheckConstraint(
                condition=Q(credit_card__isnull=True) | Q(kind="expense"),
                name="tx_card_only_expense",
            ),
            # transferência: exatamente um destino (conta ou cartão); outros tipos, nenhum
            models.CheckConstraint(
                condition=(
                    Q(kind="transfer")
                    & (
                        Q(to_account__isnull=False, to_credit_card__isnull=True)
                        | Q(to_account__isnull=True, to_credit_card__isnull=False)
                    )
                )
                | (~Q(kind="transfer") & Q(to_account__isnull=True, to_credit_card__isnull=True)),
                name="tx_transfer_one_destination",
            ),
            models.UniqueConstraint(
                fields=["recurring_rule", "date"],
                condition=Q(recurring_rule__isnull=False),
                name="tx_unique_occurrence",
            ),
            models.CheckConstraint(
                condition=~Q(to_account=F("account")), name="tx_transfer_distinct_accounts"
            ),
        ]

    def __str__(self):
        return f"{self.date} {self.description} {self.amount}"
