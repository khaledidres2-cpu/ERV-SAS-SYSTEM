"""schemas.py — request/response models."""

from datetime import date
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class CompanyRegister(BaseModel):
    company_name: str
    trn: Optional[str] = None
    admin_name: str
    email: EmailStr
    password: str = Field(min_length=8)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    company_id: str
    user_id: str
    role: str


class CustomerIn(BaseModel):
    name: str
    trn: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None


class LineItemIn(BaseModel):
    description: str
    quantity: Decimal = Field(gt=0)
    unit_price: Decimal = Field(ge=0)
    vat_rate: Decimal = Decimal("5.00")


class InvoiceIn(BaseModel):
    customer_id: str
    issue_date: Optional[date] = None
    due_date: Optional[date] = None
    currency: str = "AED"
    notes: Optional[str] = None
    items: list[LineItemIn] = Field(min_length=1)


class QuotationIn(BaseModel):
    customer_id: str
    issue_date: Optional[date] = None
    expiry_date: Optional[date] = None
    currency: str = "AED"
    notes: Optional[str] = None
    items: list[LineItemIn] = Field(min_length=1)


class PaymentIn(BaseModel):
    invoice_id: str
    amount: Decimal = Field(gt=0)
    method: str = "bank_transfer"
    payment_date: Optional[date] = None
    reference: Optional[str] = None
    notes: Optional[str] = None


class UserInviteIn(BaseModel):
    full_name: str
    email: EmailStr
    password: str = Field(min_length=8)
    role: str = "staff"


class CheckoutIn(BaseModel):
    invoice_id: str


class SendInvoiceIn(BaseModel):
    to: Optional[EmailStr] = None  # defaults to the customer's email


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    legal_name: Optional[str] = None
    trn: Optional[str] = None
    address: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    currency: Optional[str] = None
    vat_rate: Optional[Decimal] = None
    invoice_prefix: Optional[str] = None
    quote_prefix: Optional[str] = None
    logo_url: Optional[str] = None
