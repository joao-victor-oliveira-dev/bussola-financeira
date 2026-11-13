from functools import wraps

from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from ninja import Router, Status
from ninja.errors import HttpError
from ninja.security import django_auth
from ninja.utils import check_csrf

from apps.users.managers import normalize_email
from apps.users.schemas import DetailOut, LoginIn, RegisterIn, UserOut
from apps.users.services import EmailTaken, WeakPassword, register_user

router = Router(tags=["auth"])


def require_csrf(view):
    """Exige token CSRF em rotas sem autenticação (o django_auth já checa nas demais)."""

    @wraps(view)
    def wrapper(request, *args, **kwargs):
        if check_csrf(request) is not None:
            raise HttpError(403, "Token CSRF ausente ou inválido.")
        return view(request, *args, **kwargs)

    return wrapper


@router.get("/csrf", response=DetailOut)
def csrf(request):
    get_token(request)
    return {"detail": "ok"}


@router.post("/register", response={201: UserOut})
@require_csrf
def register(request, payload: RegisterIn):
    try:
        user = register_user(payload.name, payload.email, payload.password)
    except EmailTaken:
        raise HttpError(409, "E-mail já cadastrado.") from None
    except WeakPassword as e:
        raise HttpError(422, str(e)) from None
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    return Status(201, user)


@router.post("/login", response=UserOut)
@require_csrf
def login_view(request, payload: LoginIn):
    user = authenticate(request, email=normalize_email(payload.email), password=payload.password)
    if user is None:
        raise HttpError(401, "E-mail ou senha inválidos.")
    login(request, user)
    return user


@router.post("/logout", response={204: None}, auth=django_auth)
def logout_view(request):
    logout(request)
    return Status(204, None)


@router.get("/me", response=UserOut, auth=django_auth)
def me(request):
    return request.auth
