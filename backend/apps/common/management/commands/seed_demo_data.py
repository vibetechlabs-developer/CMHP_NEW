import json
import secrets
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.catalog.models import Material, MaterialCategory, UnitOfMeasure
from apps.companies.models import Company
from apps.customers.models import Customer
from apps.formulas.approval import approve_formula_revision, update_approval_policy
from apps.formulas.models import Formula, FormulaApprovalPolicy, FormulaRevision
from apps.formulas.services import create_formula, update_formula_revision
from apps.permissions.models import CompanyRole, StoreRole
from apps.permissions.services import (
    create_company_role,
    create_store_role,
    replace_role_permissions,
    replace_store_role_permissions,
)
from apps.products.models import Product
from apps.stores.models import SharedStore
from apps.stores.services import assign_store_membership, assign_store_membership_role
from apps.suppliers.models import Supplier
from apps.users.services import assign_company_membership, assign_membership_role

User = get_user_model()

# Every demo record is namespaced under this prefix/marker so it can
# never be confused with a real business record, and so a second run
# can tell "this is my own prior demo row" apart from "a real,
# unrelated row that happens to share this code" (see
# _get_or_create_checked below).
DEMO_MARKER = "(Synthetic demo data - Task 09B-1)"
# Task 11B additions (commercial + formula drafting demo) carry their own
# marker so they are distinguishable from the earlier procurement demo rows.
DEMO_MARKER_11B = "(Synthetic demo data - Task 11B)"
# Task 13E additions (connected planning demo: sales order -> approved
# formula -> batch plan -> batch number -> store preparation -> material
# requisition draft) carry their own marker for the same reason.
DEMO_MARKER_13E = "(Synthetic demo data - Task 13E)"
DEMO_EMAIL_DOMAIN = "demo.invalid"

COMPANY_A_CODE = "DEMOA"
COMPANY_B_CODE = "DEMOB"
STORE_CODE = "DEMOWH"
UNIT_CODE = "DEMOKG"
CATEGORY_CODE = "DEMOCAT"
MATERIAL_CODE = "DEMOMAT1"
SUPPLIER_CODE = "DEMOSUP"
BOTTLE_UNIT_CODE = "DEMOBTL"
PACKAGING_MATERIAL_CODE = "DEMOPACK1"
CUSTOMER_A_CODE = "DEMOCUST1"
CUSTOMER_B_CODE = "DEMOCUSTB"
PRODUCT_COUNT_CODE = "DEMOPROD1"
PRODUCT_MASS_CODE = "DEMOPROD2"

# Task 13E: two NEW mass units carrying an explicit `canonical_factor`
# (Task 12B-2's packing-conversion mechanism). The existing `DEMOKG` unit
# was created with `canonical_factor=None` before this task existed, and
# that field is immutable once a unit row is first saved (see
# `apps.catalog.models.UnitOfMeasure.clean()`) - it can never be given one
# retroactively. These are therefore new, separate units, not a change to
# `DEMOKG`; nothing about `DEMOKG`/`DEMOBTL` is touched by this task.
MASS_KG_UNIT_CODE = "DEMOMKG"
MASS_G_UNIT_CODE = "DEMOMG"
PACKING_FORMULA_CODE = "DEMOFPACK13E"

# Task 11B: ordinary-user demo personas. Company and store permissions are
# granted separately and explicitly; nothing here broadens application
# authorization - it only assigns existing permissions to demo users.
COMMERCIAL_PERMS = (
    "customers.view",
    "products.view",
    "quotations.view",
    "quotations.create",
    "quotations.edit",
    "sales_orders.view",
    "sales_orders.create",
    "sales_orders.edit",
)
FORMULA_COMPANY_PERMS = ("products.view", "formulas.view", "formulas.create", "formulas.edit", "formulas.submit")
# Material lookup (GET /api/v1/materials/) is a shared, store-permissioned
# catalog read - it needs shared_catalog.view through an active STORE
# membership, not any company permission.
CATALOG_LOOKUP_STORE_PERMS = ("shared_catalog.view",)

PURCHASE_REQUEST_PERMS_REQUESTER = (
    "purchase_requests.view",
    "purchase_requests.create",
    "purchase_requests.edit",
    "purchase_requests.submit",
    "purchase_requests.cancel",
)
PURCHASE_REQUEST_PERMS_APPROVER = ("purchase_requests.view", "purchase_requests.approve")
PURCHASE_ORDER_PERMS_BUYER = (
    "purchase_requests.view",
    "purchase_orders.view",
    "purchase_orders.create",
    "purchase_orders.edit",
    "purchase_orders.cancel",
    "purchase_orders.issue",
)
RECEIVING_PERMS = ("receiving.view", "receiving.create", "receiving.edit", "receiving.post", "receiving.cancel")
QC_PERMS = ("incoming_qc.view", "incoming_qc.create", "incoming_qc.edit", "incoming_qc.cancel")

# Task 13E: the connected planning demo's three personas. Company and store
# permissions are granted separately, exactly as every earlier persona in
# this command already does - nothing here is a superuser bypass, and no
# permission is granted beyond what that persona's own steps in
# docs/demo-runbook.md §4.4 actually exercise.
PLANNER_COMPANY_PERMS = (
    "customers.view",
    "products.view",
    "sales_orders.view",
    "sales_orders.create",
    "formulas.view",
    "batch_plans.view",
    "batch_plans.create",
    "batch_plans.allocate_number",
)
# A separate, non-contributing approver - required so the demo can disable
# self-approval (see FormulaApprovalPolicy below) and still reach an
# APPROVED revision without any superuser bypass or direct status edit.
FORMULA_APPROVER_COMPANY_PERMS = ("formulas.view", "formulas.approve")
# The store persona additionally needs `batch_plans.view` + `formulas.view`
# as COMPANY permissions - Task 13A's own documented dual-access rule for
# material requisitions (store access alone is never enough; see
# apps.material_requisitions.views._has_requisition_company_access).
STORE_PLANNER_STORE_PERMS = (
    "store_preparation.view",
    "store_preparation.create",
    "store_preparation.edit",
    "material_requisitions.view",
    "material_requisitions.create",
    "material_requisitions.edit",
)
STORE_PLANNER_COMPANY_PERMS = ("batch_plans.view", "formulas.view")


class Command(BaseCommand):
    help = (
        "DEVELOPMENT ONLY. Idempotently seeds a synthetic demo dataset - two "
        "companies, one shared store, one material/unit/category/supplier, "
        "and the requester/approver/buyer/receiving/QC demo users with the "
        "matching company/store memberships and permissions - so the full "
        "purchase-request -> approval -> purchase-order -> receiving -> QC-draft "
        "flow can be exercised over real HTTP against a local server. Every "
        "Task 11B extends this same command with synthetic customers/products/"
        "materials and ordinary commercial/formula demo users (company and store "
        "permissions kept separate; no application authorization is broadened). "
        "Every record is namespaced under a DEMO*/demo_ prefix. Refuses to run "
        "unless settings.DEBUG is True and --yes is passed; never touches an "
        "existing identity that does not already look like this command's "
        "own prior output."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--yes",
            action="store_true",
            help="Required confirmation flag - this command creates real database rows.",
        )
        parser.add_argument(
            "--actor-username",
            default=None,
            help=(
                "Username of an existing active superuser to record as the audit "
                "actor for every membership/role assignment this command makes. "
                "Defaults to the first active superuser found. This command never "
                "creates a superuser itself - run 'python manage.py createsuperuser' "
                "first if none exists."
            ),
        )
        parser.add_argument(
            "--credentials-file",
            default=None,
            help=(
                "Where to write newly-generated demo passwords (development-only, "
                "local file - never commit it). Defaults to "
                "<BASE_DIR>/.demo_credentials.local.json."
            ),
        )

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError(
                "Refusing to run: settings.DEBUG is False. This command is "
                "development-only and must never run against a production "
                "settings module (config.settings.production hardcodes DEBUG=False "
                "specifically so this kind of guard is reliable)."
            )
        if not options["yes"]:
            raise CommandError(
                "Refusing to run without --yes - this command writes real database "
                "rows. Re-run as: python manage.py seed_demo_data --yes"
            )

        actor = self._resolve_actor(options["actor_username"])

        with transaction.atomic():
            created_users, result = self._seed(actor)

        credentials_path = Path(options["credentials_file"] or (settings.BASE_DIR / ".demo_credentials.local.json"))
        if created_users:
            # Only ever written when there is something new to record - a
            # later idempotent no-op run (zero new users) must never
            # overwrite an earlier run's still-valid credentials file with
            # an empty one.
            self._write_credentials_file(credentials_path, created_users)
        self._print_summary(result, created_users, credentials_path)

    # -- helpers -----------------------------------------------------

    def _resolve_actor(self, requested_username):
        if requested_username:
            actor = User.objects.filter(username=requested_username, is_active=True, is_superuser=True).first()
            if actor is None:
                raise CommandError(f"No active superuser named '{requested_username}' exists.")
            return actor
        actor = User.objects.filter(is_active=True, is_superuser=True).order_by("id").first()
        if actor is None:
            raise CommandError(
                "No active superuser exists to act as the audit actor for demo setup. "
                "Run 'python manage.py createsuperuser' first, then re-run this command."
            )
        return actor

    def _get_or_create_checked(self, model, lookup, defaults, check_fields, label):
        """get_or_create, but a pre-existing row that does not match the
        exact fields this command would have created it with is treated
        as a genuine identity conflict (a real, unrelated record that
        happens to share this demo code/username) and stops the whole
        run - never silently reused or overwritten.
        """
        existing = model.objects.filter(**lookup).first()
        if existing is None:
            obj = model.objects.create(**lookup, **defaults)
            self._counts["created"] += 1
            return obj, True
        mismatches = [field for field in check_fields if getattr(existing, field) != defaults.get(field)]
        if mismatches:
            raise CommandError(
                f"{label} {lookup} already exists but does not match this command's own "
                f"expected demo shape (mismatched fields: {mismatches}). Refusing to "
                "reuse or overwrite it - this looks like a real, unrelated record."
            )
        self._counts["reused"] += 1
        return existing, False

    def _get_or_create_demo_user(self, username, first_name, last_name, created_users):
        email = f"{username}@{DEMO_EMAIL_DOMAIN}"
        existing = User.objects.filter(username=username).first()
        if existing is not None:
            if existing.email != email:
                raise CommandError(
                    f"User '{username}' already exists but its email ({existing.email!r}) does not "
                    f"match this command's own demo pattern ({email!r}). Refusing to reuse a real "
                    "account - this looks like a genuine identity conflict."
                )
            self._counts["reused"] += 1
            return existing
        password = secrets.token_urlsafe(18)
        user = User.objects.create_user(
            username=username, email=email, password=password, first_name=first_name, last_name=last_name
        )
        created_users[username] = password
        self._counts["created"] += 1
        return user

    def _get_or_create_company_role(self, actor, company, code, name, permission_codes):
        role = CompanyRole.objects.filter(company=company, code=code).first()
        if role is None:
            role = create_company_role(actor=actor, company=company, code=code, name=name)
        replace_role_permissions(actor=actor, role=role, permission_codes=list(permission_codes))
        return role

    def _get_or_create_store_role(self, actor, store, code, name, permission_codes):
        role = StoreRole.objects.filter(store=store, code=code).first()
        if role is None:
            role = create_store_role(actor=actor, store=store, code=code, name=name)
        replace_store_role_permissions(actor=actor, role=role, permission_codes=list(permission_codes))
        return role

    def _grant_company_role(self, actor, user, company, role_code, role_name, permission_codes):
        membership, _ = assign_company_membership(actor=actor, user=user, company=company)
        role = self._get_or_create_company_role(actor, company, role_code, role_name, permission_codes)
        assign_membership_role(actor=actor, membership=membership, role=role)

    def _grant_store_role(self, actor, user, store, role_code, role_name, permission_codes):
        membership, _ = assign_store_membership(actor=actor, user=user, store=store)
        role = self._get_or_create_store_role(actor, store, role_code, role_name, permission_codes)
        assign_store_membership_role(actor=actor, membership=membership, role=role)

    # -- main seed -----------------------------------------------------

    def _seed(self, actor):
        created_users = {}
        self._counts = {"created": 0, "reused": 0}

        company_a, _ = self._get_or_create_checked(
            Company,
            lookup={"code": COMPANY_A_CODE},
            defaults={"legal_name": f"Demo Pharma Company A {DEMO_MARKER}", "display_name": "Demo Company A"},
            check_fields=["legal_name", "display_name"],
            label="Company",
        )
        company_b, _ = self._get_or_create_checked(
            Company,
            lookup={"code": COMPANY_B_CODE},
            defaults={"legal_name": f"Demo Pharma Company B {DEMO_MARKER}", "display_name": "Demo Company B"},
            check_fields=["legal_name", "display_name"],
            label="Company",
        )
        store, _ = self._get_or_create_checked(
            SharedStore,
            lookup={"code": STORE_CODE},
            defaults={"name": "Demo Shared Warehouse", "description": DEMO_MARKER},
            check_fields=["name", "description"],
            label="SharedStore",
        )
        unit, _ = self._get_or_create_checked(
            UnitOfMeasure,
            lookup={"code": UNIT_CODE},
            defaults={"name": "Demo Kilogram", "dimension": "MASS"},
            check_fields=["name", "dimension"],
            label="UnitOfMeasure",
        )
        category, _ = self._get_or_create_checked(
            MaterialCategory,
            lookup={"code": CATEGORY_CODE},
            defaults={"name": "Demo Herbal Extracts", "description": DEMO_MARKER},
            check_fields=["name", "description"],
            label="MaterialCategory",
        )
        material, _ = self._get_or_create_checked(
            Material,
            lookup={"code": MATERIAL_CODE},
            defaults={
                "name": "Demo Herbal Extract Alpha",
                "description": DEMO_MARKER,
                "kind": "RAW_MATERIAL",
                "base_unit": unit,
                "category": category,
            },
            check_fields=["name", "description", "kind", "base_unit", "category"],
            label="Material",
        )
        supplier, _ = self._get_or_create_checked(
            Supplier,
            lookup={"code": SUPPLIER_CODE},
            defaults={"legal_name": f"Demo Supplier Co {DEMO_MARKER}", "contact_name": "Demo Contact"},
            check_fields=["legal_name", "contact_name"],
            label="Supplier",
        )

        bottle_unit, _ = self._get_or_create_checked(
            UnitOfMeasure,
            lookup={"code": BOTTLE_UNIT_CODE},
            defaults={"name": "Demo Bottle", "dimension": "COUNT"},
            check_fields=["name", "dimension"],
            label="UnitOfMeasure",
        )
        packaging_material, _ = self._get_or_create_checked(
            Material,
            lookup={"code": PACKAGING_MATERIAL_CODE},
            defaults={
                "name": "Demo Amber Bottle 200ml",
                "description": DEMO_MARKER_11B,
                "kind": "PACKAGING_MATERIAL",
                "base_unit": bottle_unit,
                "category": category,
            },
            check_fields=["name", "description", "kind", "base_unit", "category"],
            label="Material",
        )
        customer_a, _ = self._get_or_create_checked(
            Customer,
            lookup={"company": company_a, "code": CUSTOMER_A_CODE},
            defaults={"name": "Demo Customer One", "notes": DEMO_MARKER_11B, "created_by": actor},
            check_fields=["name", "notes"],
            label="Customer",
        )
        customer_b, _ = self._get_or_create_checked(
            Customer,
            lookup={"company": company_b, "code": CUSTOMER_B_CODE},
            defaults={"name": "Demo Customer B", "notes": DEMO_MARKER_11B, "created_by": actor},
            check_fields=["name", "notes"],
            label="Customer",
        )
        product_count, _ = self._get_or_create_checked(
            Product,
            lookup={"company": company_a, "code": PRODUCT_COUNT_CODE},
            defaults={
                "name": "Demo Herbal Tonic 200ml", "description": DEMO_MARKER_11B,
                "sales_uom": bottle_unit, "created_by": actor,
            },
            check_fields=["name", "description", "sales_uom"],
            label="Product",
        )
        product_mass, _ = self._get_or_create_checked(
            Product,
            lookup={"company": company_a, "code": PRODUCT_MASS_CODE},
            defaults={
                "name": "Demo Herbal Powder (bulk)", "description": DEMO_MARKER_11B,
                "sales_uom": unit, "created_by": actor,
            },
            check_fields=["name", "description", "sales_uom"],
            label="Product",
        )

        requester = self._get_or_create_demo_user("demo_requester", "Demo", "Requester", created_users)
        approvers = [
            self._get_or_create_demo_user(f"demo_approver{i}", "Demo", f"Approver{i}", created_users)
            for i in (1, 2, 3)
        ]
        buyer = self._get_or_create_demo_user("demo_buyer", "Demo", "Buyer", created_users)
        receiver = self._get_or_create_demo_user("demo_receiver", "Demo", "Receiver", created_users)
        qc_user = self._get_or_create_demo_user("demo_qc", "Demo", "QCInspector", created_users)
        company_b_user = self._get_or_create_demo_user(
            "demo_companyb_user", "Demo", "CompanyBOnly", created_users
        )
        sales_user = self._get_or_create_demo_user("demo_sales", "Demo", "SalesDrafter", created_users)
        formula_user = self._get_or_create_demo_user("demo_formula", "Demo", "FormulaDrafter", created_users)
        formula_nocatalog_user = self._get_or_create_demo_user(
            "demo_formula_nocatalog", "Demo", "FormulaNoCatalog", created_users
        )

        self._grant_company_role(
            actor, requester, company_a, "DEMO_REQUESTER", "Demo Requester", PURCHASE_REQUEST_PERMS_REQUESTER
        )
        for index, approver in enumerate(approvers, start=1):
            self._grant_company_role(
                actor, approver, company_a, f"DEMO_APPROVER{index}", f"Demo Approver {index}",
                PURCHASE_REQUEST_PERMS_APPROVER,
            )
        self._grant_company_role(actor, buyer, company_a, "DEMO_BUYER", "Demo Buyer", PURCHASE_ORDER_PERMS_BUYER)
        self._grant_company_role(
            actor, receiver, company_a, "DEMO_RECEIVER_CO", "Demo Receiver (company access)",
            ("purchase_orders.view",),
        )
        self._grant_store_role(actor, receiver, store, "DEMO_RECEIVER_ST", "Demo Receiver", RECEIVING_PERMS)
        # Deliberately no purchase_orders.view grant for the QC user - bare
        # company membership only, demonstrating that incoming QC access
        # never needs purchasing-price visibility (see
        # apps.quality.views._check_company_membership).
        self._grant_company_role(actor, qc_user, company_a, "DEMO_QC_CO", "Demo QC (company access)", ())
        self._grant_store_role(actor, qc_user, store, "DEMO_QC_ST", "Demo QC Inspector", QC_PERMS)
        # Company B membership only, no store access at all - an
        # access-separation demonstration account: proves a second
        # company sharing the same physical store cannot see the first
        # company's purchase requests, and that company membership alone
        # never grants store access.
        self._grant_company_role(
            actor, company_b_user, company_b, "DEMO_COMPANYB", "Demo Company B Member", ("purchase_requests.view",)
        )

        # Task 11B personas. The sales drafter gets COMPANY permissions only
        # (customers/products are company lookups; no store membership).
        # The formula drafter gets company permissions PLUS a separate STORE
        # membership carrying shared_catalog.view, which is what the shared
        # material lookup currently requires. The "nocatalog" twin has the
        # same company permissions but no store membership, to demonstrate
        # the documented lookup denial.
        self._grant_company_role(
            actor, sales_user, company_a, "DEMO_SALES_DRAFTER", "Demo Sales Drafter", COMMERCIAL_PERMS
        )
        self._grant_company_role(
            actor, formula_user, company_a, "DEMO_FORMULA_DRAFTER", "Demo Formula Drafter", FORMULA_COMPANY_PERMS
        )
        self._grant_store_role(
            actor, formula_user, store, "DEMO_CATALOG_LOOKUP", "Demo Catalog Lookup", CATALOG_LOOKUP_STORE_PERMS
        )
        self._grant_company_role(
            actor, formula_nocatalog_user, company_a, "DEMO_FORMULA_DRAFTER", "Demo Formula Drafter",
            FORMULA_COMPANY_PERMS,
        )

        # Task 13E: the connected planning demo's three personas (see
        # docs/demo-runbook.md §4.4). Company and store permissions are
        # granted separately, exactly like every persona above - nothing
        # here is a superuser bypass.
        planner_user = self._get_or_create_demo_user("demo_planner", "Demo", "Planner", created_users)
        formula_approver_user = self._get_or_create_demo_user(
            "demo_formula_approver", "Demo", "FormulaApprover", created_users
        )
        store_planner_user = self._get_or_create_demo_user(
            "demo_store_planner", "Demo", "StorePlanner", created_users
        )

        self._grant_company_role(
            actor, planner_user, company_a, "DEMO_PLANNER", "Demo Planner", PLANNER_COMPANY_PERMS
        )
        # A separate, non-contributing approver - never used to create or
        # edit any formula content, so it can never fail the "not a
        # contributor" self-approval check below.
        self._grant_company_role(
            actor, formula_approver_user, company_a, "DEMO_FORMULA_APPROVER", "Demo Formula Approver",
            FORMULA_APPROVER_COMPANY_PERMS,
        )
        self._grant_store_role(
            actor, store_planner_user, store, "DEMO_STORE_PLANNER", "Demo Store Planner", STORE_PLANNER_STORE_PERMS
        )
        self._grant_company_role(
            actor, store_planner_user, company_a, "DEMO_STORE_PLANNER_CO", "Demo Store Planner (company access)",
            STORE_PLANNER_COMPANY_PERMS,
        )

        # Task 13E: two NEW mass units with an explicit `canonical_factor`
        # (see the module-level comment on MASS_KG_UNIT_CODE for why
        # `DEMOKG` itself can never be given one).
        mass_kg_unit, _ = self._get_or_create_checked(
            UnitOfMeasure,
            lookup={"code": MASS_KG_UNIT_CODE},
            defaults={
                "name": "Demo Mass Kilogram (packing-conversion)", "dimension": "MASS",
                "canonical_factor": Decimal("1000"),
            },
            check_fields=["name", "dimension", "canonical_factor"],
            label="UnitOfMeasure",
        )
        self._get_or_create_checked(
            UnitOfMeasure,
            lookup={"code": MASS_G_UNIT_CODE},
            defaults={
                "name": "Demo Mass Gram (packing-conversion)", "dimension": "MASS",
                "canonical_factor": Decimal("1"),
            },
            check_fields=["name", "dimension", "canonical_factor"],
            label="UnitOfMeasure",
        )

        approved_revision = self._seed_approved_packing_formula(
            actor=actor,
            company=company_a,
            product=product_count,
            output_unit=mass_kg_unit,
            raw_material=material,
            packaging_material=packaging_material,
            planner=planner_user,
            approver=formula_approver_user,
        )

        result = {
            "counts": dict(self._counts),
            "company_a": company_a, "company_b": company_b, "store": store, "unit": unit,
            "category": category, "material": material, "supplier": supplier,
            "requester": requester, "approvers": approvers, "buyer": buyer, "receiver": receiver,
            "qc_user": qc_user, "company_b_user": company_b_user,
            "sales_user": sales_user, "formula_user": formula_user,
            "formula_nocatalog_user": formula_nocatalog_user,
            "customer_a": customer_a, "customer_b": customer_b,
            "product_count": product_count, "product_mass": product_mass,
            "packaging_material": packaging_material,
            "planner_user": planner_user, "formula_approver_user": formula_approver_user,
            "store_planner_user": store_planner_user,
            "mass_kg_unit": mass_kg_unit, "approved_packing_revision": approved_revision,
        }
        return created_users, result

    def _seed_approved_packing_formula(self, *, actor, company, product, output_unit, raw_material,
                                        packaging_material, planner, approver):
        """Task 13E: the ONE APPROVED formula revision the connected
        planning demo needs (the runbook's own §4.4 explicitly wants a
        real, already-approved revision to select - approval itself is
        not part of the junior's HTTP journey). Idempotent: a second run
        finds the same formula/revision already `APPROVED` and its policy
        already configured, and changes nothing.

        `planner` creates the formula and its two lines (becoming its only
        recorded contributor); `approver` never touches the content, so it
        can approve under a self-approval-disabled policy without any
        superuser bypass or direct status edit. Configuring
        `FormulaApprovalPolicy` for `company` requires an active superuser
        (`apps.formulas.views.ApprovalPolicyView`) - `actor` here is the
        SAME superuser this whole command already uses for every
        membership/role assignment, not a new one; `company` is always the
        existing synthetic DEMOA company, so this never touches a real
        client's approval policy.
        """
        formula = Formula.objects.filter(company=company, code=PACKING_FORMULA_CODE).first()
        if formula is None:
            formula = create_formula(
                actor=planner,
                company=company,
                product_id=product.id,
                code=PACKING_FORMULA_CODE,
                name=f"Demo Packing Formula {DEMO_MARKER_13E}",
                base_output_quantity=Decimal("76"),
                output_uom_id=output_unit.id,
            )
            revision = formula.revisions.get(revision_number=1)
            revision = update_formula_revision(
                actor=planner,
                revision_id=revision.id,
                expected_version=revision.version,
                data={
                    "lines": [
                        {
                            "material_id": raw_material.id,
                            "quantity": Decimal("15.200"),
                            "notes": "Demo raw material - arithmetic only, not a real formula",
                        },
                        {
                            "material_id": packaging_material.id,
                            "quantity": Decimal("3024"),
                            "notes": "Demo packaging - arithmetic only, not a real formula",
                        },
                    ]
                },
            )
            self._counts["created"] += 1
        else:
            revision = FormulaRevision.objects.get(formula=formula, revision_number=1)
            if revision.lines.count() != 2:
                raise CommandError(
                    f"Formula '{PACKING_FORMULA_CODE}' already exists but its revision 1 does not have the "
                    "2 lines this command's own prior run would have created. Refusing to reuse or overwrite it "
                    "- this looks like a real, unrelated formula."
                )
            self._counts["reused"] += 1

        policy = FormulaApprovalPolicy.objects.filter(company=company).first()
        if policy is None:
            update_approval_policy(
                actor=actor, company=company, expected_version=0, data={"allow_self_approval": False}
            )
            self._counts["created"] += 1
        elif policy.allow_self_approval is not False:
            raise CommandError(
                f"Company '{company.code}' already has a formula approval policy that does not match this "
                "command's own demo shape (allow_self_approval must be False for the Task 13E demo). Refusing to "
                "reuse or overwrite it - this looks like a real, unrelated policy decision."
            )
        else:
            self._counts["reused"] += 1

        revision.refresh_from_db()
        if revision.status != FormulaRevision.Status.APPROVED:
            revision = approve_formula_revision(
                actor=approver,
                company_id=company.id,
                formula_id=formula.id,
                revision_id=revision.id,
                expected_version=revision.version,
            )
            self._counts["created"] += 1
        else:
            self._counts["reused"] += 1
        return revision

    def _write_credentials_file(self, path, created_users):
        """MERGES into an existing file instead of replacing it: a run that
        creates only some new users (e.g. after this command gained new demo
        personas) must never discard the previously recorded passwords of
        users created by an earlier run, and must never overwrite an
        already-recorded entry. Only usernames not yet in the file are
        appended.
        """
        existing_users = []
        if path.exists():
            try:
                existing_users = list(json.loads(path.read_text(encoding="utf-8")).get("users", []))
            except (ValueError, OSError):
                raise CommandError(
                    f"Credentials file {path} exists but cannot be read as JSON; refusing to overwrite it. "
                    "Move it aside or fix it, then re-run."
                )
        recorded = {row.get("username") for row in existing_users}
        merged = existing_users + [
            {"username": username, "password": password}
            for username, password in created_users.items()
            if username not in recorded
        ]
        payload = {
            "generated_at": timezone.now().isoformat(),
            "note": (
                "DEVELOPMENT DEMO CREDENTIALS ONLY. Never commit this file (it is "
                "gitignored by name). Usernames not listed here already existed from "
                "a prior run - their password was not changed; use "
                "'python manage.py changepassword <username>' locally if you need a "
                "fresh one."
            ),
            "users": merged,
        }
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def _print_summary(self, result, created_users, credentials_path):
        self.stdout.write(self.style.SUCCESS("Demo data ready."))
        self.stdout.write(f"  Company A: {result['company_a'].code} (id={result['company_a'].id})")
        self.stdout.write(f"  Company B: {result['company_b'].code} (id={result['company_b'].id})")
        self.stdout.write(f"  Store:     {result['store'].code} (id={result['store'].id})")
        self.stdout.write(f"  Material:  {result['material'].code} (id={result['material'].id})")
        self.stdout.write(f"  Supplier:  {result['supplier'].code} (id={result['supplier'].id})")
        self.stdout.write("  Users: demo_requester, demo_approver1/2/3, demo_buyer, demo_receiver, "
                           "demo_qc, demo_companyb_user, demo_sales, demo_formula, demo_formula_nocatalog, "
                           "demo_planner, demo_formula_approver, demo_store_planner")
        self.stdout.write(
            f"  Customer:  {result['customer_a'].code}; products: {result['product_count'].code}, "
            f"{result['product_mass'].code}; packaging material: {result['packaging_material'].code}"
        )
        self.stdout.write(
            f"  Approved packing formula (Task 13E): revision id={result['approved_packing_revision'].id}, "
            f"status={result['approved_packing_revision'].status}, output unit={result['mass_kg_unit'].code}"
        )
        self.stdout.write(
            f"  Records this run - created: {result['counts']['created']}, reused: {result['counts']['reused']}"
        )
        if created_users:
            self.stdout.write(self.style.WARNING(
                f"  {len(created_users)} new user(s) created - passwords written to: {credentials_path}"
            ))
            self.stdout.write(self.style.WARNING("  Never commit that file. Treat it as a local secret."))
        else:
            self.stdout.write(
                "  No new users were created (all demo users already existed from a prior run). "
                f"The credentials file, if one exists from that earlier run, was left untouched: {credentials_path}"
            )
