import pytest

from apps.finance.models import Category, Tag
from apps.finance.tests.factories import CategoryFactory, TagFactory, TransactionFactory

pytestmark = pytest.mark.django_db


# ---- Categorias ----
def test_list_categories_flat_with_parent(api, user):
    food = CategoryFactory(user=user, name="Alimentação")
    CategoryFactory(user=user, name="Mercado", parent=food)
    CategoryFactory(name="Alheia")
    body = api.get("/api/categories").json()
    by_name = {c["name"]: c for c in body}
    assert set(by_name) == {"Alimentação", "Mercado"}
    assert by_name["Mercado"]["parent_id"] == food.id
    assert by_name["Alimentação"]["parent_id"] is None


def test_create_subcategory(api, user):
    food = CategoryFactory(user=user, name="Alimentação")
    r = api.post(
        "/api/categories",
        {"name": "Padaria", "kind": "expense", "parent_id": food.id, "color": "#f2b85e"},
    )
    assert r.status_code == 201
    assert r.json()["parent_id"] == food.id
    assert Category.objects.get(pk=r.json()["id"]).user == user


@pytest.mark.parametrize("case", ["other_user", "other_kind", "grandchild"])
def test_invalid_parent_422(api, user, case):
    if case == "other_user":
        parent = CategoryFactory()
    elif case == "other_kind":
        parent = CategoryFactory(user=user, kind="income")
    else:
        parent = CategoryFactory(user=user, parent=CategoryFactory(user=user))
    r = api.post("/api/categories", {"name": "X", "kind": "expense", "parent_id": parent.id})
    assert r.status_code == 422
    assert "pai" in r.json()["detail"].lower()


def test_duplicate_category_409(api, user):
    CategoryFactory(user=user, name="Lazer", kind="expense")
    r = api.post("/api/categories", {"name": "Lazer", "kind": "expense"})
    assert r.status_code == 409
    # mesmo nome em outro tipo é permitido
    assert api.post("/api/categories", {"name": "Lazer", "kind": "income"}).status_code == 201


def test_patch_category_and_move_to_top_level(api, user):
    parent = CategoryFactory(user=user)
    child = CategoryFactory(user=user, parent=parent, name="Filha")
    r = api.patch(f"/api/categories/{child.id}", {"name": "Renomeada", "parent_id": None})
    assert r.status_code == 200
    assert r.json() == {
        "id": child.id,
        "name": "Renomeada",
        "kind": "expense",
        "parent_id": None,
        "color": child.color,
    }


def test_category_with_children_cannot_become_child_422(api, user):
    parent = CategoryFactory(user=user)
    CategoryFactory(user=user, parent=parent)
    other = CategoryFactory(user=user)
    r = api.patch(f"/api/categories/{parent.id}", {"parent_id": other.id})
    assert r.status_code == 422


def test_category_cannot_be_its_own_parent_422(api, user):
    cat = CategoryFactory(user=user)
    assert api.patch(f"/api/categories/{cat.id}", {"parent_id": cat.id}).status_code == 422


def test_delete_category(api, user):
    cat = CategoryFactory(user=user)
    assert api.delete(f"/api/categories/{cat.id}").status_code == 204
    assert not Category.objects.filter(pk=cat.id).exists()


def test_delete_category_in_use_or_with_children_409(api, user):
    used = CategoryFactory(user=user)
    TransactionFactory(user=user, category=used)
    parent = CategoryFactory(user=user)
    CategoryFactory(user=user, parent=parent)
    assert api.delete(f"/api/categories/{used.id}").status_code == 409
    assert api.delete(f"/api/categories/{parent.id}").status_code == 409


def test_other_users_category_404(api):
    other = CategoryFactory()
    assert api.patch(f"/api/categories/{other.id}", {"name": "x"}).status_code == 404
    assert api.delete(f"/api/categories/{other.id}").status_code == 404


# ---- Tags ----
def test_tags_crud(api, user):
    r = api.post("/api/tags", {"name": "viagem", "color": "#6c9ef8"})
    assert r.status_code == 201
    tag_id = r.json()["id"]
    TagFactory(name="alheia")
    assert [t["name"] for t in api.get("/api/tags").json()] == ["viagem"]
    r = api.patch(f"/api/tags/{tag_id}", {"name": "férias"})
    assert r.json() == {"id": tag_id, "name": "férias", "color": "#6c9ef8"}
    assert api.delete(f"/api/tags/{tag_id}").status_code == 204
    assert not Tag.objects.filter(pk=tag_id).exists()


def test_duplicate_tag_409(api, user):
    TagFactory(user=user, name="casa")
    assert api.post("/api/tags", {"name": "casa"}).status_code == 409


def test_delete_tag_in_use_removes_link(api, user):
    tag = TagFactory(user=user)
    tx = TransactionFactory(user=user)
    tx.tags.add(tag)
    assert api.delete(f"/api/tags/{tag.id}").status_code == 204
    assert tx.tags.count() == 0


def test_other_users_tag_404(api):
    other = TagFactory()
    assert api.patch(f"/api/tags/{other.id}", {"name": "x"}).status_code == 404
