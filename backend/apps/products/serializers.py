from rest_framework import serializers

from apps.products.models import Product

# Same convention as apps.customers.serializers/apps.suppliers.
# serializers/apps.purchasing.serializers._reject_prohibited_fields:
# fields explicitly rejected (400), not silently ignored, if present in
# the request body. CREATE and UPDATE prohibited sets are built
# independently, never by unioning one into the other - `code` is a
# legitimate create input but becomes prohibited only once a row exists
# (the exact bug class this project hit repeatedly earlier this session;
# see docs/backend-decisions.md, Task 10A, for the fullest account).
_PRODUCT_ALWAYS_PROHIBITED = {
    "is_active",
    "version",
    "created_at",
    "updated_at",
    "created_by",
    "created_by_id",
    "company",
    "company_id",
}
_PRODUCT_CREATE_PROHIBITED = _PRODUCT_ALWAYS_PROHIBITED
_PRODUCT_UPDATE_PROHIBITED = _PRODUCT_ALWAYS_PROHIBITED | {"code", "sales_uom", "sales_uom_id"}


def _reject_prohibited_fields(initial_data, prohibited):
    if not isinstance(initial_data, dict):
        return
    rejected = prohibited & set(initial_data.keys())
    if rejected:
        raise serializers.ValidationError(
            {field: "This field cannot be set through this endpoint." for field in sorted(rejected)}
        )


class ProductSerializer(serializers.ModelSerializer):
    company_id = serializers.IntegerField(source="company.id", read_only=True)
    company_code = serializers.CharField(source="company.code", read_only=True)
    sales_uom_id = serializers.IntegerField(source="sales_uom.id", read_only=True)
    sales_uom_code = serializers.CharField(source="sales_uom.code", read_only=True)
    sales_uom_name = serializers.CharField(source="sales_uom.name", read_only=True)
    # Always shown, joined (never dropped/substituted), so an inactive
    # sales_uom is still displayed exactly as before with a visible flag
    # rather than hidden or silently replaced - see Product's own
    # docstring and docs/backend-decisions.md, Task 10B.
    sales_uom_is_active = serializers.BooleanField(source="sales_uom.is_active", read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "company_id",
            "company_code",
            "code",
            "name",
            "product_type",
            "description",
            "sales_uom_id",
            "sales_uom_code",
            "sales_uom_name",
            "sales_uom_is_active",
            "is_active",
            "version",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ProductCreateSerializer(serializers.ModelSerializer):
    """`company` is never accepted here - it always comes from the URL
    (see apps.products.views). `sales_uom_id` is required and writable
    only at create; PATCH cannot change it (see ProductUpdateSerializer
    below) - the view resolves it to a `UnitOfMeasure` instance and the
    service checks it is active before creating.
    """

    sales_uom_id = serializers.IntegerField()

    class Meta:
        model = Product
        fields = ["code", "name", "product_type", "description", "sales_uom_id"]
        extra_kwargs = {
            "description": {"required": False, "allow_blank": True},
            "product_type": {"required": False, "allow_blank": True},
        }

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _PRODUCT_CREATE_PROHIBITED)
        return attrs


class ProductUpdateSerializer(serializers.Serializer):
    """PATCH-only. `expected_version` is always required (optimistic
    concurrency - see apps.products.services.update_product). `name`/
    `product_type`/`description` are each independently optional with
    **no** `default=` - a key's mere absence must be distinguishable from
    an explicit empty value, same reasoning as apps.customers.serializers.
    CustomerUpdateSerializer - to clear `description`/`product_type`, send
    it as an empty string ("") explicitly. `code`/`company`/`sales_uom` are
    immutable through this endpoint (rejected below, not silently
    ignored, if supplied).
    """

    expected_version = serializers.IntegerField()
    name = serializers.CharField(required=False)
    product_type = serializers.CharField(required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Name cannot be blank.")
        return value

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _PRODUCT_UPDATE_PROHIBITED)
        return attrs


class ProductVersionSerializer(serializers.Serializer):
    """Body shape shared by the activate/deactivate endpoints: only the
    optimistic-concurrency token, nothing else to submit.
    """

    expected_version = serializers.IntegerField()
