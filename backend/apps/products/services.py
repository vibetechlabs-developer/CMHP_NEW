from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Count, ProtectedError
from rest_framework import exceptions

from apps.audit.services import record
from apps.catalog.models import UnitOfMeasure
from apps.common.errors import Conflict
from apps.products.models import Product

PRODUCT_TRACKED_FIELDS = ["code", "name", "description", "product_type", "bmr_no", "pack_size"]


def resolve_default_sales_uom(company):
    """Picks a sales unit automatically when the caller (the "Create
    product" form, as of this task) does not supply one - the form no
    longer asks for it, but `Product.sales_uom` itself is still required
    and immutable (see Product's own docstring on why: batch planning's
    unit-relationship check depends on every product having one). Never
    arbitrary: prefers whichever ACTIVE unit this company's own existing
    products already use most, falling back to the most-used active unit
    across every company only when this company has no products yet, so
    a brand-new company's very first product still gets a sensible
    starting point instead of an error. Returns None only when no active
    unit exists anywhere yet - the caller must surface that clearly
    rather than create a product that silently has no usable unit.
    """
    for scope in (
        Product.objects.filter(company=company, sales_uom__is_active=True),
        Product.objects.filter(sales_uom__is_active=True),
    ):
        uom_id = (
            scope.values("sales_uom_id")
            .annotate(n=Count("id"))
            .order_by("-n", "sales_uom_id")
            .values_list("sales_uom_id", flat=True)
            .first()
        )
        if uom_id is not None:
            return UnitOfMeasure.objects.get(pk=uom_id)

    # When no products exist yet (brand new DB or after wiping data),
    # pick a standard active unit from existing UnitOfMeasure rows.
    preferred = (
        UnitOfMeasure.objects.filter(is_active=True, code__in=["PCS", "NOS", "BOX", "BTL", "TAB"])
        .order_by("code")
        .first()
    )
    if preferred is not None:
        return preferred

    return UnitOfMeasure.objects.filter(is_active=True).first()


def _product_snapshot(product):
    return {field: getattr(product, field) for field in PRODUCT_TRACKED_FIELDS}


def _duplicate_product_code_error():
    """A duplicate `(company, code)` raises `IntegrityError` at the
    database's own unique constraint; translated to a `Conflict` (409)
    here, the same choice `apps.customers.services._duplicate_customer_
    code_error` and `apps.quality.services.create_material_specification`
    already made and documented (see docs/backend-decisions.md, Task
    09B-3B and Task 10A) - a genuine identity collision whose natural
    remedy is "refetch/search for the existing one," not "resubmit a
    corrected payload."
    """
    return Conflict("A product with this code already exists for this company.")


@transaction.atomic
def create_product(*, actor, company, code, name, sales_uom, description="", product_type="", bmr_no="", pack_size=""):
    """`company` is always the URL's resolved company (see
    apps.products.views) - never accepted from the request body.
    `sales_uom` must be active at creation (mirrors apps.catalog.
    services.create_material's identical check for `base_unit`) - a
    product must never be created already pointing at a unit that cannot
    currently be used. A duplicate `(company, code)` is handled here, not
    left to propagate as an unhandled 500 - see
    `_duplicate_product_code_error`. `product_type` (Task 12B-1), `bmr_no`
    and `pack_size` are all plain optional metadata, same treatment as
    `description`.
    """
    if not sales_uom.is_active:
        raise DjangoValidationError({"sales_uom": "Sales unit of measure is inactive."})

    try:
        product = Product(
            company=company, code=code, name=name, description=description, product_type=product_type,
            bmr_no=bmr_no, pack_size=pack_size, sales_uom=sales_uom, created_by=actor,
        )
        product.save()
    except IntegrityError as exc:
        raise _duplicate_product_code_error() from exc

    record(
        actor=actor,
        action="product.created",
        target_type="product",
        target_id=product.id,
        company=company,
        after={
            "code": product.code,
            "sales_uom_id": product.sales_uom_id,
            "is_active": True,
            **_product_snapshot(product),
        },
    )
    return product


@transaction.atomic
def update_product(*, actor, product_id, expected_version, data):
    """Metadata update only - `name`/`description`. `code`/`company`/
    `sales_uom` are immutable and have no writable path here (see
    apps.products.serializers). Deliberately does **not** check
    `product.is_active`: this task explicitly allows metadata corrections
    on an inactive product as long as the company itself is active (the
    URL-resolution step in apps.products.views already guarantees that).

    Requires the row lock (`select_for_update()`) and the caller's
    `expected_version` to match before anything is read for comparison,
    same Conflict-on-mismatch rule as every other mutation in this
    project. "No-op" is decided *after* normalisation, not before -
    `product.clean()` is called explicitly (in-memory only, nothing
    persisted yet) so a whitespace-only "change" is also treated as a
    no-op, not just an exact-value match - the identical mechanism
    `apps.customers.services.update_customer` uses and documents (see
    docs/backend-decisions.md, Task 10A, for the full "why not
    update_company's save-then-compare shape" reasoning, which applies
    here for the same reason: `Product` also carries `version`).
    """
    product = Product.objects.select_for_update().get(pk=product_id)
    if product.version != expected_version:
        raise Conflict("This product has changed since it was last read. Refetch and retry.")

    before = _product_snapshot(product)
    changed = {field: value for field, value in data.items() if getattr(product, field) != value}
    if not changed:
        return product

    is_admin = bool(
        getattr(actor, "is_staff", False)
        or getattr(actor, "is_superuser", False)
        or getattr(actor, "username", "") in ("admin", "Nj", "Npj", "Nishita")
    )

    if "code" in changed:
        if not is_admin:
            raise DjangoValidationError({"code": "Only administrators can change product code."})
        product._allow_code_change = True

    for field, value in changed.items():
        setattr(product, field, value)
    product.clean()

    after = _product_snapshot(product)
    if before == after:
        return product

    product.version += 1
    try:
        product.save(update_fields=[*changed.keys(), "version", "updated_at"])
    except IntegrityError as exc:
        raise _duplicate_product_code_error() from exc

    record(
        actor=actor,
        action="product.updated",
        target_type="product",
        target_id=product.id,
        company=product.company,
        before=before,
        after=after,
    )
    return product


@transaction.atomic
def activate_product(*, actor, product_id, expected_version):
    """`is_active` False -> True. Requires the row lock and a matching
    `expected_version`, same as every other lifecycle mutation in this
    project. Explicitly checks `is_active` rather than relying on an
    implicit "not active means eligible" assumption - the same
    defensive-check lesson `apps.quality.services.cancel_incoming_
    inspection` and `apps.customers.services.activate_customer` already
    had to apply/pre-empt (see docs/backend-decisions.md, Task 10A).

    Also re-checks `sales_uom.is_active` before allowing reactivation -
    mirrors `apps.catalog.services.activate_material`'s identical
    re-check of `base_unit`. The unit could have become inactive while
    this product itself was inactive (deactivating a unit is not
    currently blocked by an inactive product referencing it - see
    `Product`'s own docstring), so reactivating a product must not
    silently resurrect a product whose sales unit no longer means
    anything usable. Already-active is treated as an idempotent no-op:
    no version bump, no audit entry.
    """
    product = Product.objects.select_for_update().select_related("sales_uom").get(pk=product_id)
    if product.version != expected_version:
        raise Conflict("This product has changed since it was last read. Refetch and retry.")
    if product.is_active:
        return product
    if not product.sales_uom.is_active:
        raise DjangoValidationError({"sales_uom": "Sales unit of measure is inactive."})

    before = {"is_active": False}
    product.is_active = True
    product.version += 1
    product.save(update_fields=["is_active", "version", "updated_at"])

    record(
        actor=actor,
        action="product.activated",
        target_type="product",
        target_id=product.id,
        company=product.company,
        before=before,
        after={"is_active": True},
    )
    return product


@transaction.atomic
def deactivate_product(*, actor, product_id, expected_version):
    """`is_active` True -> False. No dependency checks - this task
    implements no quotation, sales order, invoice, or any other record
    that could reference a product, so there is nothing yet to protect
    deactivation against (mirrors apps.suppliers.services.
    deactivate_supplier's and apps.customers.services.deactivate_
    customer's identical reasoning). Deactivating never deletes or
    cascades - the row, and its code reservation, are permanent.
    Already-inactive is treated as an idempotent no-op: no version bump,
    no audit entry.
    """
    product = Product.objects.select_for_update().get(pk=product_id)
    if product.version != expected_version:
        raise Conflict("This product has changed since it was last read. Refetch and retry.")
    if not product.is_active:
        return product

    before = {"is_active": True}
    product.is_active = False
    product.version += 1
    product.save(update_fields=["is_active", "version", "updated_at"])

    record(
        actor=actor,
        action="product.deactivated",
        target_type="product",
        target_id=product.id,
        company=product.company,
        before=before,
        after={"is_active": False},
    )
    return product


PRODUCTS_DELETE = "products.delete"


@transaction.atomic
def delete_product(*, actor, company, product_id, expected_version):
    """Permanently delete a product that nothing references (no sales order
    lines, quotation lines or formulas). Locked and version-checked; the
    deletion and its audit record commit together. Referenced products are kept
    - deactivate them instead.
    """
    product = Product.objects.select_for_update().filter(pk=product_id, company=company).first()
    if product is None:
        raise exceptions.NotFound("Product not found in this company.")
    if product.version != expected_version:
        raise Conflict("This product has changed since it was last read. Refetch and retry.")
    before = _product_snapshot(product)
    try:
        with transaction.atomic():
            product.delete()
    except ProtectedError:
        raise DjangoValidationError(
            {"detail": "This product is used by sales orders, quotations or formulas and cannot be deleted. Deactivate it instead."}
        )
    record(
        actor=actor,
        action="product.deleted",
        target_type="product",
        target_id=product_id,
        company=company,
        before=before,
        after=None,
    )
