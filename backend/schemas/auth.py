import re

from pydantic import BaseModel, EmailStr, Field, field_validator

# bcrypt only uses the first 72 bytes of a password; anything longer would be silently ignored.
BCRYPT_MAX_BYTES = 72


def check_password_strength(password: str) -> str:
    if len(password) < 8:
        raise ValueError("הסיסמה חייבת להכיל לפחות 8 תווים")
    if len(password.encode("utf-8")) > BCRYPT_MAX_BYTES:
        raise ValueError("הסיסמה ארוכה מדי (עד 72 בתים)")
    if not re.search(r"[^\W\d_]", password) or not re.search(r"\d", password):
        raise ValueError("הסיסמה חייבת להכיל לפחות אות אחת וספרה אחת")
    return password


# סכמות הבקשה של נתיבי ההרשמה והכניסה.
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    display_name: str = Field(..., min_length=1, max_length=80, description="שם תצוגה חובה")

    @field_validator("password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        return check_password_strength(value)

    @field_validator("display_name")
    @classmethod
    def clean_display_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("שם תצוגה חובה")
        return value


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(..., max_length=256)


class PasswordChange(BaseModel):
    current_password: str = Field(..., max_length=256)
    new_password: str

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        return check_password_strength(value)


class AccountDelete(BaseModel):
    password: str = Field(..., max_length=256)
