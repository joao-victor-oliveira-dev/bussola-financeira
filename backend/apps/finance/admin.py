from django.contrib import admin

from apps.finance.models import Account, Category, Tag, Transaction


@admin.register(Account)
class AccountAdmin(admin.ModelAdmin):
    list_display = ["name", "user", "type", "initial_balance", "archived"]
    list_filter = ["type", "archived"]


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["__str__", "user", "kind"]
    list_filter = ["kind"]


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ["name", "user"]


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ["date", "description", "kind", "amount", "account", "status", "user"]
    list_filter = ["kind", "status"]
    search_fields = ["description"]
    date_hierarchy = "date"
