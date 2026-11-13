from django.db import IntegrityError, transaction
from ninja import Router, Status
from ninja.errors import HttpError
from ninja.security import django_auth

from apps.finance.api.common import get_owned
from apps.finance.models import Category
from apps.finance.schemas import CategoryIn, CategoryOut, CategoryPatch

router = Router(tags=["categories"], auth=django_auth)

INVALID_PARENT = "Categoria pai inválida: precisa ser sua, do mesmo tipo e de primeiro nível."


def _validate_parent(cat: Category, parent_id: int | None) -> None:
    if parent_id is None:
        cat.parent = None
        return
    parent = Category.objects.filter(user=cat.user, pk=parent_id).first()
    if (
        parent is None
        or parent.kind != cat.kind
        or parent.parent_id is not None
        or parent.pk == cat.pk
        or (cat.pk and cat.children.exists())
    ):
        raise HttpError(422, INVALID_PARENT)
    cat.parent = parent


DUPLICATE = "Já existe uma categoria com esse nome aqui."


def _is_duplicate(cat: Category) -> bool:
    # Checagem amigável (ignora maiúsculas); o banco garante a unicidade exata.
    return (
        Category.objects.filter(
            user=cat.user, kind=cat.kind, parent=cat.parent, name__iexact=cat.name
        )
        .exclude(pk=cat.pk)
        .exists()
    )


def _save(cat: Category) -> None:
    if _is_duplicate(cat):
        raise HttpError(409, DUPLICATE)
    try:  # corrida entre a checagem e o insert: o banco decide
        with transaction.atomic():
            cat.save()
    except IntegrityError:
        raise HttpError(409, DUPLICATE) from None


@router.get("", operation_id="categoriesList", response=list[CategoryOut])
def list_categories(request):
    return Category.objects.filter(user=request.auth)


@router.post("", operation_id="categoriesCreate", response={201: CategoryOut})
def create_category(request, payload: CategoryIn):
    cat = Category(user=request.auth, name=payload.name, kind=payload.kind, color=payload.color)
    _validate_parent(cat, payload.parent_id)
    _save(cat)
    return Status(201, cat)


@router.patch("/{category_id}", operation_id="categoriesUpdate", response=CategoryOut)
def update_category(request, category_id: int, payload: CategoryPatch):
    cat = get_owned(Category, request.auth, category_id)
    data = payload.dict(exclude_unset=True)
    if "parent_id" in data:
        _validate_parent(cat, data["parent_id"])
    if data.get("name") is not None:
        cat.name = data["name"]
    if data.get("color") is not None:
        cat.color = data["color"]
    _save(cat)
    return cat


@router.delete("/{category_id}", operation_id="categoriesDelete", response={204: None})
def delete_category(request, category_id: int):
    cat = get_owned(Category, request.auth, category_id)
    if cat.transactions.exists():
        raise HttpError(409, "Esta categoria tem lançamentos e não pode ser excluída.")
    if cat.children.exists():
        raise HttpError(409, "Exclua ou mova as subcategorias primeiro.")
    cat.delete()
    return Status(204, None)
