from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.companies.models import Company
from apps.customers.models import Customer
from apps.products.models import Product


class SalesOrder(models.Model):
    """A company-scoped DIRECT sales-order DRAFT - Task 10D. Records a
    draft only.

    CONFIRMED SCOPE BOUNDARY: neither a draft nor a CONFIRMED order
    authorizes manufacturing, stock reservation, invoicing or dispatch.
    Task 10F adds exactly one transition, DRAFT -> CONFIRMED (see
    apps.sales_orders.services.confirm_sales_order), gated by an explicit
    per-company policy (SalesOrderConfirmationPolicy) and the separate
    `sales_orders.confirm` permission. There is still no unconfirm/cancel/
    amend, no quotation linkage (quotation acceptance and quotation-to-
    order conversion are deferred until the conversion policy is
    defined), no tax/discount/freight, and no production/dispatched/
    reserved quantity fields. A CONFIRMED order is immutable through
    every service/API.

    WORKING DEFAULTS (not client-confirmed, see docs/erp-handoff-open-
    decisions.md): `reference` is `SO-YYYYMMDD-<10 hex>`, unique within a
    company; `requested_delivery_date` may not precede `order_date`;
    `customer_order_reference` (the customer's own PO number) is free
    text and is deliberately NOT unique - no business requirement for
    uniqueness has been stated, so none is imposed; company-scoping
    mirrors Customer/Product/Quotation; currency is a shape-validated
    three-letter code, immutable in this slice.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        CONFIRMED = "CONFIRMED", "Confirmed"

    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="sales_orders")
    reference = models.CharField(max_length=40, editable=False)
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="sales_orders")
    order_date = models.DateField()
    requested_delivery_date = models.DateField(null=True, blank=True)
    customer_order_reference = models.CharField(max_length=100, blank=True)
    currency = models.CharField(max_length=3)
    notes = models.CharField(max_length=2000, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    version = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sales_orders_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    # Task 10F: set together, exactly once, by apps.sales_orders.services.
    # confirm_sales_order. `confirmation_policy_version`/`_snapshot` record
    # the company policy values actually applied (plus the business date
    # used for the past-delivery-date check) so the decision stays
    # explainable after the policy later changes. A confirmed order is
    # immutable through every API/service; nothing unconfirms or amends it.
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="sales_orders_confirmed",
    )
    confirmed_at = models.DateTimeField(null=True, blank=True)
    confirmation_policy_version = models.PositiveIntegerField(null=True, blank=True)
    confirmation_policy_snapshot = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["company", "reference"], name="unique_sales_order_company_reference"),
        ]

    def __str__(self):
        return self.reference

    def clean(self):
        self.notes = (self.notes or "").strip()
        self.customer_order_reference = (self.customer_order_reference or "").strip()
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
        if self.order_date is None:
            errors["order_date"] = "Order date is required."
        elif self.requested_delivery_date is not None and self.requested_delivery_date < self.order_date:
            errors["requested_delivery_date"] = "Requested delivery date cannot precede the order date."
        if self.company_id and self.customer_id and self.customer.company_id != self.company_id:
            errors["customer"] = "The customer must belong to the order's company."
        if self.status == self.Status.CONFIRMED:
            if self.confirmed_by_id is None or self.confirmed_at is None:
                errors["status"] = "A confirmed order must record who confirmed it and when."
        elif self.confirmed_by_id is not None or self.confirmed_at is not None:
            errors["status"] = "Only a confirmed order may carry confirmation details."
        if self.pk:
            original = SalesOrder.objects.filter(pk=self.pk).values("company_id", "reference", "currency").first()
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


class SalesOrderLine(models.Model):
    """One product/quantity/price line on a DRAFT sales order. Snapshot and
    amount conventions are identical to `QuotationLine`: snapshots are
    captured for new lines or when the product is replaced, never
    otherwise; `line_amount` is server-calculated (Decimal, 2 dp,
    ROUND_HALF_UP), pre-tax.
    """

    sales_order = models.ForeignKey(SalesOrder, on_delete=models.CASCADE, related_name="lines")
    line_number = models.PositiveIntegerField()
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="sales_order_lines")
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
            models.UniqueConstraint(fields=["sales_order", "line_number"], name="unique_sales_order_line_number"),
            models.CheckConstraint(check=models.Q(quantity__gt=0), name="sales_order_line_quantity_positive"),
            models.CheckConstraint(
                check=models.Q(unit_price__gte=0), name="sales_order_line_unit_price_nonnegative"
            ),
        ]

    def __str__(self):
        return f"{self.sales_order.reference} line {self.line_number}"

    def clean(self):
        self.description = (self.description or "").strip()
        errors = {}
        if self.quantity is not None and self.quantity <= 0:
            errors["quantity"] = "Quantity must be greater than zero."
        if self.unit_price is not None and self.unit_price < 0:
            errors["unit_price"] = "Unit price cannot be negative."
        if self.sales_order_id and self.product_id and self.product.company_id != self.sales_order.company_id:
            errors["product"] = "The product must belong to the order's company."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class SalesOrderConfirmationPolicy(models.Model):
    """Task 10F: a small, company-specific set of EXPLICIT answers to the
    client's still-open sales-order confirmation policy questions. Not a
    generic workflow engine.

    Each value is `null` until an administrator answers it - there are
    deliberately NO defaults. A missing row, or a row with any `null`
    value, means "confirmation policy not configured" and BLOCKS
    confirmation with a structured error (see apps.sales_orders.
    confirmation). No live company is configured automatically.

    Configuration authority (an active superuser, the project's existing
    configuration convention) is NOT business confirmation authority:
    confirming needs the separate COMPANY permission
    `sales_orders.confirm`. `version` is an optimistic-concurrency token
    (`expected_version` on every update; 0 means "no row yet");
    `created_by`/`updated_by`/`updated_at` record who configured or last
    changed it and when.
    """

    company = models.OneToOneField(Company, on_delete=models.PROTECT, related_name="sales_order_confirmation_policy")
    allow_self_confirmation = models.BooleanField(null=True, blank=True)
    allow_zero_price_lines = models.BooleanField(null=True, blank=True)
    allow_past_requested_delivery_dates = models.BooleanField(null=True, blank=True)
    version = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sales_order_policies_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sales_order_policies_updated"
    )
    updated_at = models.DateTimeField(auto_now=True)

    VALUE_FIELDS = ("allow_self_confirmation", "allow_zero_price_lines", "allow_past_requested_delivery_dates")

    def __str__(self):
        return f"{self.company.code} sales-order confirmation policy v{self.version}"

    @property
    def is_complete(self):
        return all(getattr(self, field) is not None for field in self.VALUE_FIELDS)
