import os
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.contrib.auth import get_user_model

from apps.companies.models import Company
from apps.customers.models import Customer
from apps.catalog.models import Material, UnitOfMeasure
from apps.products.models import Product
from apps.formulas.models import Formula, FormulaRevision, FormulaLine
from apps.sales_orders.models import SalesOrder, SalesOrderLine
from apps.bmr.models import ProductionOrderStatus

User = get_user_model()

DEMO_CONFIGS = [
    {
        "type": "Drops",
        "norm_type": "drops",
        "product_name": "CURE RENOL",
        "product_code": "HML/05",
        "formula_code": "HML/05-F1",
        "batch_no": "DR-2601",
        "order_ref": "SO-20261027-B097546E20",  # Reuse existing SO 19 if present
        "fallback_ref": "SO-DEMO-DROPS-01",
        "batch_size_str": "1000 LTR",
        "qty": Decimal("1000.000"),
        "uom_code": "BTL",
        "uom_name": "Bottle",
        "has_bmr": True,
        "rm_lines": [
            ("RM-001", "BERBERIS VULGERIS Q", Decimal("0.090"), "L", "10%V/V"),
            ("SP", "SARSAPARILLA", Decimal("0.090"), "L", "10%V/V"),
            ("OC", "OCIMUM CANUM", Decimal("0.090"), "L", "10%V/V"),
            ("SV", "SOLIDAGO VIRGAUREA", Decimal("0.090"), "L", "10%V/V"),
            ("PB", "PAREIRA BRAVA", Decimal("0.090"), "L", "10%V/V"),
            ("QM", "SENECIO AUREUS", Decimal("0.090"), "L", "10%V/V"),
            ("EP", "EXCIPIENTS", Decimal("1.000"), "L", "Q.S."),
            ("AC", "ALCOHOL CONTENT", Decimal("1.000"), "L", "45%V/V"),
        ],
        "pm_lines": [
            ("PM-001", "Label", Decimal("1000.000"), "PCS"),
            ("PM-002", "Mono Box", Decimal("1000.000"), "PCS"),
            ("PM-003", "Insert", Decimal("1000.000"), "PCS"),
            ("PM-004", "Hall Mark", Decimal("1000.000"), "PCS"),
            ("PM-005", "Bottle", Decimal("1000.000"), "PCS"),
            ("PM-006", "Plug", Decimal("1000.000"), "PCS"),
            ("PM-007", "Cap", Decimal("1000.000"), "PCS"),
            ("PM-008", "Inner", Decimal("1000.000"), "PCS"),
            ("PM-009", "Outer", Decimal("1000.000"), "PCS"),
            ("PM-010", "Measuring Cap", Decimal("1000.000"), "PCS"),
            ("PM-011", "Droper", Decimal("1000.000"), "PCS"),
        ],
    },
    {
        "type": "Syrup",
        "norm_type": "syrup",
        "product_name": "Demo Cough Syrup",
        "product_code": "TST/003",
        "formula_code": "TST/003-F1",
        "batch_no": "SY-2601",
        "order_ref": "SO-DEMO-SYRUP-01",
        "fallback_ref": "SO-DEMO-SYRUP-01",
        "batch_size_str": "1000 LTR",
        "qty": Decimal("1000.000"),
        "uom_code": "BTL",
        "uom_name": "Bottle",
        "has_bmr": True,
        "rm_lines": [
            ("RM-DXM", "Dextromethorphan HBr", Decimal("10.000"), "KG", "10 mg/5ml"),
            ("RM-CPM", "Chlorpheniramine Maleate", Decimal("2.000"), "KG", "2 mg/5ml"),
            ("RM-PHE", "Phenylephrine HCl", Decimal("5.000"), "KG", "5 mg/5ml"),
            ("RM-SYRB", "Flavoured Syrup Base", Decimal("1000.000"), "L", "Q.S."),
        ],
        "pm_lines": [
            ("PM-BTL-100", "Bottle 100ml PET", Decimal("1000.000"), "PCS"),
            ("PM-CAP-MEAS", "Measuring Cap 10ml", Decimal("1000.000"), "PCS"),
            ("PM-LBL-SYR", "Label Syrup 100ml", Decimal("1000.000"), "PCS"),
            ("PM-BOX-SYR", "Mono Carton Syrup", Decimal("1000.000"), "PCS"),
        ],
    },
    {
        "type": "Mother Tincture",
        "norm_type": "mother-tincture",
        "product_name": "Calendula Officinalis Mother Tincture",
        "product_code": "TST/010",
        "formula_code": "MT-01-F1",
        "batch_no": "MT-2601",
        "order_ref": "SO-DEMO-MT-01",
        "fallback_ref": "SO-DEMO-MT-01",
        "batch_size_str": "500 LTR",
        "qty": Decimal("500.000"),
        "uom_code": "BTL",
        "uom_name": "Bottle",
        "has_bmr": True,
        "rm_lines": [
            ("RM-CAL", "Calendula Officinalis Herb", Decimal("100.000"), "KG", "100% Extract"),
            ("RM-ALC", "Strong Alcohol IP", Decimal("500.000"), "L", "60% V/V"),
            ("RM-PW", "Purified Water", Decimal("400.000"), "L", "Q.S."),
        ],
        "pm_lines": [
            ("PM-BTL-30", "Amber Glass Bottle 30ml", Decimal("1000.000"), "PCS"),
            ("PM-DRP-ASS", "Dropper Assembly", Decimal("1000.000"), "PCS"),
            ("PM-LBL-MT", "Label Mother Tincture 30ml", Decimal("1000.000"), "PCS"),
            ("PM-BOX-MT", "Mono Carton MT 30ml", Decimal("1000.000"), "PCS"),
        ],
    },
    {
        "type": "Tablet",
        "norm_type": "tablet",
        "product_name": "Flexicare",
        "product_code": "GER/06",
        "formula_code": "GER/06-F1",
        "batch_no": "TB-2601",
        "order_ref": "SO-DEMO-TAB-01",
        "fallback_ref": "SO-DEMO-TAB-01",
        "batch_size_str": "100000 TAB",
        "qty": Decimal("1000.000"),
        "uom_code": "BOX",
        "uom_name": "Box",
        "has_bmr": True,
        "rm_lines": [
            ("SH", "SULPHUR", Decimal("10.000"), "KG", "6X"),
            ("AM", "APIS -MELLIFICA", Decimal("60.000"), "KG", "3X"),
            ("GR", "GRAPHITES", Decimal("36.000"), "KG", "3X"),
            ("RM-LAC", "Lactose Monohydrate", Decimal("200.000"), "KG", "Q.S."),
        ],
        "pm_lines": [
            ("PM-BLIST", "Blister Foil Aluminium", Decimal("1000.000"), "PCS"),
            ("PM-PVC", "PVC Blister Film", Decimal("1000.000"), "PCS"),
            ("PM-BOX-TAB", "Outer Carton Flexicare", Decimal("1000.000"), "PCS"),
        ],
    },
    {
        "type": "Oil",
        "norm_type": "oil",
        "product_name": "Herbal Joint Massage Oil",
        "product_code": "TST/009",
        "formula_code": "OIL-01-F1",
        "batch_no": "OL-2601",
        "order_ref": "SO-DEMO-OIL-01",
        "fallback_ref": "SO-DEMO-OIL-01",
        "batch_size_str": "500 LTR",
        "qty": Decimal("500.000"),
        "uom_code": "BTL",
        "uom_name": "Bottle",
        "has_bmr": True,
        "rm_lines": [
            ("RM-GAN", "Gandhapura Taila (Wintergreen)", Decimal("50.000"), "L", "10% V/V"),
            ("RM-MAH", "Mahanarayan Taila", Decimal("100.000"), "L", "20% V/V"),
            ("RM-CAM", "Camphor (Karpura)", Decimal("20.000"), "KG", "5% W/V"),
            ("RM-SES", "Tila Taila (Sesame Oil Base)", Decimal("500.000"), "L", "Q.S."),
        ],
        "pm_lines": [
            ("PM-BTL-OIL", "Bottle 100ml Round Amber", Decimal("1000.000"), "PCS"),
            ("PM-CAP-FLIP", "Flip Top Cap 24mm", Decimal("1000.000"), "PCS"),
            ("PM-LBL-OIL", "Self Adhesive Label 100ml", Decimal("1000.000"), "PCS"),
            ("PM-BOX-OIL", "Mono Carton Oil 100ml", Decimal("1000.000"), "PCS"),
        ],
    },
    {
        "type": "Kits",
        "norm_type": "kits",
        "product_name": "First Aid Diagnostic Kit",
        "product_code": "KIT-001",
        "formula_code": "KIT-001-F1",
        "batch_no": "KT-2601",
        "order_ref": "SO-DEMO-KIT-01",
        "fallback_ref": "SO-DEMO-KIT-01",
        "batch_size_str": "500 KITS",
        "qty": Decimal("500.000"),
        "uom_code": "BOX",
        "uom_name": "Box",
        "has_bmr": False,
        "rm_lines": [
            ("RM-REA", "Diagnostic Test Reagents", Decimal("5.000"), "L", "Active Assay"),
            ("RM-BUF", "Extraction Buffer Solution", Decimal("20.000"), "L", "Buffer Base"),
        ],
        "pm_lines": [
            ("PM-CAS", "Test Cassette Housing", Decimal("500.000"), "PCS"),
            ("PM-SWB", "Sterile Nasal Swabs", Decimal("500.000"), "PCS"),
            ("PM-BOX-KIT", "Rigid Outer Kit Box", Decimal("500.000"), "PCS"),
            ("PM-LEAF-KIT", "Instruction For Use (IFU)", Decimal("500.000"), "PCS"),
        ],
    },
    {
        "type": "Pills",
        "norm_type": "pills",
        "product_name": "Demo Arnica Montana Pills 30C",
        "product_code": "PIL-001",
        "formula_code": "PIL-001-F1",
        "batch_no": "PL-2601",
        "order_ref": "SO-DEMO-PIL-01",
        "fallback_ref": "SO-DEMO-PIL-01",
        "batch_size_str": "100 KG",
        "qty": Decimal("500.000"),
        "uom_code": "BTL",
        "uom_name": "Bottle",
        "has_bmr": False,
        "rm_lines": [
            ("RM-ARN", "Arnica Montana 30C Dilution", Decimal("2.000"), "L", "30C Potency"),
            ("RM-GLO", "Cane Sugar Globules No. 30", Decimal("100.000"), "KG", "Q.S."),
        ],
        "pm_lines": [
            ("PM-VIAL-15", "Glass Vial 15 Gram", Decimal("500.000"), "PCS"),
            ("PM-PLUG-15", "Inner Dropper Plug", Decimal("500.000"), "PCS"),
            ("PM-CAP-PIL", "Screw Cap White", Decimal("500.000"), "PCS"),
            ("PM-LBL-PIL", "Printed Vial Label", Decimal("500.000"), "PCS"),
        ],
    },
    {
        "type": "Liquid",
        "norm_type": "liquid",
        "product_name": "Demo Antiseptic Liquid IP",
        "product_code": "LIQ-001",
        "formula_code": "LIQ-001-F1",
        "batch_no": "LQ-2601",
        "order_ref": "SO-DEMO-LIQ-01",
        "fallback_ref": "SO-DEMO-LIQ-01",
        "batch_size_str": "1000 LTR",
        "qty": Decimal("1000.000"),
        "uom_code": "BTL",
        "uom_name": "Bottle",
        "has_bmr": False,
        "rm_lines": [
            ("RM-PCMX", "Chloroxylenol IP", Decimal("48.000"), "KG", "4.8% W/V"),
            ("RM-TERP", "Terpineol BP", Decimal("90.000"), "KG", "9.0% V/V"),
            ("RM-ETOH", "Denatured Alcohol IP", Decimal("300.000"), "L", "Q.S."),
        ],
        "pm_lines": [
            ("PM-BTL-LIQ", "PET Bottle 250ml Clear", Decimal("1000.000"), "PCS"),
            ("PM-CAP-ROPP", "Measuring Dispensing Cap", Decimal("1000.000"), "PCS"),
            ("PM-LBL-LIQ", "Waterproof Front/Back Label", Decimal("1000.000"), "PCS"),
        ],
    },
    {
        "type": "Capsule",
        "norm_type": "capsule",
        "product_name": "Demo Omeprazole Capsules 20mg",
        "product_code": "CAP-001",
        "formula_code": "CAP-001-F1",
        "batch_no": "CP-2601",
        "order_ref": "SO-DEMO-CAP-01",
        "fallback_ref": "SO-DEMO-CAP-01",
        "batch_size_str": "100000 CAP",
        "qty": Decimal("1000.000"),
        "uom_code": "BOX",
        "uom_name": "Box",
        "has_bmr": False,
        "rm_lines": [
            ("RM-OMP", "Omeprazole Enteric Coated Pellets 8.5%", Decimal("235.000"), "KG", "20mg/cap"),
            ("RM-GEL", "Empty Hard Gelatin Capsules Size 2", Decimal("1000.000"), "PCS", "Shell"),
        ],
        "pm_lines": [
            ("PM-FOIL-ALU", "Alu-Alu Cold Form Foil", Decimal("500.000"), "KG"),
            ("PM-BOX-CAP", "Mono Carton Omeprazole 10x10", Decimal("1000.000"), "PCS"),
            ("PM-INS-CAP", "Patient Information Leaflet", Decimal("1000.000"), "PCS"),
        ],
    },
]

class Command(BaseCommand):
    help = "Seeds exactly one demo order for every product type (all 9 types) idempotently."

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Seeding demo orders for all 9 product types..."))

        company = Company.objects.filter(id=2).first()
        if not company:
            company = Company.objects.first()

        customer = Customer.objects.filter(company=company).first()
        if not customer:
            customer = Customer.objects.first()

        admin_user = User.objects.filter(is_superuser=True).first() or User.objects.first()

        # Cache UnitsOfMeasure
        uoms = {u.code.upper(): u for u in UnitOfMeasure.objects.all()}

        def get_uom(code):
            c = code.upper()
            if c in uoms:
                return uoms[c]
            # Fallback
            return UnitOfMeasure.objects.first()

        def ensure_material(code, name, kind, unit_code):
            mat, _ = Material.objects.get_or_create(
                code=code,
                defaults={
                    "name": name,
                    "kind": kind,
                    "base_unit": get_uom(unit_code),
                },
            )
            return mat

        summary_results = []

        with transaction.atomic():
            for cfg in DEMO_CONFIGS:
                p_type = cfg["type"]
                p_code = cfg["product_code"]
                p_name = cfg["product_name"]

                # 1. Product
                prod = Product.objects.filter(company=company, product_type__iexact=p_type).first()
                if not prod:
                    prod = Product.objects.filter(company=company, code=p_code).first()
                if not prod:
                    prod = Product.objects.create(
                        company=company,
                        code=p_code,
                        name=p_name,
                        product_type=p_type,
                        sales_uom=get_uom(cfg["uom_code"]),
                        created_by=admin_user,
                    )
                    self.stdout.write(f"Created Product: [{p_type}] {prod.name} ({prod.code})")
                else:
                    self.stdout.write(f"Reusing existing Product: [{p_type}] {prod.name} ({prod.code})")

                # 2. Formula & Revision
                formula, _ = Formula.objects.get_or_create(
                    company=company,
                    product=prod,
                    defaults={
                        "code": cfg["formula_code"],
                        "name": f"{prod.name} Formula",
                        "created_by": admin_user,
                    },
                )
                revision, _ = FormulaRevision.objects.get_or_create(
                    formula=formula,
                    revision_number=1,
                    defaults={
                        "status": "DRAFT",
                        "base_output_quantity": Decimal("1000.000"),
                        "output_uom": get_uom(cfg["uom_code"]),
                        "version": 1,
                        "created_by": admin_user,
                    },
                )
                FormulaRevision.objects.filter(pk=revision.pk).update(status="DRAFT")
                revision.refresh_from_db()

                # 3. Formula Lines (RM & PM)
                line_no = 1
                for rm in cfg["rm_lines"]:
                    m_code, m_name, m_qty, m_uom, m_claim = rm
                    mat = ensure_material(m_code, m_name, "RAW_MATERIAL", m_uom)
                    FormulaLine.objects.update_or_create(
                        revision=revision,
                        line_number=line_no,
                        defaults={
                            "material": mat,
                            "quantity": m_qty,
                            "unit": get_uom(m_uom),
                            "label_claim": m_claim,
                            "calculation_mode": "AS_PER_FORMULA",
                            "material_code_snapshot": m_code,
                            "material_name_snapshot": m_name,
                            "material_kind_snapshot": "RAW_MATERIAL",
                            "unit_code_snapshot": m_uom,
                            "unit_name_snapshot": get_uom(m_uom).name if get_uom(m_uom) else m_uom,
                        },
                    )
                    line_no += 1

                for pm in cfg["pm_lines"]:
                    m_code, m_name, m_qty, m_uom = pm
                    mat = ensure_material(m_code, m_name, "PACKAGING_MATERIAL", m_uom)
                    FormulaLine.objects.update_or_create(
                        revision=revision,
                        line_number=line_no,
                        defaults={
                            "material": mat,
                            "quantity": m_qty,
                            "unit": get_uom(m_uom),
                            "label_claim": "—",
                            "calculation_mode": "AS_PER_FORMULA",
                            "material_code_snapshot": m_code,
                            "material_name_snapshot": m_name,
                            "material_kind_snapshot": "PACKAGING_MATERIAL",
                            "unit_code_snapshot": m_uom,
                            "unit_name_snapshot": get_uom(m_uom).name if get_uom(m_uom) else m_uom,
                        },
                    )
                    line_no += 1

                FormulaRevision.objects.filter(pk=revision.pk).update(status="APPROVED")
                revision.refresh_from_db()

                # 4. Sales Order & SalesOrderLine
                # Try finding existing order for this product
                existing_so = SalesOrder.objects.filter(
                    company=company,
                    lines__product=prod,
                ).first()

                if not existing_so:
                    # Check by reference
                    existing_so = SalesOrder.objects.filter(
                        company=company,
                        reference=cfg.get("order_ref"),
                    ).first()

                if not existing_so:
                    so = SalesOrder.objects.create(
                        company=company,
                        reference=cfg["fallback_ref"],
                        customer=customer,
                        order_date=timezone.now().date(),
                        currency="INR",
                        status="CONFIRMED",
                        confirmed_by=admin_user,
                        confirmed_at=timezone.now(),
                        version=1,
                        created_by=admin_user,
                    )
                    SalesOrderLine.objects.create(
                        sales_order=so,
                        line_number=1,
                        product=prod,
                        quantity=cfg["qty"],
                        unit_price=Decimal("120.00"),
                        line_amount=Decimal("60000.00"),
                        description=f"Order line for {prod.name}",
                        product_name_snapshot=prod.name,
                        product_code_snapshot=prod.code,
                        product_type_snapshot=p_type,
                        sales_uom_name_snapshot=cfg["uom_name"],
                        sales_uom_code_snapshot=cfg["uom_code"],
                    )
                    self.stdout.write(f"Created SalesOrder {so.id} ({so.reference}) for {prod.name}")
                else:
                    so = existing_so
                    self.stdout.write(f"Reusing SalesOrder {so.id} ({so.reference}) for {prod.name}")

                # 5. ProductionOrderStatus
                batch_no = cfg["batch_no"]
                pos, created = ProductionOrderStatus.objects.update_or_create(
                    company=company,
                    order_id=str(so.id),
                    defaults={
                        "order_reference": so.reference,
                        "batch_no": batch_no,
                        "bmr_status": "YES" if cfg["has_bmr"] else "NO",
                        "production_status": "Completed",
                        "packaging_status": "Completed",
                        "dispatch_status": "YES",
                        "qa_status": "Approved",
                        "dispatched_at": timezone.now(),
                    },
                )
                self.stdout.write(f"Synced ProductionOrderStatus for SO {so.id}: Batch={batch_no}, Dispatch=YES")

                summary_results.append({
                    "product_type": p_type,
                    "product_name": prod.name,
                    "product_code": prod.code,
                    "batch_no": batch_no,
                    "order_no": so.reference,
                    "order_id": so.id,
                    "has_bmr": cfg["has_bmr"],
                })

        self.stdout.write(self.style.SUCCESS("\nSuccessfully seeded demo orders for all 9 product types!"))
        for s in summary_results:
            self.stdout.write(f" - {s['product_type']:<16} | {s['product_name']:<35} | {s['product_code']:<10} | Batch: {s['batch_no']:<10} | SO: {s['order_no']} (ID: {s['order_id']})")
