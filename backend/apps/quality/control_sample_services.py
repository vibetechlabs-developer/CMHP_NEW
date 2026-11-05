from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from apps.audit.services import record
from apps.batch_plans.models import BatchPlan
from apps.products.models import Product
from apps.quality.models import ControlSample
from apps.sales_orders.models import SalesOrder


@transaction.atomic
def create_control_sample(
    *,
    actor,
    company,
    batch_no,
    product_name,
    sample_qty,
    product_id=None,
    sales_order_id=None,
    batch_plan_id=None,
    product_code="",
    pack_size="",
    unit="Bottles",
    sample_type=ControlSample.SampleType.RETENTION,
    storage_location="",
    ar_no="",
    mfg_date=None,
    exp_date=None,
    tested_by="",
    notes="",
    deduct_fg=False,
):
    product = None
    if product_id:
        product = get_object_or_404(Product, pk=product_id, company=company)
        product_code = product_code or product.code
        product_name = product_name or product.name
        pack_size = pack_size or (product.pack_size or "")

    sales_order = None
    if sales_order_id:
        sales_order = get_object_or_404(SalesOrder, pk=sales_order_id, company=company)

    batch_plan = None
    if batch_plan_id:
        batch_plan = get_object_or_404(BatchPlan, pk=batch_plan_id, company=company)
        if sales_order is None:
            sales_order = batch_plan.sales_order_line.sales_order
        if not product and batch_plan.sales_order_line.product_id:
            product = batch_plan.sales_order_line.product
            product_code = product_code or product.code
            product_name = product_name or product.name

    try:
        qty = Decimal(str(sample_qty))
    except Exception as exc:
        raise DjangoValidationError({"sample_qty": "Must be a valid positive decimal."}) from exc
    if qty <= 0:
        raise DjangoValidationError({"sample_qty": "Sample quantity must be greater than zero."})

    sample = ControlSample(
        company=company,
        product=product,
        sales_order=sales_order,
        batch_plan=batch_plan,
        batch_no=(batch_no or "").strip(),
        product_code=(product_code or "").strip(),
        product_name=(product_name or "").strip(),
        pack_size=(pack_size or "").strip(),
        sample_qty=qty,
        unit=(unit or "Bottles").strip() or "Bottles",
        sample_type=sample_type or ControlSample.SampleType.RETENTION,
        storage_location=(storage_location or "").strip(),
        ar_no=(ar_no or "").strip(),
        mfg_date=mfg_date,
        exp_date=exp_date,
        tested_by=(tested_by or "").strip(),
        notes=(notes or "").strip(),
        fg_deducted=bool(deduct_fg),
        created_by=actor,
    )
    sample.save()

    record(
        actor=actor,
        action="control_sample.created",
        target_type="control_sample",
        target_id=sample.id,
        company=company,
        after={
            "batch_no": sample.batch_no,
            "product_name": sample.product_name,
            "sample_qty": str(sample.sample_qty),
            "sales_order_id": sample.sales_order_id,
            "fg_deducted": sample.fg_deducted,
        },
    )
    return sample


@transaction.atomic
def update_control_sample(*, actor, company, sample_id, data):
    sample = ControlSample.objects.select_for_update().get(pk=sample_id, company=company)
    if sample.status == ControlSample.Status.DISPOSED:
        raise DjangoValidationError({"detail": "A disposed control sample cannot be edited."})

    before = {"status": sample.status, "storage_location": sample.storage_location, "notes": sample.notes}
    for field in (
        "storage_location", "ar_no", "tested_by", "notes", "pack_size", "unit",
        "mfg_date", "exp_date", "sample_type",
    ):
        if field in data:
            setattr(sample, field, data[field])
    if "sample_qty" in data:
        qty = Decimal(str(data["sample_qty"]))
        if qty <= 0:
            raise DjangoValidationError({"sample_qty": "Sample quantity must be greater than zero."})
        sample.sample_qty = qty
    sample.save()

    record(
        actor=actor,
        action="control_sample.updated",
        target_type="control_sample",
        target_id=sample.id,
        company=company,
        before=before,
        after={"status": sample.status, "storage_location": sample.storage_location, "notes": sample.notes},
    )
    return sample


@transaction.atomic
def dispose_control_sample(*, actor, company, sample_id, remarks=""):
    sample = ControlSample.objects.select_for_update().get(pk=sample_id, company=company)
    if sample.status == ControlSample.Status.DISPOSED:
        return sample
    before = {"status": sample.status}
    sample.status = ControlSample.Status.DISPOSED
    sample.disposed_by = actor
    sample.disposed_at = timezone.now()
    sample.disposal_remarks = (remarks or "").strip()
    sample.save(
        update_fields=["status", "disposed_by", "disposed_at", "disposal_remarks", "updated_at"]
    )
    record(
        actor=actor,
        action="control_sample.disposed",
        target_type="control_sample",
        target_id=sample.id,
        company=company,
        before=before,
        after={"status": sample.status, "disposal_remarks": sample.disposal_remarks},
    )
    return sample


def sample_qty_by_sales_order(*, company, sales_order_ids):
    """Sum non-disposed control sample qty per sales order id."""
    from django.db.models import Sum

    rows = (
        ControlSample.objects.filter(company=company, sales_order_id__in=sales_order_ids)
        .exclude(status=ControlSample.Status.DISPOSED)
        .values("sales_order_id")
        .annotate(total=Sum("sample_qty"))
    )
    return {row["sales_order_id"]: row["total"] for row in rows}
