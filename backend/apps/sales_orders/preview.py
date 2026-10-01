from decimal import Decimal

from django.utils import timezone

from apps.quotations.services import _LINE_AMOUNT_QUANTIZE
from apps.sales_orders.confirmation import (
    POLICY_NOT_CONFIGURED_MESSAGE,
    assess_confirmation,
    business_today,
)

PREVIEW_NOTICE = (
    "Informational only. This review reflects the order, its master data and the company confirmation "
    "rules at the moment it was generated and can be stale immediately. It does not guarantee that a later "
    "confirmation will succeed: confirming re-checks everything at that time, against the order version "
    "you reviewed (`order.version`)."
)


def build_confirmation_preview(order, *, actor, actor_has_confirm_permission, policy, today=None):
    """Read-only. Takes an already-loaded SalesOrder (with `customer` and
    `lines__product__sales_uom`) and the company's policy row (or None) and
    returns a plain dict. It calls the SAME `assess_confirmation` the
    confirm command uses, so the two cannot drift; it performs no writes
    (no `save()`, no audit, no version change, no locks) and never
    refreshes a snapshot. Stored snapshot values are the historical
    record; live master state is separate under `lines[].current`.
    """
    today = today or business_today()
    lines = list(order.lines.all())
    customer = order.customer
    assessment = assess_confirmation(order, customer, lines, policy, actor=actor, today=today)

    total = Decimal("0")
    line_rows = []
    for line in lines:
        product = line.product
        uom = product.sales_uom
        total += line.line_amount
        line_rows.append(
            {
                "id": line.id,
                "line_number": line.line_number,
                "product_id": line.product_id,
                "product_code": line.product_code_snapshot,
                "product_name": line.product_name_snapshot,
                "sales_uom_code": line.sales_uom_code_snapshot,
                "sales_uom_name": line.sales_uom_name_snapshot,
                "quantity": str(line.quantity),
                "unit_price": str(line.unit_price),
                "line_amount": str(line.line_amount),
                "description": line.description,
                "current": {
                    "product_code": product.code,
                    "product_name": product.name,
                    "product_is_active": product.is_active,
                    "sales_uom_code": uom.code,
                    "sales_uom_name": uom.name,
                    "sales_uom_is_active": uom.is_active,
                },
            }
        )

    blocking = assessment["blocking_reasons"]
    policy_state = assessment["policy"]["status"]
    return {
        "preview": {
            "informational": True,
            "generated_at": timezone.now().isoformat(),
            "business_date": today.isoformat(),
            "notice": PREVIEW_NOTICE,
        },
        "order": {
            "id": order.id,
            "company_id": order.company_id,
            "reference": order.reference,
            "status": order.status,
            "version": order.version,
            "order_date": order.order_date.isoformat(),
            "requested_delivery_date": (
                order.requested_delivery_date.isoformat() if order.requested_delivery_date else None
            ),
            "customer_order_reference": order.customer_order_reference,
            "notes": order.notes,
            "currency": order.currency,
            "confirmed_by_id": order.confirmed_by_id,
            "confirmed_at": order.confirmed_at.isoformat() if order.confirmed_at else None,
        },
        "customer": {
            "id": customer.id,
            "code": customer.code,
            "name": customer.name,
            "is_active": customer.is_active,
        },
        "lines": line_rows,
        "subtotal": str(total.quantize(_LINE_AMOUNT_QUANTIZE)),
        "confirmation": {
            "workflow_implemented": True,
            "policy": assessment["policy"],
            "policy_message": POLICY_NOT_CONFIGURED_MESSAGE if policy_state != "CONFIGURED" else None,
            "blocking_reasons": blocking,
            "informational_observations": assessment["informational_observations"],
            "actor_has_confirm_permission": actor_has_confirm_permission,
            # A convenience for enabling the button, NOT a guarantee: true
            # only when the order is a draft, the viewer holds
            # sales_orders.confirm, and no blocking reason was found now.
            "ready_to_attempt": bool(actor_has_confirm_permission and not blocking),
        },
    }
