from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import models

from apps.companies.models import Company, normalize_code


class Customer(models.Model):
    """A company-scoped customer directory entry - Task 10A, built as the
    foundation for a future quotations/sales-order chain that does not
    exist yet anywhere in this codebase.

    CONFIRMED SCOPE BOUNDARY (do not read anything below as implying
    otherwise): this is an identity/contact record only. There is no
    GST/PAN, credit limit, opening balance, payment terms, tax
    calculation, or customer qualification/approval concept anywhere on
    this model. `is_active` means "this record is in use", the same
    narrow meaning `apps.suppliers.models.Supplier.is_active` already
    carries - not "this customer is approved/qualified for anything".
    No quotation, sales order, invoice, or stock-affecting record exists
    yet that could reference a Customer; a future task that adds one
    must check `is_active` itself, at the time it actually needs to -
    nothing here enforces that in advance.

    COMPANY-SCOPING IS A WORKING IMPLEMENTATION CHOICE FOR THIS TASK, NOT
    A CLAIM OF CLIENT-CONFIRMED CUSTOMER-OWNERSHIP POLICY. Unlike
    `Supplier` (a single shared directory, provisionally, across both
    companies that share this store), each `Customer` row belongs to
    exactly one `Company` - the same "identity, once set, is never
    silently reassignable" rule every other FK in this purchasing/
    receiving/quality chain already follows (`company` is `PROTECT` and
    checked immutable in `clean()` below). Whether the two companies
    that share this physical store should ever see a shared customer
    directory instead (the same open question `Supplier`'s own docstring
    already raises in the other direction) is unresolved - see
    docs/erp-handoff-open-decisions.md.

    `code` is required, normalised via `apps.companies.models.
    normalize_code` (trim + uppercase - same helper `Company`, `Supplier`,
    `SharedStore`, `Material`, and `MaterialSpecification` already reuse),
    and immutable after creation. Uniqueness is enforced at the database
    level on `(company, code)` only - the same code may legitimately
    exist under two different companies (e.g. both companies happen to
    deal with a customer they both independently code "C001"), but never
    twice under the same company. Deliberately **not** excluded for
    inactive rows: `unique_customer_company_code` below has no
    `condition=`, so deactivating a customer does not free its code for
    reuse within that company - a new customer must be given a different
    code, and the original inactive row keeps its own permanently. This
    is the opposite convention from, e.g., a partial-unique-while-active
    constraint; it was chosen because a code once assigned to a
    real-world customer relationship should never be silently reassigned
    to a different one later, even after that relationship goes
    inactive.

    `contact_person`/`billing_address`/`shipping_address`/`notes` are all
    optional plain text - there is no separate contact or address-book
    model (this task explicitly scopes to "one primary contact, two
    address fields", nothing more). `shipping_address` is never assumed
    to equal `billing_address` - each is independently optional and
    independently stored; a blank `shipping_address` means "not recorded
    yet", not "same as billing". `email`, when supplied, is validated as
    a well-formed address; when blank, no validation is attempted.
    `phone` is free text with no country-specific validation - it is
    preserved exactly as entered (including any international prefix
    such as "+91" or "+1") since this task explicitly defers real
    phone-format requirements to a later task, once they actually exist.

    `version` (`PositiveIntegerField`, default 1) is the ordinary
    optimistic-concurrency token every mutable document in this project
    carries - required as `expected_version` on every `PATCH` and on
    both lifecycle endpoints (activate/deactivate), per this task's own
    explicit instruction. This is implemented exactly as specified, not
    exempted by analogy to `Supplier`'s own unversioned shape - Task
    09B-3B.1 already corrected exactly this kind of judgment-call
    shortcut once on `MaterialSpecification` (see that model's own
    docstring and docs/backend-decisions.md, Task 09B-3B.1) and the
    lesson is applied here from the start instead of needing a follow-up
    correction.

    KNOWN LIMITATION (same as every other model in this codebase that
    normalises/validates in `clean()`): normalisation and the blank/
    whitespace-only rule only run through `.save()`/`.full_clean()`.
    `QuerySet.update()` and `bulk_create()`/`bulk_update()` bypass
    `clean()` entirely. Every write path exposed by this task's API goes
    through `Customer.save()` (directly or via `apps.customers.
    services`), so this limitation does not affect any supported
    endpoint - it only matters for a hypothetical future direct ORM/bulk
    script.
    """

    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="customers")
    code = models.CharField(max_length=32)
    name = models.CharField(max_length=255)
    contact_person = models.CharField(max_length=150, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=32, blank=True)
    city = models.CharField(max_length=100, blank=True)
    gst_number = models.CharField(max_length=32, blank=True)
    billing_address = models.TextField(blank=True)
    shipping_address = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="customers_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["company_id", "code"]
        constraints = [
            models.UniqueConstraint(fields=["company", "code"], name="unique_customer_company_code"),
        ]

    def __str__(self):
        return f"{self.company.code}/{self.code}"

    def clean(self):
        self.code = normalize_code(self.code)
        self.name = (self.name or "").strip()
        self.contact_person = (self.contact_person or "").strip()
        self.email = (self.email or "").strip()
        self.phone = (self.phone or "").strip()
        self.city = (self.city or "").strip()
        self.gst_number = (self.gst_number or "").strip().upper()
        self.billing_address = (self.billing_address or "").strip()
        self.shipping_address = (self.shipping_address or "").strip()
        self.notes = (self.notes or "").strip()

        errors = {}
        if not self.code:
            errors["code"] = "Code is required."
        if not self.name:
            errors["name"] = "Name is required."
        if self.email:
            try:
                validate_email(self.email)
            except ValidationError:
                errors["email"] = "Enter a valid email address."
        if self.pk:
            original = Customer.objects.filter(pk=self.pk).values("company_id", "code").first()
            if original is not None:
                if original["company_id"] != self.company_id:
                    errors["company"] = "Company cannot be changed after creation."
                if original["code"] != self.code:
                    errors["code"] = "Code cannot be changed after creation."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)
