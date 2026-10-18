from pydantic import BaseModel, EmailStr, Field


# סכמות הבקשה של נתיבי ההרשמה והכניסה.
class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, description="הסיסמה חייבת להכיל לפחות 8 תווים")
    display_name: str = Field(..., min_length=1, description="שם תצוגה חובה")


class UserLogin(BaseModel):
    email: EmailStr
    password: str