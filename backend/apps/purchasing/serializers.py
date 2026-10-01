from decimal import Decimal

from rest_framework import serializers

from apps.purchasing.models import (
    PurchaseOrder,
    PurchaseOrderIssueLineSnapshot,
    PurchaseOrderIssueSnapshot,
    PurchaseOrderLine,
    PurchaseRequest,
    PurchaseRequestApproval,
    PurchaseRequestApprovalRound,
    PurchaseRequestApprovalRoundLine,
    PurchaseRequestLine,
)

# Same convention as apps.catalog.serializers/apps.suppliers.serializers:
# fields explicitly rejected (400), not silently ignored, if present in
# the request body. `status`/`reference`/`version`/the actor+timestamp
# fields/`cancellation_reason` are all server-managed and have no
# writable path through create/update; `company`/`company_id` come
# exclusively from the URL, never the body; `quantity`/`stock`/
# `owner_id`/`owner` do not exist on any purchasing model at all - no
# stock effect exists anywhere in this task.
_HEADER_PROHIBITED = {
    "status",
    "reference",
    "version",
    "company",
    "company_id",
    "created_at",
    "updated_at",
    "created_by",
    "created_by_id",
    "submitted_by",
    "submitted_by_id",
    "submitted_at",
    "cancelled_by",
    "cancelled_by_id",
    "cancelled_at",
    "cancellation_reason",
    "quantity",
    "stock",
    "owner_id",
    "owner",
}

# A line may only ever say "this material, this quantity, this note" -
# `unit_id`/`unit` are always server-derived from the material's base
# unit (no unit override, no unit-conversion input); no supplier or
# price field exists anywhere on a PurchaseRequestLine.
_LINE_PROHIBITED = {
    "id",
    "purchase_request",
    "purchase_request_id",
    "line_number",
    "unit",
    "unit_id",
    "unit_code",
    "unit_price",
    "price",
    "supplier",
    "supplier_id",
    "material_code_snapshot",
    "material_name_snapshot",
    "unit_code_snapshot",
    "unit_name_snapshot",
}


def _reject_prohibited_fields(initial_data, prohibited):
    if not isinstance(initial_data, dict):
        return
    rejected = prohibited & set(initial_data.keys())
    if rejected:
        raise serializers.ValidationError(
            {field: "This field cannot be set through this endpoint." for field in sorted(rejected)}
        )


class PurchaseRequestLineSerializer(serializers.ModelSerializer):
    material_id = serializers.IntegerField(source="material.id", read_only=True)
    material_code = serializers.CharField(source="material.code", read_only=True)
    material_name = serializers.CharField(source="material.name", read_only=True)
    unit_id = serializers.IntegerField(source="unit.id", read_only=True)
    unit_code = serializers.CharField(source="unit.code", read_only=True)
    unit_name = serializers.CharField(source="unit.name", read_only=True)

    class Meta:
        model = PurchaseRequestLine
        fields = [
            "id",
            "line_number",
            "material_id",
            "material_code",
            "material_name",
            "unit_id",
            "unit_code",
            "unit_name",
            "quantity",
            "notes",
            "material_code_snapshot",
            "material_name_snapshot",
            "unit_code_snapshot",
            "unit_name_snapshot",
        ]
        read_only_fields = fields


class PurchaseRequestApprovalRoundLineSerializer(serializers.ModelSerializer):
    material_id = serializers.IntegerField(source="material.id", read_only=True)
    unit_id = serializers.IntegerField(source="unit.id", read_only=True)

    class Meta:
        model = PurchaseRequestApprovalRoundLine
        fields = [
            "id",
            "line_number",
            "material_id",
            "quantity",
            "unit_id",
            "notes",
            "material_code_snapshot",
            "material_name_snapshot",
            "unit_code_snapshot",
            "unit_name_snapshot",
        ]
        read_only_fields = fields


class PurchaseRequestApprovalDecisionRecordSerializer(serializers.ModelSerializer):
    """One append-only decision row (approve/reject/cancel) - never
    editable through any API, read-only in every context it appears.
    """

    actor_id = serializers.IntegerField(source="actor.id", read_only=True)

    class Meta:
        model = PurchaseRequestApproval
        fields = ["id", "step", "decision", "actor_id", "decided_at", "reason"]
        read_only_fields = fields


class PurchaseRequestApprovalRoundSerializer(serializers.ModelSerializer):
    """One approval round's permanent snapshot plus every decision made
    within it - see PurchaseRequestApprovalRound's model docstring for
    why this is a full, separate copy rather than a view over the live
    PurchaseRequest/PurchaseRequestLine rows.
    """

    submitted_by_id = serializers.IntegerField(source="submitted_by.id", read_only=True)
    lines = PurchaseRequestApprovalRoundLineSerializer(many=True, read_only=True)
    decisions = PurchaseRequestApprovalDecisionRecordSerializer(many=True, read_only=True)

    class Meta:
        model = PurchaseRequestApprovalRound
        fields = [
            "id",
            "round_number",
            "required_by_snapshot",
            "notes_snapshot",
            "submitted_by_id",
            "submitted_at",
            "outcome",
            "closed_at",
            "lines",
            "decisions",
        ]
        read_only_fields = fields


class PurchaseRequestSerializer(serializers.ModelSerializer):
    company_id = serializers.IntegerField(source="company.id", read_only=True)
    company_code = serializers.CharField(source="company.code", read_only=True)
    created_by_id = serializers.IntegerField(source="created_by.id", read_only=True)
    submitted_by_id = serializers.SerializerMethodField()
    cancelled_by_id = serializers.SerializerMethodField()
    lines = PurchaseRequestLineSerializer(many=True, read_only=True)
    approval_rounds = PurchaseRequestApprovalRoundSerializer(many=True, read_only=True)

    class Meta:
        model = PurchaseRequest
        fields = [
            "id",
            "company_id",
            "company_code",
            "reference",
            "status",
            "required_by",
            "notes",
            "created_by_id",
            "submitted_by_id",
            "submitted_at",
            "cancelled_by_id",
            "cancelled_at",
            "cancellation_reason",
            "created_at",
            "updated_at",
            "version",
            "current_round",
            "current_step",
            "lines",
            "approval_rounds",
        ]
        read_only_fields = fields

    def get_submitted_by_id(self, obj):
        return obj.submitted_by_id

    def get_cancelled_by_id(self, obj):
        return obj.cancelled_by_id


class PurchaseRequestLineInputSerializer(serializers.Serializer):
    """Used, `many=True`, inside both create and update input - never
    exposed standalone. `notes` has no `default=` here deliberately: the
    parent list is always a full replacement (or a full initial set), so
    every line in it is a complete row regardless of whether `notes` was
    supplied for it.
    """

    material_id = serializers.IntegerField()
    quantity = serializers.DecimalField(max_digits=14, decimal_places=3, min_value=Decimal("0.001"))
    notes = serializers.CharField(required=False, allow_blank=True, max_length=500)

    def to_internal_value(self, data):
        # Not validate()/self.initial_data: when used as a `many=True`
        # child, DRF's ListSerializer calls this child's run_validation()
        # directly per item - it never goes through is_valid(), which is
        # the only place a top-level serializer's self.initial_data gets
        # set. to_internal_value() still receives each item's raw dict
        # directly as `data`, so that is checked instead.
        _reject_prohibited_fields(data, _LINE_PROHIBITED)
        return super().to_internal_value(data)


class PurchaseRequestCreateSerializer(serializers.Serializer):
    """`company` is deliberately absent - it comes exclusively from the
    URL (`company_id`), resolved and permission-checked by the view
    before this serializer ever runs. `lines` defaults to an empty list:
    an empty draft is explicitly allowed.
    """

    required_by = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000, default="")
    lines = PurchaseRequestLineInputSerializer(many=True, required=False, default=list)

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _HEADER_PROHIBITED)
        return attrs


class PurchaseRequestUpdateSerializer(serializers.Serializer):
    """PATCH-only. `expected_version` is always required (optimistic
    concurrency - see apps.purchasing.services). `required_by`/`notes`/
    `lines` are each independently optional with **no** `default=`: a
    key's mere absence from the request body must be distinguishable from
    an explicit empty value, since the service layer treats "key present"
    as "the caller intends to (possibly) change this," including
    `lines: []` meaning "replace with zero lines," which is different
    from omitting `lines` entirely ("leave the existing lines alone").
    """

    expected_version = serializers.IntegerField()
    required_by = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    lines = PurchaseRequestLineInputSerializer(many=True, required=False)

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _HEADER_PROHIBITED)
        return attrs


class PurchaseRequestVersionSerializer(serializers.Serializer):
    """Body shape for the submit endpoint: only the optimistic-concurrency
    token, nothing else to submit.
    """

    expected_version = serializers.IntegerField()


class PurchaseRequestCancelSerializer(serializers.Serializer):
    expected_version = serializers.IntegerField()
    cancellation_reason = serializers.CharField(max_length=1000, allow_blank=False)


class PurchaseRequestApprovalDecisionSerializer(serializers.Serializer):
    """Body shape shared by approve/reject: the usual optimistic-
    concurrency `expected_version`, plus `expected_round`/`expected_step`
    - the caller's belief about which round/step is currently pending.
    Both are required (see apps.purchasing.services.approve_purchase_
    request for why a version match alone is not enough to make a
    retried decision safe).
    """

    expected_version = serializers.IntegerField()
    expected_round = serializers.IntegerField(min_value=1)
    expected_step = serializers.IntegerField(min_value=1)


class PurchaseRequestRejectSerializer(PurchaseRequestApprovalDecisionSerializer):
    rejection_reason = serializers.CharField(max_length=1000, allow_blank=False)


# ---------------------------------------------------------------------------
# Task 08C-1: Purchase Order drafts
# ---------------------------------------------------------------------------

# Always server-managed, on both create and update - never a writable
# path through either endpoint.
_PO_HEADER_ALWAYS_PROHIBITED = {
    "status",
    "reference",
    "version",
    "company",
    "company_id",
    "created_at",
    "updated_at",
    "created_by",
    "created_by_id",
    "cancelled_by",
    "cancelled_by_id",
    "cancelled_at",
    "cancellation_reason",
    "quantity",
}

# `lines` is never accepted at creation - every line is always derived
# from the source request's approved round, never client-supplied (see
# create_purchase_order) - but it deliberately IS accepted on update
# (that is the only way to edit a line's unit_price - see
# PurchaseOrderUpdateSerializer/PurchaseOrderLineUpdateInputSerializer),
# so this set is built separately from _PO_HEADER_UPDATE_PROHIBITED
# rather than by uniting the two - unioning them would wrongly carry
# "lines" over into the update-prohibited set too.
_PO_HEADER_CREATE_PROHIBITED = _PO_HEADER_ALWAYS_PROHIBITED | {"lines"}

# `source_purchase_request`/`currency_code` are accepted only at
# creation, immutable afterwards - see PurchaseOrder.clean().
_PO_HEADER_UPDATE_PROHIBITED = _PO_HEADER_ALWAYS_PROHIBITED | {
    "source_purchase_request",
    "source_purchase_request_id",
    "currency_code",
}

# A line update may only ever say "this line id, this unit_price" -
# quantity/material/unit are always copied once from the approved round
# and never accepted here; `line_amount` is always server-calculated.
_PO_LINE_UPDATE_PROHIBITED = {
    "purchase_order",
    "purchase_order_id",
    "line_number",
    "source_round_line",
    "source_round_line_id",
    "material",
    "material_id",
    "unit",
    "unit_id",
    "quantity",
    "line_amount",
    "material_code_snapshot",
    "material_name_snapshot",
    "unit_code_snapshot",
    "unit_name_snapshot",
}


class PurchaseOrderLineSerializer(serializers.ModelSerializer):
    material_id = serializers.IntegerField(source="material.id", read_only=True)
    material_code = serializers.CharField(source="material.code", read_only=True)
    material_name = serializers.CharField(source="material.name", read_only=True)
    unit_id = serializers.IntegerField(source="unit.id", read_only=True)
    unit_code = serializers.CharField(source="unit.code", read_only=True)
    unit_name = serializers.CharField(source="unit.name", read_only=True)
    source_round_line_id = serializers.IntegerField(source="source_round_line.id", read_only=True)

    class Meta:
        model = PurchaseOrderLine
        fields = [
            "id",
            "line_number",
            "source_round_line_id",
            "material_id",
            "material_code",
            "material_name",
            "unit_id",
            "unit_code",
            "unit_name",
            "quantity",
            "unit_price",
            "line_amount",
            "material_code_snapshot",
            "material_name_snapshot",
            "unit_code_snapshot",
            "unit_name_snapshot",
        ]
        read_only_fields = fields


class PurchaseOrderIssueLineSnapshotSerializer(serializers.ModelSerializer):
    purchase_order_line_id = serializers.IntegerField(source="purchase_order_line.id", read_only=True)

    class Meta:
        model = PurchaseOrderIssueLineSnapshot
        fields = [
            "id",
            "purchase_order_line_id",
            "line_number",
            "material_code_snapshot",
            "material_name_snapshot",
            "unit_code_snapshot",
            "unit_name_snapshot",
            "quantity_snapshot",
            "unit_price_snapshot",
            "line_amount_snapshot",
        ]
        read_only_fields = fields


class PurchaseOrderIssueSnapshotSerializer(serializers.ModelSerializer):
    """The permanent, issue-time record - see PurchaseOrderIssueSnapshot's
    model docstring for why company/supplier identity is copied here
    instead of read live off the current Company/Supplier rows.
    """

    issued_by_id = serializers.IntegerField(source="issued_by.id", read_only=True)
    lines = PurchaseOrderIssueLineSnapshotSerializer(many=True, read_only=True)

    class Meta:
        model = PurchaseOrderIssueSnapshot
        fields = [
            "id",
            "issued_by_id",
            "issued_at",
            "company_code_snapshot",
            "company_legal_name_snapshot",
            "company_display_name_snapshot",
            "supplier_code_snapshot",
            "supplier_legal_name_snapshot",
            "supplier_display_name_snapshot",
            "supplier_contact_name_snapshot",
            "supplier_email_snapshot",
            "supplier_phone_snapshot",
            "supplier_address_line_1_snapshot",
            "supplier_address_line_2_snapshot",
            "supplier_city_snapshot",
            "supplier_state_region_snapshot",
            "supplier_postal_code_snapshot",
            "supplier_country_code_snapshot",
            "currency_code_snapshot",
            "subtotal_snapshot",
            "expected_delivery_date_snapshot",
            "notes_snapshot",
            "source_purchase_request_reference_snapshot",
            "approved_round_number_snapshot",
            "lines",
        ]
        read_only_fields = fields


class PurchaseOrderSerializer(serializers.ModelSerializer):
    company_id = serializers.IntegerField(source="company.id", read_only=True)
    company_code = serializers.CharField(source="company.code", read_only=True)
    source_purchase_request_id = serializers.IntegerField(source="source_purchase_request.id", read_only=True)
    source_purchase_request_reference = serializers.CharField(
        source="source_purchase_request.reference", read_only=True
    )
    supplier_id = serializers.IntegerField(source="supplier.id", read_only=True)
    supplier_code = serializers.CharField(source="supplier.code", read_only=True)
    created_by_id = serializers.IntegerField(source="created_by.id", read_only=True)
    issued_by_id = serializers.SerializerMethodField()
    cancelled_by_id = serializers.SerializerMethodField()
    lines = PurchaseOrderLineSerializer(many=True, read_only=True)
    subtotal = serializers.SerializerMethodField()
    issue_snapshot = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrder
        fields = [
            "id",
            "company_id",
            "company_code",
            "reference",
            "status",
            "source_purchase_request_id",
            "source_purchase_request_reference",
            "supplier_id",
            "supplier_code",
            "expected_delivery_date",
            "notes",
            "currency_code",
            "created_by_id",
            "created_at",
            "updated_at",
            "issued_by_id",
            "issued_at",
            "cancelled_by_id",
            "cancelled_at",
            "cancellation_reason",
            "version",
            "lines",
            "subtotal",
            "issue_snapshot",
        ]
        read_only_fields = fields

    def get_cancelled_by_id(self, obj):
        return obj.cancelled_by_id

    def get_issued_by_id(self, obj):
        return obj.issued_by_id

    def get_issue_snapshot(self, obj):
        """`None` until the order is actually issued - no receipt/
        delivered/emailed concept is ever exposed here or anywhere else
        in this task, only the permanent issue-time record itself.
        """
        try:
            snapshot = obj.issue_snapshot
        except PurchaseOrderIssueSnapshot.DoesNotExist:
            return None
        return PurchaseOrderIssueSnapshotSerializer(snapshot).data

    def get_subtotal(self, obj):
        """Sum of every line's `line_amount` - a pre-tax subtotal only.
        Deliberately computed here, not stored: it is always exactly
        derivable from the lines already being serialized, so storing a
        separate, potentially-stale copy would only add a place for the
        two to disagree. No GST/discount/freight/invoice-total concept
        exists anywhere in this task - see PurchaseOrderLine's docstring.
        """
        return str(sum((line.line_amount for line in obj.lines.all()), Decimal("0.00")))


class PurchaseOrderCreateSerializer(serializers.Serializer):
    """`company` is deliberately absent - it comes exclusively from the
    URL (`company_id`), resolved and permission-checked by the view
    before this serializer ever runs, and is always set equal to the
    source purchase request's own company (see apps.purchasing.services.
    create_purchase_order - cross-company purchasing is not supported in
    this slice). `lines` is deliberately absent too - every line is
    always derived from the source request's approved round, never
    client-supplied (see that same service for why).
    """

    source_purchase_request_id = serializers.IntegerField()
    supplier_id = serializers.IntegerField()
    currency_code = serializers.CharField(max_length=3)
    expected_delivery_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000, default="")

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _PO_HEADER_CREATE_PROHIBITED)
        return attrs


class PurchaseOrderLineUpdateInputSerializer(serializers.Serializer):
    """Used, `many=True`, inside the update body's optional `lines` list -
    never exposed standalone. Identifies an existing line by its own
    `id` (server-assigned, already known from a prior GET) rather than
    `line_number`, since `id` is the more stable, unambiguous handle a
    client already has once it has fetched the order at least once.
    """

    id = serializers.IntegerField()
    unit_price = serializers.DecimalField(max_digits=14, decimal_places=4, min_value=Decimal("0"))

    def to_internal_value(self, data):
        # See PurchaseRequestLineInputSerializer's identical override for
        # why to_internal_value(), not validate()/self.initial_data, is
        # used here - the same many=True child-serializer constraint
        # applies.
        _reject_prohibited_fields(data, _PO_LINE_UPDATE_PROHIBITED)
        return super().to_internal_value(data)


class PurchaseOrderUpdateSerializer(serializers.Serializer):
    """PATCH-only. `expected_version` is always required. `supplier_id`/
    `expected_delivery_date`/`notes`/`lines` are each independently
    optional with **no** `default=` - a key's mere absence must be
    distinguishable from an explicit value, same reasoning as
    PurchaseRequestUpdateSerializer. `lines`, if present, only ever
    updates `unit_price` on existing lines - no line may be added,
    removed, or have its quantity/material/unit changed (see
    apps.purchasing.services.update_purchase_order).
    """

    expected_version = serializers.IntegerField()
    supplier_id = serializers.IntegerField(required=False)
    expected_delivery_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    lines = PurchaseOrderLineUpdateInputSerializer(many=True, required=False)

    def validate(self, attrs):
        _reject_prohibited_fields(self.initial_data, _PO_HEADER_UPDATE_PROHIBITED)
        return attrs


class PurchaseOrderCancelSerializer(serializers.Serializer):
    expected_version = serializers.IntegerField()
    cancellation_reason = serializers.CharField(max_length=1000, allow_blank=False)


class PurchaseOrderIssueSerializer(serializers.Serializer):
    """Body shape for the issue endpoint: only the optimistic-concurrency
    token, nothing else to submit - see apps.purchasing.services.
    issue_purchase_order for everything that gets revalidated
    server-side instead of accepted from the caller.
    """

    expected_version = serializers.IntegerField()
