from rest_framework import serializers

from apps.catalog.models import Material, MaterialCategory, ProductType, UnitOfMeasure

# Fields explicitly rejected (not silently ignored) if present in the
# request body, on both create and update unless noted - `is_active` has
# its own activate/deactivate endpoints; `quantity`/`stock`/`company_id`/
# `owner_id`/`company`/`owner` do not exist on any catalog model at all
# (this task implements no stock balances and no company-owner field
# anywhere in the catalog - see docs/backend-tasks.md, Task 07B) and are
# rejected explicitly rather than silently ignored, so a caller testing
# for that behaviour gets a clear answer instead of a response that
# quietly dropped what they sent.
_COMMON_PROHIBITED = {
    "is_active",
    "quantity",
    "stock",
    "company_id",
    "owner_id",
    "company",
    "owner",
}


def _reject_prohibited_fields(initial_data, prohibited):
    rejected = prohibited & set(initial_data.keys())
    if rejected:
        raise serializers.ValidationError(
            {field: "This field cannot be set through this endpoint." for field in sorted(rejected)}
        )


# ---------------------------------------------------------------------------
# UnitOfMeasure
# ---------------------------------------------------------------------------

_UNIT_PROHIBITED_ON_UPDATE = _COMMON_PROHIBITED | {"code", "dimension", "canonical_factor"}


class UnitOfMeasureSerializer(serializers.ModelSerializer):
    class Meta:
        model = UnitOfMeasure
        fields = ["id", "code", "name", "dimension", "canonical_factor", "is_active", "created_at", "updated_at"]
        read_only_fields = fields


class UnitOfMeasureCreateSerializer(serializers.ModelSerializer):
    """`canonical_factor` (Task 12B-2) is optional, immutable once set - see
    `UnitOfMeasure`'s own docstring. Rejected outright (not silently
    ignored) for a COUNT unit, same as every other identity-shape rule on
    this model, enforced in `clean()`.
    """

    class Meta:
        model = UnitOfMeasure
        fields = ["code", "name", "dimension", "canonical_factor"]
        extra_kwargs = {"canonical_factor": {"required": False}}

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _COMMON_PROHIBITED)
        return attrs


class UnitOfMeasureUpdateSerializer(serializers.ModelSerializer):
    """PATCH-only: name. code/dimension are immutable through this API."""

    class Meta:
        model = UnitOfMeasure
        fields = ["name"]
        extra_kwargs = {"name": {"required": False}}

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _UNIT_PROHIBITED_ON_UPDATE)
        return attrs


# ---------------------------------------------------------------------------
# MaterialCategory
# ---------------------------------------------------------------------------

_CATEGORY_PROHIBITED_ON_UPDATE = _COMMON_PROHIBITED | {"code"}


class MaterialCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = MaterialCategory
        fields = ["id", "code", "name", "description", "is_active", "created_at", "updated_at"]
        read_only_fields = fields


class MaterialCategoryCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaterialCategory
        fields = ["code", "name", "description"]
        extra_kwargs = {"description": {"required": False, "allow_blank": True}}

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _COMMON_PROHIBITED)
        return attrs


class MaterialCategoryUpdateSerializer(serializers.ModelSerializer):
    """PATCH-only: name/description. code is immutable through this API."""

    class Meta:
        model = MaterialCategory
        fields = ["name", "description"]
        extra_kwargs = {
            "name": {"required": False},
            "description": {"required": False, "allow_blank": True},
        }

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _CATEGORY_PROHIBITED_ON_UPDATE)
        return attrs


# ---------------------------------------------------------------------------
# Material
# ---------------------------------------------------------------------------

_MATERIAL_PROHIBITED_ON_CREATE = _COMMON_PROHIBITED
_MATERIAL_PROHIBITED_ON_UPDATE = _COMMON_PROHIBITED | {"code", "kind", "base_unit_id", "base_unit"}


class MaterialSerializer(serializers.ModelSerializer):
    # SerializerMethodField, not source="category.id" - category is
    # optional, and DRF's dotted-source attribute traversal only catches
    # Django's ObjectDoesNotExist, not the plain AttributeError that
    # `getattr(None, "id")` raises once the traversal reaches a None
    # relation; a SerializerMethodField sidesteps that entirely.
    category_id = serializers.SerializerMethodField()
    category_code = serializers.SerializerMethodField()
    base_unit_id = serializers.IntegerField(source="base_unit.id", read_only=True)
    base_unit_code = serializers.CharField(source="base_unit.code", read_only=True)

    class Meta:
        model = Material
        fields = [
            "id",
            "code",
            "name",
            "description",
            "kind",
            "category_id",
            "category_code",
            "base_unit_id",
            "base_unit_code",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_category_id(self, obj):
        return obj.category_id

    def get_category_code(self, obj):
        return obj.category.code if obj.category_id else None


class MaterialCreateSerializer(serializers.ModelSerializer):
    category_id = serializers.IntegerField(required=False, allow_null=True)
    base_unit_id = serializers.IntegerField()

    class Meta:
        model = Material
        fields = ["code", "name", "description", "kind", "category_id", "base_unit_id"]
        extra_kwargs = {"description": {"required": False, "allow_blank": True}}

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _MATERIAL_PROHIBITED_ON_CREATE)
        return attrs


class MaterialUpdateSerializer(serializers.Serializer):
    """PATCH-only: name/description/category_id. code/kind/base_unit_id
    are immutable through this API. `category_id: null` clears the
    category (always allowed - removing a category assignment is never
    "newly assigning an inactive one"); a non-null value is validated
    against the category's active state at the service layer, since only
    the service can tell "newly assigned" apart from "unchanged".
    """

    name = serializers.CharField(required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    category_id = serializers.IntegerField(required=False, allow_null=True)

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _MATERIAL_PROHIBITED_ON_UPDATE)
        return attrs


class ProductTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductType
        fields = ["id", "name", "is_active", "created_at", "updated_at"]
        read_only_fields = fields


class ProductTypeWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Name cannot be blank.")
        return value
