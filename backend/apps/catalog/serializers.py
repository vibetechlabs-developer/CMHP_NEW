from decimal import Decimal

from rest_framework import serializers

from apps.catalog.models import Material, MaterialCategory, MaterialReorderSetting, ProductType, UnitOfMeasure

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
_MATERIAL_PROHIBITED_ON_UPDATE = _COMMON_PROHIBITED


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
    # SerializerMethodField for the same reason as category_id/category_code
    # above - default_container_type is optional, and a plain dotted
    # `source="default_container_type.id"` raises AttributeError (not
    # caught) for every material that has none set, which is every
    # material that existed before this field was added.
    default_container_type_id = serializers.SerializerMethodField()
    default_container_type_code = serializers.SerializerMethodField()

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
            "default_container_type_id",
            "default_container_type_code",
            "alcohol_percentage",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_category_id(self, obj):
        return obj.category_id

    def get_category_code(self, obj):
        return obj.category.code if obj.category_id else None

    def get_default_container_type_id(self, obj):
        return obj.default_container_type_id

    def get_default_container_type_code(self, obj):
        return obj.default_container_type.code if obj.default_container_type_id else None


class MaterialCreateSerializer(serializers.ModelSerializer):
    category_id = serializers.IntegerField(required=False, allow_null=True)
    base_unit_id = serializers.IntegerField()
    # Optional, like category_id - a default container type is a packaging
    # suggestion only (see Material.default_container_type's docstring),
    # never a conversion factor and never required.
    default_container_type_id = serializers.IntegerField(required=False, allow_null=True)

    class Meta:
        model = Material
        fields = [
            "code", "name", "description", "kind",
            "category_id", "base_unit_id", "default_container_type_id",
            "alcohol_percentage",
        ]
        extra_kwargs = {
            "description": {"required": False, "allow_blank": True},
            "alcohol_percentage": {"required": False, "allow_null": True},
        }

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _MATERIAL_PROHIBITED_ON_CREATE)
        return attrs


class MaterialUpdateSerializer(serializers.Serializer):
    """PATCH-only: name/description/category_id/alcohol_percentage. code/kind/base_unit_id
    are immutable through this API. `category_id: null` clears the
    category (always allowed - removing a category assignment is never
    "newly assigning an inactive one"); a non-null value is validated
    against the category's active state at the service layer, since only
    the service can tell "newly assigned" apart from "unchanged".
    """

    code = serializers.CharField(required=False)
    kind = serializers.ChoiceField(choices=Material.Kind.choices, required=False)
    base_unit_id = serializers.IntegerField(required=False)
    name = serializers.CharField(required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    category_id = serializers.IntegerField(required=False, allow_null=True)
    default_container_type_id = serializers.IntegerField(required=False, allow_null=True)
    alcohol_percentage = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _MATERIAL_PROHIBITED_ON_UPDATE)
        return attrs


# ---------------------------------------------------------------------------
# MaterialReorderSetting - store-scoped, see its own model docstring.
# ---------------------------------------------------------------------------


class MaterialReorderSettingSerializer(serializers.ModelSerializer):
    store_id = serializers.IntegerField(read_only=True)
    material_id = serializers.IntegerField(read_only=True)
    updated_by_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = MaterialReorderSetting
        fields = ["id", "store_id", "material_id", "reorder_level", "updated_by_id", "created_at", "updated_at"]
        read_only_fields = fields


class MaterialReorderSettingWriteSerializer(serializers.Serializer):
    """PUT-style: the entire (store, material) setting is always replaced
    with exactly this value - there is nothing else on this row to
    partially patch. `store`/`material`/`updated_by` are always resolved
    from the URL/request, never accepted here - rejected explicitly
    (not silently ignored) if present, same convention as every other
    write serializer in this module.
    """

    reorder_level = serializers.DecimalField(max_digits=14, decimal_places=3, min_value=Decimal("0"))

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, {"store_id", "material_id", "updated_by_id", "id"} | _COMMON_PROHIBITED)
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
