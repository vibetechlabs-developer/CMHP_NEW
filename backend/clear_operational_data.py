import os
import django
from decimal import Decimal

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.local')
django.setup()

from django.db import transaction
from django.apps import apps

def clear_data():
    print("Beginning clear of operational and catalog data...")
    with transaction.atomic():
        # 1. BMR
        from apps.bmr.models import BMRLine, BatchManufacturingRecord
        c, _ = BMRLine.objects.all().delete()
        print(f"Cleared BMRLine: {c}")
        c, _ = BatchManufacturingRecord.objects.all().delete()
        print(f"Cleared BatchManufacturingRecord: {c}")

        # 2. Material Requisitions
        from apps.material_requisitions.models import (
            MaterialRequisitionRoundLine,
            MaterialRequisitionRound,
            MaterialRequisitionLine,
            MaterialRequisition,
        )
        c, _ = MaterialRequisitionRoundLine.objects.all().delete()
        print(f"Cleared MaterialRequisitionRoundLine: {c}")
        c, _ = MaterialRequisitionRound.objects.all().delete()
        print(f"Cleared MaterialRequisitionRound: {c}")
        c, _ = MaterialRequisitionLine.objects.all().delete()
        print(f"Cleared MaterialRequisitionLine: {c}")
        c, _ = MaterialRequisition.objects.all().delete()
        print(f"Cleared MaterialRequisition: {c}")

        # 3. Store Preparation
        from apps.store_preparation.models import StorePreparation
        c, _ = StorePreparation.objects.all().delete()
        print(f"Cleared StorePreparation: {c}")

        # 4. Batch Plans
        from apps.batch_plans.models import BatchPlan, BatchNumberAllocation, BatchNumberSequenceCounter
        c, _ = BatchNumberAllocation.objects.all().delete()
        print(f"Cleared BatchNumberAllocation: {c}")
        c, _ = BatchNumberSequenceCounter.objects.all().delete()
        print(f"Cleared BatchNumberSequenceCounter: {c}")
        c, _ = BatchPlan.objects.all().delete()
        print(f"Cleared BatchPlan: {c}")

        # 5. Stock Movements & Custody
        from apps.stock_movements.models import (
            MaterialIssueMovement,
            MaterialIssue,
            MaterialReturn,
            ProductionFloorEvent,
            ProductionCustody,
            StockMovement,
            PhysicalCountDraft,
            CutoverStockDraft,
        )
        c, _ = MaterialIssueMovement.objects.all().delete()
        print(f"Cleared MaterialIssueMovement: {c}")
        c, _ = MaterialIssue.objects.all().delete()
        print(f"Cleared MaterialIssue: {c}")
        c, _ = MaterialReturn.objects.all().delete()
        print(f"Cleared MaterialReturn: {c}")
        c, _ = ProductionFloorEvent.objects.all().delete()
        print(f"Cleared ProductionFloorEvent: {c}")
        c, _ = ProductionCustody.objects.all().delete()
        print(f"Cleared ProductionCustody: {c}")
        c, _ = StockMovement.objects.all().delete()
        print(f"Cleared StockMovement: {c}")
        c, _ = PhysicalCountDraft.objects.all().delete()
        print(f"Cleared PhysicalCountDraft: {c}")
        c, _ = CutoverStockDraft.objects.all().delete()
        print(f"Cleared CutoverStockDraft: {c}")

        # 6. Receiving
        from apps.receiving.models import GoodsReceiptLine, GoodsReceipt, ContainerType
        c, _ = GoodsReceiptLine.objects.all().delete()
        print(f"Cleared GoodsReceiptLine: {c}")
        c, _ = GoodsReceipt.objects.all().delete()
        print(f"Cleared GoodsReceipt: {c}")
        # Note: ContainerType is cleared after Material (it's referenced by Material FK)

        # 7. Purchasing
        from apps.purchasing.models import (
            PurchaseOrderIssueLineSnapshot,
            PurchaseOrderIssueSnapshot,
            PurchaseOrderLine,
            PurchaseOrder,
            PurchaseRequestApproval,
            PurchaseRequestApprovalRoundLine,
            PurchaseRequestApprovalRound,
            PurchaseRequestLine,
            PurchaseRequest,
        )
        c, _ = PurchaseOrderIssueLineSnapshot.objects.all().delete()
        print(f"Cleared PurchaseOrderIssueLineSnapshot: {c}")
        c, _ = PurchaseOrderIssueSnapshot.objects.all().delete()
        print(f"Cleared PurchaseOrderIssueSnapshot: {c}")
        c, _ = PurchaseOrderLine.objects.all().delete()
        print(f"Cleared PurchaseOrderLine: {c}")
        c, _ = PurchaseOrder.objects.all().delete()
        print(f"Cleared PurchaseOrder: {c}")
        c, _ = PurchaseRequestApproval.objects.all().delete()
        print(f"Cleared PurchaseRequestApproval: {c}")
        c, _ = PurchaseRequestApprovalRoundLine.objects.all().delete()
        print(f"Cleared PurchaseRequestApprovalRoundLine: {c}")
        c, _ = PurchaseRequestApprovalRound.objects.all().delete()
        print(f"Cleared PurchaseRequestApprovalRound: {c}")
        c, _ = PurchaseRequestLine.objects.all().delete()
        print(f"Cleared PurchaseRequestLine: {c}")
        c, _ = PurchaseRequest.objects.all().delete()
        print(f"Cleared PurchaseRequest: {c}")

        # 8. Sales Orders & Quotations
        from apps.sales_orders.models import SalesOrderLine, SalesOrderConfirmationPolicy, SalesOrder
        c, _ = SalesOrderLine.objects.all().delete()
        print(f"Cleared SalesOrderLine: {c}")
        c, _ = SalesOrderConfirmationPolicy.objects.all().delete()
        print(f"Cleared SalesOrderConfirmationPolicy: {c}")
        c, _ = SalesOrder.objects.all().delete()
        print(f"Cleared SalesOrder: {c}")

        try:
            from apps.quotations.models import QuotationLine, Quotation
            c, _ = QuotationLine.objects.all().delete()
            print(f"Cleared QuotationLine: {c}")
            c, _ = Quotation.objects.all().delete()
            print(f"Cleared Quotation: {c}")
        except Exception:
            pass

        # 9. Customers
        from apps.customers.models import Customer
        c, _ = Customer.objects.all().delete()
        print(f"Cleared Customer: {c}")

        # 10. Formulas
        from apps.formulas.models import (
            FormulaLine,
            FormulaRevisionContributor,
            FormulaApprovalPolicy,
            FormulaRevision,
            Formula,
        )
        c, _ = FormulaLine.objects.all().delete()
        print(f"Cleared FormulaLine: {c}")
        c, _ = FormulaRevisionContributor.objects.all().delete()
        print(f"Cleared FormulaRevisionContributor: {c}")
        c, _ = FormulaApprovalPolicy.objects.all().delete()
        print(f"Cleared FormulaApprovalPolicy: {c}")
        c, _ = FormulaRevision.objects.all().delete()
        print(f"Cleared FormulaRevision: {c}")
        c, _ = Formula.objects.all().delete()
        print(f"Cleared Formula: {c}")

        # 11. Products
        from apps.products.models import Product
        c, _ = Product.objects.all().delete()
        print(f"Cleared Product: {c}")

        # 12. Suppliers
        from apps.suppliers.models import Supplier
        c, _ = Supplier.objects.all().delete()
        print(f"Cleared Supplier: {c}")

        # 13. Catalog Materials & Categories
        from apps.catalog.models import MaterialReorderSetting, Material, MaterialCategory, ProductType, UnitOfMeasure
        from apps.receiving.models import ContainerType
        c, _ = MaterialReorderSetting.objects.all().delete()
        print(f"Cleared MaterialReorderSetting: {c}")
        c, _ = Material.objects.all().delete()
        print(f"Cleared Material: {c}")
        c, _ = ContainerType.objects.all().delete()
        print(f"Cleared ContainerType: {c}")
        c, _ = MaterialCategory.objects.all().delete()
        print(f"Cleared MaterialCategory: {c}")
        c, _ = ProductType.objects.all().delete()
        print(f"Cleared ProductType: {c}")

        # Clean demo units if any, but ensure standard UOMs exist
        standard_uoms = [
            ("KG", "Kilogram", UnitOfMeasure.Dimension.MASS, Decimal("1.0000000000")),
            ("GM", "Gram", UnitOfMeasure.Dimension.MASS, Decimal("0.0010000000")),
            ("MG", "Milligram", UnitOfMeasure.Dimension.MASS, Decimal("0.0000010000")),
            ("L", "Liter", UnitOfMeasure.Dimension.VOLUME, Decimal("1.0000000000")),
            ("ML", "Milliliter", UnitOfMeasure.Dimension.VOLUME, Decimal("0.0010000000")),
            ("PCS", "Pieces", UnitOfMeasure.Dimension.COUNT, None),
            ("TAB", "Tablets", UnitOfMeasure.Dimension.COUNT, None),
            ("CAP", "Capsules", UnitOfMeasure.Dimension.COUNT, None),
            ("BOX", "Box", UnitOfMeasure.Dimension.COUNT, None),
            ("BTL", "Bottle", UnitOfMeasure.Dimension.COUNT, None),
        ]
        for code, name, dim, factor in standard_uoms:
            uom, created = UnitOfMeasure.objects.get_or_create(
                code=code,
                defaults={"name": name, "dimension": dim, "canonical_factor": factor}
            )
            if created:
                print(f"Created standard UOM: {code} ({name})")

    print("\nOperational and catalog data cleared successfully!")
    print("Preserved: Users, Logins, Companies, Stores, Permissions, and standard Units of Measure.")

if __name__ == '__main__':
    clear_data()
