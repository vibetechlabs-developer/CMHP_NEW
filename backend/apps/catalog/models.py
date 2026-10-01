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

    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
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
        if self.pk:
            original = (
                Material.objects.filter(pk=self.pk)
                .values("code", "kind", "base_unit_id")
                .first()
            )
            if original is not None:
                if original["code"] != self.code:
                    errors["code"] = "Code cannot be changed after creation."
                if original["kind"] != self.kind:
                    errors["kind"] = "Kind cannot be changed after creation."
                if original["base_unit_id"] != self.base_unit_id:
                    errors["base_unit"] = "Base unit cannot be changed after creation."
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
