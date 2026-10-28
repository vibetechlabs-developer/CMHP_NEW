from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.catalog.models import Material, UnitOfMeasure
from apps.companies.models import Company, normalize_code
from apps.purchasing.models import PurchaseOrder, PurchaseOrderIssueLineSnapshot
from apps.stores.models import SharedStore


class ContainerType(models.Model):
    """A shared, company/store-independent packaging container identity
    (e.g. Bag, Drum, Tin, Bottle, Box, Other) - mirrors UnitOfMeasure's own
    shape (code/name/is_active/timestamps) exactly, for the same reason:
    this is reference data, not business data, and gets the same
    activate/deactivate lifecycle as every other reference-data model in
    this project rather than a one-off shape of its own.

    Deliberately NOT a unit of measure and carries no conversion factor of
    its own - "a drum is packaging, not a conversion factor." A container
    type only ever describes how material was bundled on one
    GoodsReceiptLine (`container_type`/`container_quantity`) or a
    Material's own `default_container_type` suggestion; it never
    participates in any quantity calculation.
    """

    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=100)
    description = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["code"]
        verbose_name = "container type"
        verbose_name_plural = "container types"

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
            original_code = ContainerType.objects.filter(pk=self.pk).values_list("code", flat=True).first()
            if original_code is not None and original_code != self.code:
                errors["code"] = "Code cannot be changed after creation."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class GoodsReceipt(models.Model):
    """A record of physical material arrival against one already-`ISSUED`
    PurchaseOrder, at one shared physical store. Task 09A scope only.

    CONFIRMED SCOPE BOUNDARY (do not read anything below as implying
    otherwise): this model records that materials physically arrived and
    how much of each, nothing more. It does **not** create available
    stock (no stock-ledger/stock-balance concept exists anywhere in this
    codebase), does **not** record any QC acceptance/rejection decision,
    does **not** post any accounting/financial entry, does **not** move
    anything between companies, and does **not** trigger a supplier
    payment. `FULLY_RECEIVED` delivery progress (see apps.receiving.
    services) means only "the ordered quantity has physically arrived,
    on paper" - never "accepted," "usable," or "financially closed."

    `company` is always the PurchaseOrder's own company, copied here at
    creation and never independently settable - see
    apps.receiving.services.create_goods_receipt. It means "purchasing
    company" only, exactly the same caveat `PurchaseOrder.company`
    already carries (see docs/purchase-order-proposal.md): recording a
    receipt against a shared physical store does **not** establish which
    company legally owns the stock once it arrives. That question is
    unresolved by this task, same as by Task 08C-1/08C-2.

    `store` is independent of `company` entirely - a shared physical
    location two companies both use, exactly as apps.stores.models.
    SharedStore has meant since Task 07A. A GoodsReceipt's store is
    wherever the goods were physically received, which need not be tied
    to the PO's own company in any way this codebase enforces.

    `idempotency_key` supports safe create-retries (Task 09A's own
    requirement - no other document type in this codebase has one yet):
    a client-supplied, optionally blank, otherwise-unique token. A create
    call reusing an existing key with identical content is a no-op retry
    (returns the existing row); reusing it with different content is a
    conflict - see apps.receiving.services.create_goods_receipt for the
    exact comparison. This is deliberately a different idempotency
    mechanism from `expected_version` (which protects *transitions* on
    an already-known row) - a key protects the *create* call itself,
    before the caller has a row id to send `expected_version` for.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        POSTED = "POSTED", "Posted"
        CANCELLED = "CANCELLED", "Cancelled"

    reference = models.CharField(max_length=40, unique=True, editable=False)
    idempotency_key = models.CharField(max_length=100, blank=True)
    store = models.ForeignKey(SharedStore, on_delete=models.PROTECT, related_name="goods_receipts")
    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="goods_receipts")
    # Nullable - a manual (non-PO) receipt (see MANUAL ENTRY MODE below)
    # has nothing to link here. A PO-based receipt (the original, still
    # default path) always has one, unchanged from before.
    source_purchase_order = models.ForeignKey(
        PurchaseOrder, on_delete=models.PROTECT, related_name="goods_receipts", null=True, blank=True
    )
    # MANUAL ENTRY MODE (added after Task 09A): free-text, supplier-
    # supplied only, exactly like GoodsReceiptLine.lot_reference's own
    # precedent below - never a claim that this name exists in the real
    # Supplier catalog. Used only when source_purchase_order is null;
    # left blank for a PO-based receipt, which keeps deriving its
    # supplier display from the PO's own real, catalog-linked supplier
    # instead (no change to that existing, unambiguous path).
    supplier_name = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    arrived_at = models.DateTimeField()
    # Independent references, never one standing in for the other: a
    # supplier invoice number when the invoice has actually arrived with
    # (or before) the goods, and a delivery/reference note for when it has
    # not - both optional, both blank by default, neither inferred from
    # the other.
    supplier_invoice_reference = models.CharField(max_length=100, blank=True)
    delivery_note_reference = models.CharField(max_length=100, blank=True)
    notes = models.CharField(max_length=2000, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="goods_receipts_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="goods_receipts_posted",
    )
    posted_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="goods_receipts_cancelled",
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.CharField(max_length=1000, blank=True)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["idempotency_key"],
                condition=~models.Q(idempotency_key=""),
                name="unique_nonblank_goods_receipt_idempotency_key",
            ),
        ]

    def __str__(self):
        return self.reference

    def clean(self):
        self.supplier_invoice_reference = (self.supplier_invoice_reference or "").strip()
        self.delivery_note_reference = (self.delivery_note_reference or "").strip()
        self.notes = (self.notes or "").strip()
        self.cancellation_reason = (self.cancellation_reason or "").strip()
        self.idempotency_key = (self.idempotency_key or "").strip()
        self.supplier_name = (self.supplier_name or "").strip()
        errors = {}
        if not self.reference:
            errors["reference"] = "Reference is required."
        if self.status not in self.Status.values:
            errors["status"] = f"Status must be one of {list(self.Status.values)}."
        if (
            self.company_id
            and self.source_purchase_order_id
            and self.company_id != self.source_purchase_order.company_id
        ):
            errors["company"] = "A goods receipt's company must match its source purchase order's company."
        if self.pk:
            original = (
                GoodsReceipt.objects.filter(pk=self.pk)
                .values("store_id", "company_id", "reference", "source_purchase_order_id")
                .first()
            )
            if original is not None:
                if original["store_id"] != self.store_id:
                    errors["store"] = "Store cannot be changed after creation."
                if original["company_id"] != self.company_id:
                    errors["company"] = "Company cannot be changed after creation."
                if original["reference"] != self.reference:
                    errors["reference"] = "Reference cannot be changed after creation."
                if original["source_purchase_order_id"] != self.source_purchase_order_id:
                    errors["source_purchase_order"] = "Source purchase order cannot be changed after creation."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class GoodsReceiptLine(models.Model):
    """One material/quantity/lot line on a GoodsReceipt.

    `source_po_line` points at the `PurchaseOrderIssueLineSnapshot` (Task
    08C-2's permanent, issue-time record) - not the live
    `PurchaseOrderLine` - because that snapshot, not the live row, is the
    immutable "this is what was actually ordered and finalized" fact this
    task was asked to derive material/unit from. `material`/`unit` (and
    their own `*_snapshot` code/name fields) are copied from it once, at
    receipt-line-creation time, the same snapshot-inheritance pattern
    already used twice elsewhere in this codebase (PurchaseRequestLine ->
    PurchaseRequestApprovalRoundLine -> PurchaseOrderLine) - never
    accepted directly from a caller (see apps.receiving.services).

    No `UniqueConstraint` ties `source_po_line` to at most one line -
    deliberately: "support multiple lots for one PO line" means several
    `GoodsReceiptLine` rows, across the same or different `GoodsReceipt`
    documents, may legitimately reference the same source PO line, each
    with its own `lot_reference`/`received_quantity` (e.g. two different
    supplier batches arriving in the same physical delivery). Only
    `(goods_receipt, line_number)` is unique - line numbering within one
    document.

    `lot_reference` is optional, free-text, supplier-supplied only -
    never fabricated by this system. No manufacturing-date or
    expiry-date field exists on this model: inventing one without real
    source data would be worse than not having it - see
    docs/receiving-proposal.md for exactly what lot detail a future
    QC/stock task would still need before it could rely on this model.
    """

    goods_receipt = models.ForeignKey(GoodsReceipt, on_delete=models.CASCADE, related_name="lines")
    line_number = models.PositiveIntegerField()
    # Nullable - null on a MANUAL ENTRY MODE line (see unit_price/
    # currency_code below), set on a PO-based line exactly as before.
    source_po_line = models.ForeignKey(
        PurchaseOrderIssueLineSnapshot, on_delete=models.PROTECT, related_name="goods_receipt_lines",
        null=True, blank=True,
    )
    material = models.ForeignKey(Material, on_delete=models.PROTECT, related_name="goods_receipt_lines")
    unit = models.ForeignKey(UnitOfMeasure, on_delete=models.PROTECT, related_name="goods_receipt_lines")
    received_quantity = models.DecimalField(max_digits=14, decimal_places=3)
    lot_reference = models.CharField(max_length=100, blank=True)
    container_type = models.ForeignKey(ContainerType, on_delete=models.PROTECT, null=True, blank=True, related_name="goods_receipt_lines")
    container_quantity = models.PositiveIntegerField(null=True, blank=True)
    material_code_snapshot = models.CharField(max_length=32, blank=True)
    material_name_snapshot = models.CharField(max_length=255, blank=True)
    unit_code_snapshot = models.CharField(max_length=20, blank=True)
    unit_name_snapshot = models.CharField(max_length=100, blank=True)
    # MANUAL ENTRY MODE ONLY (source_po_line is null): a directly-entered
    # price, never independently settable on a PO-based line - that line
    # keeps deriving price from source_po_line.issue_snapshot exactly as
    # before (see apps.receiving.services.create_goods_receipt's own
    # "price read-only, never editable here" rule, which still applies
    # unchanged to every PO-based line).
    unit_price = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    currency_code = models.CharField(max_length=3, blank=True)

    class Meta:
        ordering = ["line_number", "id"]
        constraints = [
            models.UniqueConstraint(fields=["goods_receipt", "line_number"], name="unique_goods_receipt_line_number"),
            models.CheckConstraint(
                check=models.Q(received_quantity__gt=0), name="goods_receipt_line_quantity_positive"
            ),
            models.CheckConstraint(
                check=models.Q(source_po_line__isnull=False, unit_price__isnull=True, currency_code="")
                | models.Q(source_po_line__isnull=True),
                name="goods_receipt_line_po_price_not_independently_set",
            ),
        ]

    def __str__(self):
        return f"{self.goods_receipt.reference} line {self.line_number}"

    def clean(self):
        self.lot_reference = (self.lot_reference or "").strip()
        self.currency_code = (self.currency_code or "").strip().upper()
        errors = {}
        if self.received_quantity is not None and self.received_quantity <= 0:
            errors["received_quantity"] = "Received quantity must be greater than zero."
        if self.source_po_line_id and (self.unit_price is not None or self.currency_code):
            errors["unit_price"] = "Price cannot be set directly on a PO-based line - it is derived from the purchase order."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)
