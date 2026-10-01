from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import models

from apps.companies.models import normalize_code


class Supplier(models.Model):
    """A shared supplier directory entry.

    Task 08A scope only: this is an identity/contact record, nothing
    more. There is no purchasing, receiving, stock, pricing, tax, bank-
    details or qualification/approval concept anywhere on this model -
    `is_active` means "this record is in use", not "this supplier is
    qualified/approved to supply anything" (see docs/backend-tasks.md,
    Task 08A, "Not implemented").

    Deliberately has no owning-company/store FK, following the same
    shared-identity reasoning already used for apps.stores.models.
    SharedStore (Task 07A) and apps.catalog.models.Material (Task 07B):
    which company actually purchases from a given supplier, and how
    that is recorded, is an unresolved business decision left to a later
    purchasing task - this phase treats "supplier identity" as a single
    shared directory, provisionally, not as a client-confirmed rule.

    KNOWN LIMITATION (same as apps.companies.models.Company and every
    other model in this codebase that normalises/validates in clean()):
    normalisation and the blank/whitespace-only rule only run through
    .save()/.full_clean(). QuerySet.update() and bulk_create()/
    bulk_update() bypass clean() entirely and could write an un-
    normalised code or a blank legal_name directly. Every write path
    exposed by this task's API goes through Supplier.save() (directly or
    via apps.suppliers.services), so this limitation does not affect any
    supported endpoint - it only matters for a hypothetical future direct
    ORM/bulk script.
    """

    code = models.CharField(max_length=32, unique=True)
    legal_name = models.CharField(max_length=255)
    display_name = models.CharField(max_length=255, blank=True)
    contact_name = models.CharField(max_length=150, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=32, blank=True)
    address_line_1 = models.CharField(max_length=255, blank=True)
    address_line_2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state_region = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    country_code = models.CharField(max_length=2, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return self.code

    def clean(self):
        self.code = normalize_code(self.code)
        self.legal_name = (self.legal_name or "").strip()
        self.display_name = (self.display_name or "").strip()
        self.contact_name = (self.contact_name or "").strip()
        self.email = (self.email or "").strip()
        self.phone = (self.phone or "").strip()
        self.address_line_1 = (self.address_line_1 or "").strip()
        self.address_line_2 = (self.address_line_2 or "").strip()
        self.city = (self.city or "").strip()
        self.state_region = (self.state_region or "").strip()
        self.postal_code = (self.postal_code or "").strip()
        self.country_code = (self.country_code or "").strip().upper()

        errors = {}
        if not self.code:
            errors["code"] = "Code is required."
        if not self.legal_name:
            errors["legal_name"] = "Legal name is required."
        if self.email:
            try:
                validate_email(self.email)
            except ValidationError:
                errors["email"] = "Enter a valid email address."
        if self.country_code and (len(self.country_code) != 2 or not self.country_code.isalpha()):
            errors["country_code"] = "Country code must be exactly two letters."
        if self.pk:
            original_code = Supplier.objects.filter(pk=self.pk).values_list("code", flat=True).first()
            if original_code is not None and original_code != self.code:
                errors["code"] = "Code cannot be changed after creation."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)
