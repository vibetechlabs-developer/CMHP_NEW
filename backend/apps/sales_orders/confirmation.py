"""Task 10F: the ONE place sales-order confirmation eligibility is assessed.
Both the read-only `confirmation-preview` endpoint and the transactional
`confirm_sales_order` command call `assess_confirmation`, so the preview can
never drift from the rules the command enforces. (The preview still cannot
guarantee a later success: state can change between the two calls.)

Three deliberately separate kinds of findings:
- POLICY_NOT_CONFIGURED: the company has not answered the explicit policy
  questions; blocks confirmation, never defaulted.
- ELIGIBILITY: technical implementation safeguards (at least one line;
  active customer/products/sales units; positive, unit-valid quantities;
  existing currency/monetary validation; order still a draft). These are
  implementation safeguards to be REVIEWED WITH THE CLIENT, not previously
  confirmed business policy.
- POLICY_RULE: an explicit company policy value that says "no" (zero-price
  lines, past requested delivery date, self-confirmation).
Informational observations never block.
"""

import datetime
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework.exceptions import APIException

from apps.catalog.models import UnitOfMeasure
from apps.quotations.services import _compute_line_amount, _normalize_currency

POLICY_NOT_CONFIGURED_MESSAGE = "Confirmation rules are not configured. Contact your administrator."

POLICY_VALUE_FIELDS = ("allow_self_confirmation", "allow_zero_price_lines", "allow_past_requested_delivery_dates")

CATEGORY_POLICY_NOT_CONFIGURED = "POLICY_NOT_CONFIGURED"
CATEGORY_ELIGIBILITY = "ELIGIBILITY"
CATEGORY_POLICY_RULE = "POLICY_RULE"

# Documented for client review; recorded on every confirmation.
ELIGIBILITY_SAFEGUARDS = [
    "at least one line",
    "active customer, products and sales units",
    "positive quantities (whole numbers for COUNT units)",
    "valid currency, non-negative unit prices and consistent line amounts",
]


class ConfirmationBlocked(APIException):
    """HTTP 400 with a structured body. `detail` is set directly (not passed
    through DRF's stringifying error-detail conversion) so `line_id`/
    `line_number` stay integers for clients.
    """

    status_code = 400
    default_detail = "The order cannot be confirmed."
    default_code = "confirmation_blocked"

    def __init__(self, payload):
        super().__init__()
        self.detail = payload


def business_today():
    """The BUSINESS calendar date, using `settings.BUSINESS_TIME_ZONE`
    (default Asia/Kolkata - an assumption for client review), not UTC.
    """
    return timezone.now().astimezone(ZoneInfo(settings.BUSINESS_TIME_ZONE)).date()


def policy_status(policy):
    if policy is None:
        return "NOT_CONFIGURED"
    return "CONFIGURED" if policy.is_complete else "INCOMPLETE"


def policy_summary(policy):
    """The effective policy information order viewers need to understand a
    blocking reason. Deliberately omits who configured it and when.
    """
    status = policy_status(policy)
    summary = {
        "status": status,
        "version": policy.version if policy is not None else None,
        **{field: (getattr(policy, field) if policy is not None else None) for field in POLICY_VALUE_FIELDS},
    }
    return summary


def policy_snapshot(policy, today):
    """What is recorded on the order at confirmation."""
    return {
        "version": policy.version,
        **{field: getattr(policy, field) for field in POLICY_VALUE_FIELDS},
        "business_date": today.isoformat(),
        "business_time_zone": settings.BUSINESS_TIME_ZONE,
        "eligibility_safeguards": ELIGIBILITY_SAFEGUARDS,
    }


def _block(code, category, message, **extra):
    return {"code": code, "category": category, "message": message, **extra}


def assess_confirmation(order, customer, lines, policy, *, actor, today=None):
    """Pure function over already-loaded objects (no queries, no writes).
    `lines` must carry `.product` with `.sales_uom` loaded. Returns
    {"policy": {...}, "blocking_reasons": [...], "informational_observations": [...]}.
    """
    today = today or business_today()
    blocking = []
    info = []

    if order.status != order.Status.DRAFT:
        blocking.append(
            _block("ORDER_NOT_DRAFT", CATEGORY_ELIGIBILITY, f"The order is {order.status} and cannot be confirmed.")
        )

    status = policy_status(policy)
    if status != "CONFIGURED":
        blocking.append(
            _block(
                "CONFIRMATION_POLICY_NOT_CONFIGURED" if status == "NOT_CONFIGURED" else "CONFIRMATION_POLICY_INCOMPLETE",
                CATEGORY_POLICY_NOT_CONFIGURED,
                POLICY_NOT_CONFIGURED_MESSAGE,
            )
        )

    # -- technical eligibility safeguards ------------------------------
    if not lines:
        blocking.append(_block("EMPTY_ORDER", CATEGORY_ELIGIBILITY, "The order has no lines."))
    if not customer.is_active:
        blocking.append(
            _block("INACTIVE_CUSTOMER", CATEGORY_ELIGIBILITY, f"Customer '{customer.code}' is inactive.")
        )
    try:
        _normalize_currency(order.currency)
    except DjangoValidationError:
        blocking.append(_block("INVALID_CURRENCY", CATEGORY_ELIGIBILITY, "The order currency is not valid."))

    zero_price_lines = []
    for line in lines:
        product = line.product
        uom = product.sales_uom
        where = {"line_id": line.id, "line_number": line.line_number}
        if not product.is_active:
            blocking.append(
                _block("INACTIVE_PRODUCT", CATEGORY_ELIGIBILITY, f"Product '{line.product_code_snapshot}' is inactive.", **where)
            )
        if not uom.is_active:
            blocking.append(
                _block("INACTIVE_SALES_UOM", CATEGORY_ELIGIBILITY, f"Sales unit '{line.sales_uom_code_snapshot}' is inactive.", **where)
            )
        if line.quantity is None or line.quantity <= 0:
            blocking.append(_block("INVALID_QUANTITY", CATEGORY_ELIGIBILITY, "The quantity must be greater than zero.", **where))
        elif uom.dimension == UnitOfMeasure.Dimension.COUNT and line.quantity % 1 != 0:
            blocking.append(
                _block("INVALID_QUANTITY", CATEGORY_ELIGIBILITY, "A COUNT unit needs a whole-number quantity.", **where)
            )
        elif line.unit_price is None or line.unit_price < 0:
            blocking.append(_block("INVALID_MONETARY_VALUE", CATEGORY_ELIGIBILITY, "The unit price cannot be negative.", **where))
        else:
            try:
                consistent = _compute_line_amount(line.quantity, line.unit_price) == line.line_amount
            except DjangoValidationError:
                consistent = False
            if not consistent:
                blocking.append(
                    _block("INVALID_MONETARY_VALUE", CATEGORY_ELIGIBILITY, "The line amount is not consistent with quantity and unit price.", **where)
                )
        if line.unit_price == 0:
            zero_price_lines.append(where)
        if (
            product.code != line.product_code_snapshot
            or product.name != line.product_name_snapshot
            or uom.code != line.sales_uom_code_snapshot
            or uom.name != line.sales_uom_name_snapshot
        ):
            info.append(
                {
                    "code": "MASTER_DATA_CHANGED_SINCE_SNAPSHOT",
                    "message": "The product or its sales unit was renamed after this line was captured. "
                    "The stored line values are kept; nothing is refreshed.",
                    **where,
                }
            )

    # -- explicit company policy rules (only when fully configured) -----
    past_date = order.requested_delivery_date is not None and order.requested_delivery_date < today
    self_confirm = actor is not None and actor.id == order.created_by_id
    if status == "CONFIGURED":
        if zero_price_lines:
            if policy.allow_zero_price_lines:
                info.append({"code": "ZERO_PRICE_LINES_ALLOWED_BY_POLICY", "message": "Zero-price lines are allowed by the company policy."})
            else:
                for where in zero_price_lines:
                    blocking.append(
                        _block("ZERO_PRICE_LINE", CATEGORY_POLICY_RULE, "Zero-price lines are not allowed by the company policy.", **where)
                    )
        if past_date:
            if policy.allow_past_requested_delivery_dates:
                info.append({"code": "PAST_DELIVERY_DATE_ALLOWED_BY_POLICY", "message": "A past requested delivery date is allowed by the company policy."})
            else:
                blocking.append(
                    _block(
                        "REQUESTED_DELIVERY_DATE_PAST",
                        CATEGORY_POLICY_RULE,
                        f"The requested delivery date ({order.requested_delivery_date.isoformat()}) is before today "
                        f"({today.isoformat()}, business date) and the company policy does not allow that.",
                    )
                )
        if self_confirm and not policy.allow_self_confirmation:
            blocking.append(
                _block(
                    "SELF_CONFIRMATION_NOT_ALLOWED",
                    CATEGORY_POLICY_RULE,
                    "The company policy does not allow the person who created an order to confirm it.",
                )
            )

    return {
        "policy": policy_summary(policy),
        "blocking_reasons": blocking,
        "informational_observations": info,
    }
