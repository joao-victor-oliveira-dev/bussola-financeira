from django.db import IntegrityError, transaction
from ninja import Router, Status
from ninja.errors import HttpError
from ninja.security import django_auth

from apps.finance.api.common import get_owned
from apps.finance.models import Tag
from apps.finance.schemas import TagIn, TagOut, TagPatch

router = Router(tags=["tags"], auth=django_auth)


DUPLICATE = "Já existe uma tag com esse nome."


def _is_duplicate(tag: Tag) -> bool:
    return Tag.objects.filter(user=tag.user, name__iexact=tag.name).exclude(pk=tag.pk).exists()


def _save(tag: Tag) -> None:
    if _is_duplicate(tag):
        raise HttpError(409, DUPLICATE)
    try:  # corrida entre a checagem e o insert: o banco decide
        with transaction.atomic():
            tag.save()
    except IntegrityError:
        raise HttpError(409, DUPLICATE) from None


@router.get("", operation_id="tagsList", response=list[TagOut])
def list_tags(request):
    return Tag.objects.filter(user=request.auth)


@router.post("", operation_id="tagsCreate", response={201: TagOut})
def create_tag(request, payload: TagIn):
    tag = Tag(user=request.auth, **payload.dict())
    _save(tag)
    return Status(201, tag)


@router.patch("/{tag_id}", operation_id="tagsUpdate", response=TagOut)
def update_tag(request, tag_id: int, payload: TagPatch):
    tag = get_owned(Tag, request.auth, tag_id)
    for field, value in payload.dict(exclude_unset=True).items():
        if value is not None:
            setattr(tag, field, value)
    _save(tag)
    return tag


@router.delete("/{tag_id}", operation_id="tagsDelete", response={204: None})
def delete_tag(request, tag_id: int):
    get_owned(Tag, request.auth, tag_id).delete()
    return Status(204, None)
