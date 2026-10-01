from rest_framework import serializers

from apps.quality.models import (
    IncomingInspection,
    InspectionObservation,
    MaterialSpecification,
    MaterialSpecificationVersion,
    SpecificationTest,
)
from apps.receiving.models import GoodsReceiptLine

# Same convention as apps.receiving.serializers: fields explicitly
# rejected (400), not silently ignored, if present in the request body.
# `status`/`reference`/`version`/the actor+timestamp fields/
# `cancellation_reason` are all server-managed; `store`/`company`/
# `material`/`unit`/the `*_snapshot` fields all come exclusively from the
# resolved source receipt line (see
# apps.quality.services.create_incoming_inspection) - never independently
# accepted. No price/commercial field exists anywhere on this model, and
# none is ever accepted here either.
#
# `receipt_line_id` is deliberately NOT in this shared base set: it is
# the one legitimate, required field on the *create* serializer (how
# else would a caller say which receipt line this inspection is for?),
# but becomes immutable - and therefore prohibited - the moment an
# inspection exists. Building create/update sets independently below
# (rather than unioning a single "always prohibited" set with an
# update-only addition into a *create*-prohibited set by mistake) avoids
# repeating the exact bug Task 08C-1 hit with PurchaseOrder's own
# prohibited-field sets and `lines` - see docs/backend-decisions.md.
_HEADER_ALWAYS_PROHIBITED = {
    "status",
    "reference",
    "version",
    "store",
    "store_id",
    "company",
    "company_id",
    "material",
    "material_id",
    "unit",
    "unit_id",
    "material_code_snapshot",
    "material_name_snapshot",
    "unit_code_snapshot",
    "unit_name_snapshot",
    "lot_reference_snapshot",
    "received_quantity_snapshot",
    "created_at",
    "updated_at",
    "created_by",
    "created_by_id",
    "cancelled_by",
    "cancelled_by_id",
    "cancelled_at",
    "cancellation_reason",
    "submitted_by",
    "submitted_by_id",
    "submitted_at",
    "unit_price",
    "line_amount",
    "currency_code",
    "price",
}
_HEADER_CREATE_PROHIBITED = _HEADER_ALWAYS_PROHIBITED
_HEADER_UPDATE_PROHIBITED = _HEADER_ALWAYS_PROHIBITED | {"receipt_line", "receipt_line_id"}

# An observation may only ever say "this parameter, this method/result/
# unit/remark text" - line_number is always server-assigned from list
# position, never accepted directly.
_OBSERVATION_PROHIBITED = {"id", "inspection", "inspection_id", "line_number"}


def _reject_prohibited_fields(initial_data, prohibited):
    if not isinstance(initial_data, dict):
        return
    rejected = prohibited & set(initial_data.keys())
    if rejected:
        raise serializers.ValidationError(
            {field: "This field cannot be set through this endpoint." for field in sorted(rejected)}
        )


class InspectionObservationSerializer(serializers.ModelSerializer):
    class Meta:
        model = InspectionObservation
        fields = ["id", "line_number", "parameter_name", "method_reference", "result", "result_unit", "remarks"]
        read_only_fields = fields


class IncomingInspectionSerializer(serializers.ModelSerializer):
    """Deliberately exposes only material/quantity/lot/inspection detail -
    no supplier price, line amount, or commercial total appears anywhere
    on this serializer, mirroring apps.receiving.serializers.
    GoodsReceiptSerializer's own explicit promise. `company_id`/
    `company_code` identify the *purchasing* company only - see
    apps.quality.models.IncomingInspection's docstring for the same
    "not legal ownership" caveat every purchasing/receiving model in
    this codebase carries.
    """

    receipt_line_id = serializers.IntegerField(source="receipt_line.id", read_only=True)
    receipt_id = serializers.IntegerField(source="receipt_line.goods_receipt.id", read_only=True)
    receipt_reference = serializers.CharField(source="receipt_line.goods_receipt.reference", read_only=True)
    store_id = serializers.IntegerField(source="store.id", read_only=True)
    store_code = serializers.CharField(source="store.code", read_only=True)
    company_id = serializers.IntegerField(source="company.id", read_only=True)
    company_code = serializers.CharField(source="company.code", read_only=True)
    material_id = serializers.IntegerField(source="material.id", read_only=True)
    material_code = serializers.CharField(source="material.code", read_only=True)
    material_name = serializers.CharField(source="material.name", read_only=True)
    unit_id = serializers.IntegerField(source="unit.id", read_only=True)
    unit_code = serializers.CharField(source="unit.code", read_only=True)
    unit_name = serializers.CharField(source="unit.name", read_only=True)
    created_by_id = serializers.IntegerField(source="created_by.id", read_only=True)
    submitted_by_id = serializers.SerializerMethodField()
    cancelled_by_id = serializers.SerializerMethodField()
    observations = InspectionObservationSerializer(many=True, read_only=True)

    class Meta:
        model = IncomingInspection
        fields = [
            "id",
            "reference",
            "status",
            "receipt_line_id",
            "receipt_id",
            "receipt_reference",
            "store_id",
            "store_code",
            "company_id",
            "company_code",
            "material_id",
            "material_code",
            "material_name",
            "unit_id",
            "unit_code",
            "unit_name",
            "material_code_snapshot",
            "material_name_snapshot",
            "unit_code_snapshot",
            "unit_name_snapshot",
            "lot_reference_snapshot",
            "received_quantity_snapshot",
            "inspection_date",
            "notes",
            "observations",
            "created_by_id",
            "created_at",
            "updated_at",
            "submitted_by_id",
            "submitted_at",
            "cancelled_by_id",
            "cancelled_at",
            "cancellation_reason",
            "version",
        ]
        read_only_fields = fields

    def get_submitted_by_id(self, obj):
        return obj.submitted_by_id

    def get_cancelled_by_id(self, obj):
        return obj.cancelled_by_id


class InspectionObservationInputSerializer(serializers.Serializer):
    """Used, `many=True`, inside both create and update input - never
    exposed standalone. Only `parameter_name` is required: a draft's
    observations may be incomplete (see InspectionObservation's own
    docstring).
    """

    parameter_name = serializers.CharField(max_length=200)
    method_reference = serializers.CharField(required=False, allow_blank=True, max_length=200, default="")
    result = serializers.CharField(required=False, allow_blank=True, max_length=500, default="")
    result_unit = serializers.CharField(required=False, allow_blank=True, max_length=50, default="")
    remarks = serializers.CharField(required=False, allow_blank=True, max_length=1000, default="")

    def to_internal_value(self, data):
        # Not validate()/self.initial_data: when used as a `many=True`
        # child, DRF's ListSerializer calls this child's run_validation()
        # directly per item - see apps.receiving.serializers.
        # GoodsReceiptLineInputSerializer's identical override for why.
        _reject_prohibited_fields(data, _OBSERVATION_PROHIBITED)
        return super().to_internal_value(data)


class IncomingInspectionCreateSerializer(serializers.Serializer):
    """`store`/`company`/`material`/`unit` are deliberately absent -
    `store` comes from the URL, everything else is always derived
    server-side from the resolved source receipt line (see
    apps.quality.services.create_incoming_inspection).
    """

    receipt_line_id = serializers.IntegerField()
    inspection_date = serializers.DateField(required=False, allow_null=True, default=None)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000, default="")
    observations = InspectionObservationInputSerializer(many=True, required=False, default=list)

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _HEADER_CREATE_PROHIBITED)
        return attrs


class IncomingInspectionUpdateSerializer(serializers.Serializer):
    """PATCH-only. `expected_version` is always required.
    `inspection_date`/`notes`/`observations` are each independently
    optional with **no** `default=` - a key's mere absence must be
    distinguishable from an explicit value, same reasoning as
    GoodsReceiptUpdateSerializer.
    """

    expected_version = serializers.IntegerField()
    inspection_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    observations = InspectionObservationInputSerializer(many=True, required=False)

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _HEADER_UPDATE_PROHIBITED)
        return attrs


class IncomingInspectionVersionSerializer(serializers.Serializer):
    """Body shape for the submit endpoint: only the optimistic-
    concurrency token, nothing else to submit - mirrors
    apps.receiving.serializers.GoodsReceiptVersionSerializer exactly.
    """

    expected_version = serializers.IntegerField()


class IncomingInspectionCancelSerializer(serializers.Serializer):
    expected_version = serializers.IntegerField()
    cancellation_reason = serializers.CharField(max_length=1000, allow_blank=False)


class EligibleReceiptLineSerializer(serializers.ModelSerializer):
    """The "minimal eligible receipt line lookup" response - identical
    authorization rules to every other endpoint in this module (bare
    active company membership, no purchasing permission required - see
    apps.quality.services.eligible_receipt_lines_for_inspection).
    Deliberately excludes supplier price/line amount/currency - only
    what a QC user needs to pick the right line and file an inspection
    against it.
    """

    receipt_id = serializers.IntegerField(source="goods_receipt.id", read_only=True)
    receipt_reference = serializers.CharField(source="goods_receipt.reference", read_only=True)
    company_id = serializers.IntegerField(source="goods_receipt.company.id", read_only=True)
    company_code = serializers.CharField(source="goods_receipt.company.code", read_only=True)
    material_id = serializers.IntegerField(source="material.id", read_only=True)
    material_code = serializers.CharField(source="material.code", read_only=True)
    material_name = serializers.CharField(source="material.name", read_only=True)
    unit_id = serializers.IntegerField(source="unit.id", read_only=True)
    unit_code = serializers.CharField(source="unit.code", read_only=True)

    class Meta:
        model = GoodsReceiptLine
        fields = [
            "id",
            "receipt_id",
            "receipt_reference",
            "company_id",
            "company_code",
            "material_id",
            "material_code",
            "material_name",
            "unit_id",
            "unit_code",
            "received_quantity",
            "lot_reference",
        ]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Material specifications (Task 09B-3B)
# ---------------------------------------------------------------------------

# Same convention as elsewhere in this file: create/update sets built
# independently (never one unioned into the other) after Task 09B-3A's
# own `receipt_line_id` bug - see docs/backend-decisions.md for that
# precedent. `material_id`/`code` are legitimate, required *create*
# fields but become immutable - and therefore prohibited - the moment a
# specification exists. `reference_document`/`notes`/`tests` belong to
# `MaterialSpecificationVersion`, not `MaterialSpecification` - listed
# here explicitly (not merely "unrecognized and silently dropped") so a
# caller who reasonably assumes the first version's fields can be set
# alongside the specification gets a clear, explicit rejection instead
# of a response that quietly ignored what they asked for.
_SPEC_ALWAYS_PROHIBITED = {
    "id",
    "created_by",
    "created_by_id",
    "created_at",
    "updated_at",
    "latest_revision_number",
    "versions",
    "reference_document",
    "notes",
    "tests",
    "version",
}
_SPEC_CREATE_PROHIBITED = _SPEC_ALWAYS_PROHIBITED
_SPEC_UPDATE_PROHIBITED = _SPEC_ALWAYS_PROHIBITED | {"material", "material_id", "code"}

# `specification`/`specification_id` never appear as a real field on
# either version serializer (the parent always comes from the URL) - kept
# here only so a client that tries to sneak one into the body gets an
# explicit rejection rather than having it silently ignored.
#
# `tests` is deliberately NOT in the shared base set - the exact same
# `receipt_line_id`-shaped bug this comment already warns about, caught
# by this task's own test suite: `tests` is prohibited at *version
# create* (create_specification_version never accepts it - see its own
# docstring), but it is the one legitimate field `update_specification_
# version` exists to write. Building CREATE/UPDATE sets independently
# below, rather than one shared set used for both, avoids repeating that
# bug a second time in the same app.
_VERSION_ALWAYS_PROHIBITED = {
    "id",
    "specification",
    "specification_id",
    "revision_number",
    "status",
    "version",
    "created_by",
    "created_by_id",
    "created_at",
    "updated_at",
}
_VERSION_CREATE_PROHIBITED = _VERSION_ALWAYS_PROHIBITED | {"tests"}
_VERSION_UPDATE_PROHIBITED = _VERSION_ALWAYS_PROHIBITED

# A test row may only ever say "this parameter, this method/result_type/
# unit/criteria text" - line_number is always server-assigned from list
# position, never accepted directly.
_TEST_PROHIBITED = {"id", "version", "version_id", "line_number"}


def _reject_spec_prohibited_fields(initial_data, prohibited):
    if not isinstance(initial_data, dict):
        return
    rejected = prohibited & set(initial_data.keys())
    if rejected:
        raise serializers.ValidationError(
            {field: "This field cannot be set through this endpoint." for field in sorted(rejected)}
        )


class SpecificationTestSerializer(serializers.ModelSerializer):
    class Meta:
        model = SpecificationTest
        fields = ["id", "line_number", "parameter_name", "method_reference", "result_type", "unit_label", "acceptance_criteria"]
        read_only_fields = fields


class MaterialSpecificationVersionSerializer(serializers.ModelSerializer):
    """Reused unchanged in three places: nested inside
    `MaterialSpecificationSerializer.versions`, the standalone version
    list endpoint, and the version detail endpoint - this project does
    not maintain a separate "light" vs "full" serializer for the same
    shape (see e.g. `PurchaseRequestApprovalRoundSerializer`'s identical
    reuse), so `tests` is always included.
    """

    specification_id = serializers.IntegerField(source="specification.id", read_only=True)
    created_by_id = serializers.IntegerField(source="created_by.id", read_only=True)
    tests = SpecificationTestSerializer(many=True, read_only=True)

    class Meta:
        model = MaterialSpecificationVersion
        fields = [
            "id",
            "specification_id",
            "revision_number",
            "status",
            "reference_document",
            "notes",
            "tests",
            "created_by_id",
            "created_at",
            "updated_at",
            "version",
        ]
        read_only_fields = fields


class MaterialSpecificationSerializer(serializers.ModelSerializer):
    """Deliberately exposes no supplier/price/commercial field - this is
    shared material-master configuration, the same category as
    `apps.catalog.MaterialSerializer`. `versions` is always included
    (summarized only by virtue of `MaterialSpecificationVersionSerializer`
    itself being reasonably small, not a separate lighter shape).
    """

    material_id = serializers.IntegerField(source="material.id", read_only=True)
    material_code = serializers.CharField(source="material.code", read_only=True)
    material_name = serializers.CharField(source="material.name", read_only=True)
    created_by_id = serializers.IntegerField(source="created_by.id", read_only=True)
    versions = MaterialSpecificationVersionSerializer(many=True, read_only=True)

    class Meta:
        model = MaterialSpecification
        fields = [
            "id",
            "material_id",
            "material_code",
            "material_name",
            "code",
            "name",
            "description",
            "latest_revision_number",
            "versions",
            "created_by_id",
            "created_at",
            "updated_at",
            "version",
        ]
        read_only_fields = fields


class MaterialSpecificationCreateSerializer(serializers.Serializer):
    """Creates the specification and its strictly-empty revision-1 draft
    atomically (see apps.quality.services.create_material_specification).
    `reference_document`/`notes`/`tests` are deliberately not accepted
    here at all - only `update_specification_version` ever writes them.
    """

    material_id = serializers.IntegerField()
    code = serializers.CharField(max_length=32)
    name = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        _reject_spec_prohibited_fields(self.initial_data, _SPEC_CREATE_PROHIBITED)
        return attrs


class MaterialSpecificationUpdateSerializer(serializers.Serializer):
    """PATCH-only: `name`/`description`, plus the required
    `expected_version` optimistic-concurrency token (Task 09B-3B.1 -
    see apps.quality.services.update_material_specification's own
    docstring). `material_id`/`code` remain immutable through this API.
    """

    expected_version = serializers.IntegerField()
    name = serializers.CharField(required=False, max_length=255)
    description = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        _reject_spec_prohibited_fields(self.initial_data, _SPEC_UPDATE_PROHIBITED)
        return attrs


class SpecificationVersionCreateSerializer(serializers.Serializer):
    """Creates a new, empty `DRAFT` version - no `tests` field here, see
    apps.quality.services.create_specification_version's own docstring.
    """

    reference_document = serializers.CharField(required=False, allow_blank=True, max_length=200, default="")
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000, default="")

    def validate(self, attrs):
        _reject_spec_prohibited_fields(self.initial_data, _VERSION_CREATE_PROHIBITED)
        return attrs


class SpecificationTestInputSerializer(serializers.Serializer):
    """Used, `many=True`, inside version update input only - never
    exposed standalone, and never accepted at version-create time. Only
    `parameter_name`/`result_type` are required: a draft's tests may be
    incomplete (see SpecificationTest's own docstring).
    """

    parameter_name = serializers.CharField(max_length=200)
    method_reference = serializers.CharField(required=False, allow_blank=True, max_length=200, default="")
    result_type = serializers.ChoiceField(choices=SpecificationTest.ResultType.choices)
    unit_label = serializers.CharField(required=False, allow_blank=True, max_length=50, default="")
    acceptance_criteria = serializers.CharField(required=False, allow_blank=True, default="")

    def to_internal_value(self, data):
        # Not validate()/self.initial_data: when used as a `many=True`
        # child, DRF's ListSerializer calls this child's run_validation()
        # directly per item - see apps.quality.serializers.
        # InspectionObservationInputSerializer's identical override.
        _reject_spec_prohibited_fields(data, _TEST_PROHIBITED)
        return super().to_internal_value(data)


class SpecificationVersionUpdateSerializer(serializers.Serializer):
    """PATCH-only. `expected_version` is always required.
    `reference_document`/`notes`/`tests` are each independently optional
    with **no** `default=` - a key's mere absence must be distinguishable
    from an explicit value, same reasoning as
    IncomingInspectionUpdateSerializer.
    """

    expected_version = serializers.IntegerField()
    reference_document = serializers.CharField(required=False, allow_blank=True, max_length=200)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    tests = SpecificationTestInputSerializer(many=True, required=False)

    def validate(self, attrs):
        _reject_spec_prohibited_fields(self.initial_data, _VERSION_UPDATE_PROHIBITED)
        return attrs
