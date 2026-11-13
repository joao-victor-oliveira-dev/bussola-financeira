from ninja import Schema
from pydantic import EmailStr, Field


class RegisterIn(Schema):
    name: str = Field(min_length=1, max_length=150)
    email: EmailStr
    password: str


class LoginIn(Schema):
    email: EmailStr
    password: str


class UserOut(Schema):
    id: int
    email: str
    name: str


class DetailOut(Schema):
    detail: str
