from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.catalog.models import UnitOfMeasure
from apps.companies.models import Company, normalize_code


class Product(models.Model):
    """A company-scoped saleable product master entry - Task 10B, built as
    the foundation for a future quotation/sales-order line item that does
    not exist yet anywhere in this codebase.

    CONFIRMED SCOPE BOUNDARY (do not read anything below as implying
    otherwise): this is a minimal identity record only. There is no
    formula/BOM, dosage/potency/medical-claim field, pack-size
    calculation, batch numbering, default price/tax/HSN/GST rule,
    shelf-life calculation, or opening-stock/stock-ownership concept
    anywhere on this model. `is_active` means "this record is in use",
    the same narrow meaning `apps.customers.models.Customer.is_active`
    and `apps.suppliers.models.Supplier.is_active` already carry - not
    "this product is approved for sale" or any other qualification. No
    quotation, sales order, invoice, or stock-affecting record exists yet
    that could reference a Product; a future task that adds one must
    check `is_active` itself, at the time it actually needs to - nothing
    here enforces that in advance. Creating a Product never creates or
    links a `Material` or any inventory record - a saleable product and a
    purchasable/stockable material are two entirely separate identities
    in this codebase, on purpose; nothing infers one from the other.

    COMPANY-SCOPING IS A PROVISIONAL IMPLEMENTATION CHOICE FOR THIS TASK,
    NOT A CLIENT-CONFIRMED POLICY - the same caveat `apps.customers.
    models.Customer` already carries for the identical reason. Each
    `Product` row belongs to exactly one `Company` (`company` is
    `PROTECT` and immutable, checked in `clean()` below). A shared
    product directory with company-specific offerings (mirroring how
    `apps.suppliers.Supplier`/`apps.catalog.Material` are shared across
    both companies) is a possible future alternative, not decided here -
    see `docs/erp-handoff-open-decisions.md`.

    `code` is required, normalised via `apps.companies.models.
    normalize_code` (the same helper `Company`, `Supplier`, `SharedStore`,
    `Material`, `MaterialSpecification`, and `Customer` all reuse), and
    immutable after creation. Uniqueness is enforced at the database
    level on `(company, code)` only, with no `is_active` exclusion -
    deactivating a product does not free its code for reuse within that
    company, the identical rule and identical reasoning `Customer.code`
    already documents. The same code may exist under two different
    companies.

    `sales_uom` is a required `PROTECT` foreign key to the existing,
    shared `apps.catalog.UnitOfMeasure` - no new unit model, no
    conversion engine, and no quantity field exists anywhere in this
    task. It must be *active* at creation (checked in
    `apps.products.services.create_product`, mirroring `apps.catalog.
    services.create_material`'s identical check for `base_unit`) and is
    **immutable after creation** (checked in `clean()` below, the same
    "identity, once set, is never silently reassignable" rule every
    other FK in this purchasing/catalog chain already follows) - this is
    a deliberate restriction, not an oversight: letting a product's sales
    unit change later would silently change the meaning of every past
    and future transaction quantity recorded against it, and this task
    implements no unit-conversion logic that could safely reinterpret
    them. **Unlike `Material.base_unit`, a `UnitOfMeasure` referenced by
    an active `Product` as its `sales_uom` is not currently protected
    from deactivation** - `apps.catalog.services.deactivate_unit` was
    deliberately left unmodified by this task (extending an existing,
    unrelated app was avoided per this task's own "reuse existing
    conventions, do not modify unrelated modules" instruction), so a
    product's `sales_uom` genuinely can become inactive after the fact.
    When that happens, this is displayed, never hidden or silently
    substituted: `apps.products.serializers.ProductSerializer` always
    includes the unit's own `code`/`name` (joined, not just its id) plus
    an explicit `sales_uom_is_active` flag, so a caller can show the unit
    exactly as before with a visible "inactive" indicator, and
    `activate_product` re-checks the unit's active state before allowing
    a deactivated product to be reactivated (mirroring `apps.catalog.
    services.activate_material`'s identical re-check of `base_unit`) -
    see `docs/backend-decisions.md`, Task 10B, for the full reasoning.

    `version` (`PositiveIntegerField`, default 1) is the ordinary
    optimistic-concurrency token every mutable document in this project
    carries - required as `expected_version` on every `PATCH` and on
    both lifecycle endpoints (activate/deactivate), per this task's own
    explicit instruction (the same requirement `Customer.version`
    already carries, and the same lesson Task 09B-3B.1 had to apply
    retroactively to `MaterialSpecification` after first shipping it
    unversioned - implemented correctly here from the start).

    KNOWN LIMITATION (same as every other model in this codebase that
    normalises/validates in `clean()`): normalisation and the blank/
    whitespace-only rule only run through `.save()`/`.full_clean()`.
    `QuerySet.update()` and `bulk_create()`/`bulk_update()` bypass
    `clean()` entirely. Every write path exposed by this task's API goes
    through `Product.save()` (directly or via `apps.products.
    services`), so this limitation does not affect any supported
    endpoint - it only matters for a hypothetical future direct ORM/bulk
    script.
    """

    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="products")
    code = models.CharField(max_length=32)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    # Task 12B-1: free-text product classification (e.g. "Tablets", "Syrup",
    # "Capsules") as supplied by the client's own register. Deliberately a
    # plain optional string, NOT a choices= enum - the client gave one
    # example value, not a complete list, and inventing a fixed set here
    # would silently reject whatever real values the client actually uses.
    # Editable at any time through the same PATCH as `name`/`description`
    # (see apps.products.services.update_product) - it carries no identity
    # meaning, so it is not immutable like `code`/`sales_uom`.
    product_type = models.CharField(max_length=100, blank=True, default="")
    # Plain optional reference text (e.g. a client-maintained BMR register
    # number), same treatment as product_type above - free text, not an
    # FK, carries no identity meaning, and stays editable at any time
    # through the same PATCH as name/description/product_type. This is
    # NOT the same thing as apps.bmr.models.BatchManufacturingRecord,
    # which is generated per batch plan, not per product - this field is
    # just a reference string stored on the product master itself.
    bmr_no = models.CharField(max_length=100, blank=True, default="")
    sales_uom = models.ForeignKey(UnitOfMeasure, on_delete=models.PROTECT, related_name="products")
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="products_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["company_id", "code"]
        constraints = [
            models.UniqueConstraint(fields=["company", "code"], name="unique_product_company_code"),
        ]

    def __str__(self):
        return f"{self.company.code}/{self.code}"

    def clean(self):
        self.code = normalize_code(self.code)
        self.name = (self.name or "").strip()
        self.description = (self.description or "").strip()
        self.product_type = (self.product_type or "").strip()
        self.bmr_no = (self.bmr_no or "").strip()

        errors = {}
        if not self.code:
            errors["code"] = "Code is required."
        if not self.name:
            errors["name"] = "Name is required."
        if not self.sales_uom_id:
            errors["sales_uom"] = "Sales unit of measure is required."
        if self.pk:
            original = (
                Product.objects.filter(pk=self.pk).values("company_id", "code", "sales_uom_id").first()
            )
            if original is not None:
                if original["company_id"] != self.company_id:
                    errors["company"] = "Company cannot be changed after creation."
                if original["code"] != self.code:
                    errors["code"] = "Code cannot be changed after creation."
                if original["sales_uom_id"] != self.sales_uom_id:
                    errors["sales_uom"] = "Sales unit of measure cannot be changed after creation."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)
