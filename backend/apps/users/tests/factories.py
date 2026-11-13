import factory

from apps.users.models import User

DEFAULT_PASSWORD = "senha-forte-123"


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User

    email = factory.Sequence(lambda n: f"usuario{n}@exemplo.com")
    name = factory.Faker("name", locale="pt_BR")
    password = factory.django.Password(DEFAULT_PASSWORD)
