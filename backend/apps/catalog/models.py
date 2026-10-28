from decimal import Decimal
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.companies.models import normalize_code


class UnitOfMeasure(models.Model):
    """A shared, company/store-independent unit of measure.

    NO GENERAL CONVERSION ENGINE EXISTS. `canonical_factor` (Task 12B-2) is
    the smallest explicit, documented conversion representation this project
    has: "1 of this unit equals `canonical_factor` of this dimension's own
    canonical base unit" (e.g. grams for MASS, millilitres for VOLUME - the
    canonical base unit for a dimension is simply whichever unit is given
    `canonical_factor = 1` for it; nothing here names one). It exists ONLY
    so `apps.batch_plans` can convert a packing-content quantity (e.g. grams
    per bottle) into a manufacturing formula's own output unit (e.g.
    kilograms) - two units of the SAME dimension. It is never used, and
    must never be used, to convert between different dimensions (MASS to
    VOLUME) - that would require a density, which nothing here models.

    `canonical_factor` is:
    - `null` by default, for every unit, always - **never silently
      assigned**. A `MASS`/`VOLUME` unit with no `canonical_factor` simply
      cannot participate in a cross-unit conversion; any attempt fails
      clearly (see `apps.batch_plans.services`) rather than guessing.
    - **Required to be `null` for a `COUNT` unit** - a count (bottles,
      tablets) has no mass/volume conversion of its own.
    - Optional, but if given, must be a positive number, for `MASS`/`VOLUME`
      units - an administrator (unit creation is superuser-only, see
      `apps.catalog.views`) sets it explicitly, once, when the conversion
      relationship for that unit is actually known.
    - **Immutable after creation**, the same "identity, once set, is never
      silently reassignable" rule `code`/`dimension` already follow on this
      model - changing it later would silently reinterpret every packing
      calculation already computed with it.
    """

    class Dimension(models.TextChoices):
        MASS = "MASS", "Mass"
        VOLUME = "VOLUME", "Volume"
        COUNT = "COUNT", "Count"

    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=100)
    dimension = models.CharField(max_length=10, choices=Dimension.choices)
    canonical_factor = models.DecimalField(max_digits=20, decimal_places=10, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["code"]
        constraints = [
            models.CheckConstraint(
                check=models.Q(canonical_factor__isnull=True) | models.Q(canonical_factor__gt=0),
                name="unit_canonical_factor_positive_when_set",
            ),
        ]

    def __str__(self):
        return self.code

    def clean(self):
        self.code = normalize_code(self.code)
        self.name = (self.name or "").strip()
        errors = {}
        if not self.code:
            errors["code"] = "Code is required."
        if not self.name:
            errors["name"] = "Name is required."
        if self.dimension not in self.Dimension.values:
            errors["dimension"] = f"Dimension must be one of {list(self.Dimension.values)}."
        elif self.dimension == self.Dimension.COUNT and self.canonical_factor is not None:
            errors["canonical_factor"] = "A COUNT unit cannot carry a mass/volume conversion factor."
        if self.canonical_factor is not None and self.canonical_factor <= 0:
            errors["canonical_factor"] = "Canonical factor must be greater than zero."
        if self.pk:
            original = (
                UnitOfMeasure.objects.filter(pk=self.pk).values("code", "dimension", "canonical_factor").first()
            )
            if original is not None:
                if original["code"] != self.code:
                    errors["code"] = "Code cannot be changed after creation."
                if original["dimension"] != self.dimension:
                    errors["dimension"] = "Dimension cannot be changed after creation."
                if original["canonical_factor"] != self.canonical_factor:
                    errors["canonical_factor"] = "Canonical factor cannot be changed after creation."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class MaterialCategory(models.Model):
    """Flat categories only - no parent/child hierarchy. Herbs and mother
    tinctures (or any other grouping) are represented by creating whatever
    category rows an administrator actually needs; none are seeded here,
    and none are assumed.
    """

    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["code"]
        verbose_name_plural = "material categories"

    def __str__(self):
        return self.code

    def clean(self):
        self.code = normalize_code(self.code)
        self.name = (self.name or "").strip()
        self.description = (self.description or "").strip()
        errors = {}
        if not self.code:
            errors["code"] = "Code is required."
        if not self.name:
            errors["name"] = "Name is required."
        if self.pk:
            original_code = (
                MaterialCategory.objects.filter(pk=self.pk).values_list("code", flat=True).first()
            )
            if original_code is not None and original_code != self.code:
                errors["code"] = "Code cannot be changed after creation."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class Material(models.Model):
    """A shared material identity - raw material or packaging material -
    usable by any authorized store user regardless of which company they
    belong to. Deliberately has no company-owner FK (same reasoning as
    apps.stores.models.SharedStore in Task 07A: two companies must be
    able to use the same material identity without a duplicate row), no
    stock-quantity field (this task does not implement stock balances at
    all - see docs/backend-tasks.md, Task 07B, "Not implemented"), and no
    default-supplier/tax/specification fields that were never asked for.
    """

    class Kind(models.TextChoices):
        RAW_MATERIAL = "RAW_MATERIAL", "Raw material"
        PACKAGING_MATERIAL = "PACKAGING_MATERIAL", "Packaging material"
        MOTHER_TINCTURE = "MOTHER_TINCTURE", "Mother Tincture"

    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    # Grade/specification is deliberately NOT a field here - a real,
    # versioned, QC-gated specification identity already exists at
    # apps.quality.MaterialSpecification (code/name/description + test
    # criteria, one material may have several). Adding a second, simpler
    # free-text "specification" field on Material itself would duplicate
    # that system rather than reuse it - the Material Master UI instead
    # links out to the existing material-specifications API/screen (see
    # frontend CommonMaterialsTab.jsx). "Different grades are different
    # Material rows, each with its own unique code" (this model's own
    # identity rule below) is the separate, already-complete answer for
    # grade-as-identity; this field would have been grade-as-description,
    # which is what MaterialSpecification already is.
    kind = models.CharField(max_length=20, choices=Kind.choices)
    category = models.ForeignKey(
        MaterialCategory,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="materials",
    )
    base_unit = models.ForeignKey(
        UnitOfMeasure,
        on_delete=models.PROTECT,
        related_name="materials",
    )
    # Optional default container type for packaging – does not affect unit conversion.
    default_container_type = models.ForeignKey(
        "receiving.ContainerType",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="materials_default",
    )
    alcohol_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        default=Decimal("0.00"),
        help_text="Alcohol content percentage (% v/v) present in this material, used for C1*V1 = C2*V2 batch deduction.",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return self.code

    def clean(self):
        self.code = normalize_code(self.code)
        self.name = (self.name or "").strip()
        self.description = (self.description or "").strip()
        errors = {}
        if not self.code:
            errors["code"] = "Code is required."
        if not self.name:
            errors["name"] = "Name is required."
        if self.kind not in self.Kind.values:
            errors["kind"] = f"Kind must be one of {list(self.Kind.values)}."
        if not self.base_unit_id:
            errors["base_unit"] = "Base unit is required."
        if self.alcohol_percentage is not None and (self.alcohol_percentage < 0 or self.alcohol_percentage > 100):
            errors["alcohol_percentage"] = "Alcohol percentage must be between 0 and 100."
        if self.code and Material.objects.filter(code=self.code).exclude(pk=self.pk).exists():
            errors["code"] = "A material with this code already exists."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        # Whether the referenced base_unit/category are themselves active
        # is deliberately NOT checked here - clean()/save() only validate
        # this row's own field shape and immutability, the same division
        # of responsibility used throughout this codebase (compare
        # StoreRoleAssignment.clean(), which checks cross-store
        # membership/role consistency but not either side's is_active
        # state). "Reject creation/reactivation if the unit/category is
        # inactive" is a business rule enforced in apps.catalog.services,
        # not a data-shape rule enforced here - it depends on *why* the
        # row is being saved (create vs. reactivate vs. an unrelated field
        # update), which this method has no way to distinguish.
        self.clean()
        super().save(*args, **kwargs)


class MaterialReorderSetting(models.Model):
    """A store-scoped reorder threshold for one material - deliberately
    NOT a field on Material itself. The material catalog is shared across
    every store (Material has no store FK at all - see its own
    docstring), but stock/receipts are always store-scoped, so "below
    reorder level" can only ever mean something at one specific store,
    never globally. One optional row per (store, material); its absence
    means "not configured for this store", never a reorder level of zero.

    Setting/changing this value is bookkeeping only: it never creates,
    reads, or implies a stock movement, and is never used anywhere to
    compute a stock-status filter on the shared material list itself
    (that list has no store context and no authoritative balance to
    compare against - see apps.catalog.views.MaterialListCreateView's own
    stock_status rejection, unchanged by this model's existence).
    """

    store = models.ForeignKey(
        "stores.SharedStore",
        on_delete=models.CASCADE,
        related_name="material_reorder_settings",
    )
    material = models.ForeignKey(
        Material,
        on_delete=models.CASCADE,
        related_name="reorder_settings",
    )
    reorder_level = models.DecimalField(max_digits=14, decimal_places=3)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["store", "material"], name="unique_store_material_reorder_setting"),
            models.CheckConstraint(
                check=models.Q(reorder_level__gte=0),
                name="material_reorder_level_nonnegative",
            ),
        ]

    def __str__(self):
        return f"{self.store_id}/{self.material_id}={self.reorder_level}"

    def clean(self):
        if self.reorder_level is not None and self.reorder_level < 0:
            raise ValidationError({"reorder_level": "Reorder level cannot be negative."})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class ProductType(models.Model):
    """Maintained, shared lookup of product types. `Product.product_type`
    stays free text for compatibility; sales order lines store the type they
    were entered with as a snapshot and never edit the product master.
    """

    name = models.CharField(max_length=100, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def clean(self):
        self.name = (self.name or "").strip()
        if not self.name:
            raise ValidationError({"name": "Name cannot be blank."})
        clash = ProductType.objects.filter(name__iexact=self.name).exclude(pk=self.pk).exists()
        if clash:
            raise ValidationError({"name": "A product type with this name (ignoring case) already exists."})

    def __str__(self):
        return self.name
