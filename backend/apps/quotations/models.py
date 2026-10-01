from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.companies.models import Company
from apps.customers.models import Customer
from apps.products.models import Product


class Quotation(models.Model):
    """A company-scoped quotation DRAFT - Task 10C. Drafting only.

    CONFIRMED SCOPE BOUNDARY: there is no approval, sending, acceptance,
    rejection, expiry, revision workflow, sales-order conversion, tax,
    discount, freight, grand total, PDF, or stock effect anywhere in this
    model or its API. `status` exists as an enum with only `DRAFT` so a
    future task can add states without inventing the column (same shape
    as `MaterialSpecificationVersion.Status`); nothing can reach any other
    value today.

    `reference` is server-generated ("QT-YYYYMMDD-<10 hex>", see
    apps.quotations.services._generate_reference). THE FORMAT IS A
    TECHNICAL WORKING DEFAULT, NOT CLIENT-CONFIRMED NUMBERING - the
    client may require a statutory/sequential scheme. It is unique
    *within a company* (constraint below), deliberately not globally
    unique like `PurchaseRequest.reference`, per this task's explicit
    instruction. It is never allocated with an unlocked `count() + 1`.

    `company` is immutable, `PROTECT`. `customer` must belong to the same
    company (checked in `clean()`), is `PROTECT`, and may be changed
    while DRAFT (subject to service-level validation that the new
    customer is active). `currency` is a three-letter code (shape-
    validated, upper-cased, same rule as `PurchaseOrder.currency_code`;
    the issue-time INR/USD/EUR/GBP allowlist does not apply because a
    quotation is never "issued") and is immutable after creation so
    existing line prices can never silently change currency.

    The subtotal is derived (sum of `QuotationLine.line_amount`), never
    stored and never client-supplied, and is only meaningful within this
    quotation's single currency.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"

    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="quotations")
    reference = models.CharField(max_length=40, editable=False)
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="quotations")
    quotation_date = models.DateField()
    valid_until = models.DateField(null=True, blank=True)
    currency = models.CharField(max_length=3)
    notes = models.CharField(max_length=2000, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    version = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="quotations_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["company", "reference"], name="unique_quotation_company_reference"),
        ]

    def __str__(self):
        return self.reference

    def clean(self):
        self.notes = (self.notes or "").strip()
        self.currency = (self.currency or "").strip().upper()
        errors = {}
        if not self.reference:
            errors["reference"] = "Reference is required."
        if self.status not in self.Status.values:
            errors["status"] = f"Status must be one of {list(self.Status.values)}."
        if not self.currency:
            errors["currency"] = "Currency is required."
        elif len(self.currency) != 3 or not self.currency.isalpha():
            errors["currency"] = "Currency must be exactly three letters (e.g. INR, USD)."
        if self.quotation_date is None:
            errors["quotation_date"] = "Quotation date is required."
        elif self.valid_until is not None and self.valid_until < self.quotation_date:
            errors["valid_until"] = "Valid-until date cannot precede the quotation date."
        if self.company_id and self.customer_id and self.customer.company_id != self.company_id:
            errors["customer"] = "The customer must belong to the quotation's company."
        if self.pk:
            original = Quotation.objects.filter(pk=self.pk).values("company_id", "reference", "currency").first()
            if original is not None:
                if original["company_id"] != self.company_id:
                    errors["company"] = "Company cannot be changed after creation."
                if original["reference"] != self.reference:
                    errors["reference"] = "Reference cannot be changed after creation."
                if original["currency"] != self.currency:
                    errors["currency"] = "Currency cannot be changed after creation."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class QuotationLine(models.Model):
    """One product/quantity/price line on a DRAFT quotation.

    `product_code_snapshot`/`product_name_snapshot`/`sales_uom_code_
    snapshot`/`sales_uom_name_snapshot` are captured when the line is
    created or when its product is replaced, and are otherwise never
    refreshed (a later rename of the product/unit, or their
    deactivation, does not rewrite them). `line_amount` is always
    server-calculated: `quantity * unit_price`, quantized to 2 places
    with ROUND_HALF_UP (same convention as `PurchaseOrderLine`). It is a
    pre-tax amount only.

    `product` is `PROTECT`. `line_number` is server-assigned from the
    submitted order (1..N) and unique within a quotation.
    """

    quotation = models.ForeignKey(Quotation, on_delete=models.CASCADE, related_name="lines")
    line_number = models.PositiveIntegerField()
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="quotation_lines")
    quantity = models.DecimalField(max_digits=14, decimal_places=3)
    unit_price = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    description = models.CharField(max_length=500, blank=True)
    line_amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    product_code_snapshot = models.CharField(max_length=32, blank=True)
    product_name_snapshot = models.CharField(max_length=255, blank=True)
    sales_uom_code_snapshot = models.CharField(max_length=20, blank=True)
    sales_uom_name_snapshot = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ["line_number", "id"]
        constraints = [
            models.UniqueConstraint(fields=["quotation", "line_number"], name="unique_quotation_line_number"),
            models.CheckConstraint(check=models.Q(quantity__gt=0), name="quotation_line_quantity_positive"),
            models.CheckConstraint(check=models.Q(unit_price__gte=0), name="quotation_line_unit_price_nonnegative"),
        ]

    def __str__(self):
        return f"{self.quotation.reference} line {self.line_number}"

    def clean(self):
        self.description = (self.description or "").strip()
        errors = {}
        if self.quantity is not None and self.quantity <= 0:
            errors["quantity"] = "Quantity must be greater than zero."
        if self.unit_price is not None and self.unit_price < 0:
            errors["unit_price"] = "Unit price cannot be negative."
        if self.quotation_id and self.product_id and self.product.company_id != self.quotation.company_id:
            errors["product"] = "The product must belong to the quotation's company."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)
