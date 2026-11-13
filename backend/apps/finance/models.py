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
            models.UniqueConstraint(
                fields=["user", "kind", "parent", "name"],
                name="category_unique_name",
                nulls_distinct=False,
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


class Transaction(Owned):
    kind = models.CharField("tipo", max_length=8, choices=TxKind.choices)
    amount = models.DecimalField("valor", **MONEY)
    date = models.DateField("data")
    description = models.CharField("descrição", max_length=140)
    category = models.ForeignKey(
        Category, null=True, blank=True, on_delete=models.PROTECT, related_name="transactions"
    )
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name="transactions")
    to_account = models.ForeignKey(
        Account, null=True, blank=True, on_delete=models.PROTECT, related_name="incoming"
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
            models.CheckConstraint(
                condition=(Q(kind="transfer") & Q(to_account__isnull=False))
                | (~Q(kind="transfer") & Q(to_account__isnull=True)),
                name="tx_transfer_has_destination",
            ),
            models.CheckConstraint(
                condition=~Q(to_account=F("account")), name="tx_transfer_distinct_accounts"
            ),
        ]

    def __str__(self):
        return f"{self.date} {self.description} {self.amount}"
