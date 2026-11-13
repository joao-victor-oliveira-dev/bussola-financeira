from django.db.models import Model
from ninja.errors import HttpError

NOT_FOUND = "Não encontrado."


def get_owned[M: Model](model: type[M], user, pk: int) -> M:
    """Busca um objeto do usuário; o de outro usuário é tratado como inexistente (404)."""
    obj = model.objects.filter(user=user, pk=pk).first()
    if obj is None:
        raise HttpError(404, NOT_FOUND)
    return obj
