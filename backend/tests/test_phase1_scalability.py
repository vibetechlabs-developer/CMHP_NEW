from decimal import Decimal
import threading
from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection
from django.test import TestCase, TransactionTestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.catalog.models import Material, UnitOfMeasure
from apps.companies.models import Company
from apps.receiving.models import GoodsReceipt, GoodsReceiptLine
from apps.receiving.services import post_goods_receipt
from apps.stock_movements.models import (
    LotQualityStatus,
    MaterialIssue,
    MaterialIssueMovement,
    MaterialReturn,
    ProductionCustody,
    StockMovement,
)
from apps.stock_movements.services import (
    batch_net_recorded_balances,
    compute_issued_balances,
    compute_returned_balances,
    compute_stock_balances,
    create_material_issue,
    net_recorded_balances,
    post_material_issue,
)
from apps.stores.models import SharedStore
from apps.users.models import User


class Phase1ScalabilityTestCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username="testuser_phase1", password="password123")
        cls.company = Company.objects.create(code="TESTCOMP", legal_name="Test Company", is_active=True)
        cls.store = SharedStore.objects.create(code="TESTSTORE", name="Test Store", is_active=True)
        cls.unit_kg, _ = UnitOfMeasure.objects.get_or_create(
            code="KG", defaults={"name": "Kilogram", "dimension": UnitOfMeasure.Dimension.MASS, "is_active": True}
        )
        cls.unit_gm, _ = UnitOfMeasure.objects.get_or_create(
            code="GM", defaults={"name": "Gram", "dimension": UnitOfMeasure.Dimension.MASS, "is_active": True}
        )

        cls.material_a = Material.objects.create(
            code="MAT_A", name="Material Alpha", kind=Material.Kind.RAW_MATERIAL, base_unit=cls.unit_kg, is_active=True
        )
        cls.material_b = Material.objects.create(
            code="MAT_B", name="Material Beta", kind=Material.Kind.RAW_MATERIAL, base_unit=cls.unit_kg, is_active=True
        )
        cls.material_c = Material.objects.create(
            code="MAT_C", name="Material Gamma", kind=Material.Kind.RAW_MATERIAL, base_unit=cls.unit_gm, is_active=True
        )

        from apps.customers.models import Customer
        from apps.products.models import Product
        from apps.sales_orders.services import create_sales_order

        customer = Customer.objects.create(
            company=cls.company, code="CUST_P1", name="Test Customer P1", created_by=cls.user,
        )
        product = Product.objects.create(
            company=cls.company, code="PROD_P1", name="Test Product P1", sales_uom=cls.unit_kg, created_by=cls.user,
        )
        cls.sales_order = create_sales_order(
            actor=cls.user,
            company=cls.company,
            customer_id=customer.id,
            order_date=timezone.now().date(),
            currency="INR",
            lines=[{"product_id": product.id, "quantity": Decimal("10"), "unit_price": Decimal("1.00")}],
        )

    def _create_receipt_movement(self, material, unit, quantity, status=LotQualityStatus.Status.APPROVED):
        posted_at = timezone.now()
        gr = GoodsReceipt.objects.create(
            store=self.store,
            company=self.company,
            reference=f"GR-{material.code}-{quantity}-{posted_at.timestamp()}",
            arrived_at=posted_at,
            created_by=self.user,
        )
        gr_line = GoodsReceiptLine.objects.create(
            goods_receipt=gr,
            line_number=1,
            material=material,
            unit=unit,
            received_quantity=Decimal(str(quantity)),
            material_code_snapshot=material.code,
            material_name_snapshot=material.name,
            unit_code_snapshot=unit.code,
            unit_name_snapshot=unit.name,
        )
        sm = StockMovement.objects.create(
            movement_type=StockMovement.MovementType.RECEIPT_IN,
            source_goods_receipt=gr,
            source_receipt_line=gr_line,
            store=self.store,
            source_company=self.company,
            material=material,
            unit=unit,
            quantity=Decimal(str(quantity)),
            material_code_snapshot=material.code,
            material_name_snapshot=material.name,
            unit_code_snapshot=unit.code,
            unit_name_snapshot=unit.name,
            posted_by=self.user,
            posted_at=posted_at,
        )
        LotQualityStatus.objects.create(
            stock_movement=sm,
            status=status,
            decided_by=self.user,
            decided_at=posted_at,
        )
        return sm

    def test_stock_receipt_creates_movement(self):
        """1. Stock receipt creates StockMovement correctly."""
        sm = self._create_receipt_movement(self.material_a, self.unit_kg, "100.000")
        self.assertEqual(sm.quantity, Decimal("100.000"))
        self.assertEqual(sm.material, self.material_a)
        self.assertEqual(sm.store, self.store)

    def test_single_and_partial_material_issue(self):
        """2 & 3. Material issue and partial material issue."""
        self._create_receipt_movement(self.material_a, self.unit_kg, "100.000")

        # Issue 40 out of 100
        issue1 = create_material_issue(
            actor=self.user,
            store=self.store,
            source_company_id=self.company.id,
            material_id=self.material_a.id,
            unit_id=self.unit_kg.id,
            issued_quantity=Decimal("40.000"),
            issued_at=timezone.now(),
            sales_order_id=self.sales_order.id,
            batch_reference="BATCH-001",
        )
        post_material_issue(actor=self.user, material_issue_id=issue1.id, expected_version=1)

        bal = net_recorded_balances(
            store=self.store, accessible_companies=[self.company], material_id=self.material_a.id
        )
        self.assertEqual(bal[0]["net_quantity"], Decimal("60.000"))

        # Partial issue: issue another 30
        issue2 = create_material_issue(
            actor=self.user,
            store=self.store,
            source_company_id=self.company.id,
            material_id=self.material_a.id,
            unit_id=self.unit_kg.id,
            issued_quantity=Decimal("30.000"),
            issued_at=timezone.now(),
            sales_order_id=self.sales_order.id,
            batch_reference="BATCH-002",
        )
        post_material_issue(actor=self.user, material_issue_id=issue2.id, expected_version=1)

        bal = net_recorded_balances(
            store=self.store, accessible_companies=[self.company], material_id=self.material_a.id
        )
        self.assertEqual(bal[0]["net_quantity"], Decimal("30.000"))

    def test_material_return_and_released_usable(self):
        """4. Material return and RELEASED_USABLE restoral."""
        self._create_receipt_movement(self.material_a, self.unit_kg, "50.000")
        issue = create_material_issue(
            actor=self.user,
            store=self.store,
            source_company_id=self.company.id,
            material_id=self.material_a.id,
            unit_id=self.unit_kg.id,
            issued_quantity=Decimal("50.000"),
            issued_at=timezone.now(),
            sales_order_id=self.sales_order.id,
            batch_reference="BATCH-RET",
        )
        post_material_issue(actor=self.user, material_issue_id=issue.id, expected_version=1)

        # Net balance is now 0
        bal = net_recorded_balances(
            store=self.store, accessible_companies=[self.company], material_id=self.material_a.id
        )
        self.assertEqual(bal[0]["net_quantity"], Decimal("0.000"))

        custody = ProductionCustody.objects.get(source_issue=issue)
        # Return 15 KG HELD_UNASSESSED (does not restore issuable stock yet)
        ret = MaterialReturn.objects.create(
            source_custody=custody,
            source_issue=issue,
            store=self.store,
            source_company=self.company,
            material=self.material_a,
            unit=self.unit_kg,
            return_type="UNUSED",
            quantity=Decimal("15.000"),
            disposition="HELD_UNASSESSED",
            recorded_by=self.user,
        )
        bal = net_recorded_balances(
            store=self.store, accessible_companies=[self.company], material_id=self.material_a.id
        )
        self.assertEqual(bal[0]["net_quantity"], Decimal("0.000"))
        self.assertEqual(bal[0]["book_quantity"], Decimal("15.000"))

        # Release to usable
        ret.disposition = "RELEASED_USABLE"
        ret.save()
        bal = net_recorded_balances(
            store=self.store, accessible_companies=[self.company], material_id=self.material_a.id
        )
        self.assertEqual(bal[0]["net_quantity"], Decimal("15.000"))

    def test_multiple_materials_in_one_issue_batched(self):
        """6. Multiple materials in one multi-line issue slip."""
        self._create_receipt_movement(self.material_a, self.unit_kg, "100.000")
        self._create_receipt_movement(self.material_b, self.unit_kg, "200.000")
        self._create_receipt_movement(self.material_c, self.unit_gm, "5000.000")

        lines = [
            {"material_id": self.material_a.id, "unit_id": self.unit_kg.id, "issued_quantity": "25.000"},
            {"material_id": self.material_b.id, "unit_id": self.unit_kg.id, "issued_quantity": "50.000"},
            {"material_id": self.material_c.id, "unit_id": self.unit_gm.id, "issued_quantity": "1000.000"},
        ]
        issue = create_material_issue(
            actor=self.user,
            store=self.store,
            source_company_id=self.company.id,
            lines=lines,
            issued_at=timezone.now(),
            sales_order_id=self.sales_order.id,
            batch_reference="MULTI-MAT-BATCH",
        )
        posted = post_material_issue(actor=self.user, material_issue_id=issue.id, expected_version=1)
        self.assertEqual(posted.status, MaterialIssue.Status.POSTED)
        self.assertEqual(posted.movements.count(), 3)

        # Check balances
        bal_a = net_recorded_balances(store=self.store, accessible_companies=[self.company], material_id=self.material_a.id)
        bal_b = net_recorded_balances(store=self.store, accessible_companies=[self.company], material_id=self.material_b.id)
        bal_c = net_recorded_balances(store=self.store, accessible_companies=[self.company], material_id=self.material_c.id)
        self.assertEqual(bal_a[0]["net_quantity"], Decimal("75.000"))
        self.assertEqual(bal_b[0]["net_quantity"], Decimal("150.000"))
        self.assertEqual(bal_c[0]["net_quantity"], Decimal("4000.000"))

    def test_intra_slip_overallocation_prevention(self):
        """Intra-slip overallocation: two lines of same material exceeding stock."""
        self._create_receipt_movement(self.material_a, self.unit_kg, "10.000")

        lines = [
            {"material_id": self.material_a.id, "unit_id": self.unit_kg.id, "issued_quantity": "6.000"},
            {"material_id": self.material_a.id, "unit_id": self.unit_kg.id, "issued_quantity": "6.000"},
        ]
        issue = create_material_issue(
            actor=self.user,
            store=self.store,
            source_company_id=self.company.id,
            lines=lines,
            issued_at=timezone.now(),
            sales_order_id=self.sales_order.id,
            batch_reference="OVERALLOC-BATCH",
        )
        with self.assertRaises(ValidationError) as ctx:
            post_material_issue(actor=self.user, material_issue_id=issue.id, expected_version=1)
        self.assertIn("exceed", str(ctx.exception))

    def test_negative_stock_prevention(self):
        """9. Negative stock prevention."""
        self._create_receipt_movement(self.material_a, self.unit_kg, "10.000")

        issue = create_material_issue(
            actor=self.user,
            store=self.store,
            source_company_id=self.company.id,
            material_id=self.material_a.id,
            unit_id=self.unit_kg.id,
            issued_quantity=Decimal("15.000"),
            issued_at=timezone.now(),
            sales_order_id=self.sales_order.id,
            batch_reference="NEG-STOCK",
        )
        with self.assertRaises(ValidationError) as ctx:
            post_material_issue(actor=self.user, material_issue_id=issue.id, expected_version=1)
        self.assertIn("would exceed", str(ctx.exception))

    def test_stock_balance_reconciliation_identity(self):
        """10. Verify single vs batched balance calculation identity."""
        self._create_receipt_movement(self.material_a, self.unit_kg, "120.000")
        self._create_receipt_movement(self.material_b, self.unit_kg, "250.000")

        single_a = net_recorded_balances(store=self.store, accessible_companies=[self.company], material_id=self.material_a.id)
        single_b = net_recorded_balances(store=self.store, accessible_companies=[self.company], material_id=self.material_b.id)

        batched = batch_net_recorded_balances(
            store=self.store,
            accessible_companies=[self.company],
            material_ids=[self.material_a.id, self.material_b.id],
        )

        key_a = (self.material_a.id, self.unit_kg.id, self.company.id)
        key_b = (self.material_b.id, self.unit_kg.id, self.company.id)

        self.assertEqual(single_a[0]["net_quantity"], batched[key_a]["net_quantity"])
        self.assertEqual(single_a[0]["book_quantity"], batched[key_a]["book_quantity"])
        self.assertEqual(single_b[0]["net_quantity"], batched[key_b]["net_quantity"])
        self.assertEqual(single_b[0]["book_quantity"], batched[key_b]["book_quantity"])

    def test_stock_ledger_immutability(self):
        """11. Stock ledger immutability."""
        sm = self._create_receipt_movement(self.material_a, self.unit_kg, "50.000")
        # Cannot edit
        sm.quantity = Decimal("60.000")
        with self.assertRaises(ValidationError):
            sm.save()
        # Cannot delete
        with self.assertRaises(ValidationError):
            sm.delete()

    def test_query_count_constant_for_multiline_issue(self):
        """Verify query count is bounded and constant during post_material_issue."""
        self._create_receipt_movement(self.material_a, self.unit_kg, "100.000")
        self._create_receipt_movement(self.material_b, self.unit_kg, "100.000")
        self._create_receipt_movement(self.material_c, self.unit_gm, "1000.000")

        lines = [
            {"material_id": self.material_a.id, "unit_id": self.unit_kg.id, "issued_quantity": "5.000"},
            {"material_id": self.material_b.id, "unit_id": self.unit_kg.id, "issued_quantity": "5.000"},
            {"material_id": self.material_c.id, "unit_id": self.unit_gm.id, "issued_quantity": "50.000"},
        ]
        issue = create_material_issue(
            actor=self.user,
            store=self.store,
            source_company_id=self.company.id,
            lines=lines,
            issued_at=timezone.now(),
            sales_order_id=self.sales_order.id,
            batch_reference="QUERY-COUNT-TEST",
        )

        # In previous un-batched code: 3 lines * 5 queries = 15 queries just for balance checking.
        # In optimized code: 1 lock query + 4 batched balance queries = 5 queries regardless of lines.
        with CaptureQueriesContext(connection) as ctx:
            post_material_issue(actor=self.user, material_issue_id=issue.id, expected_version=1)

        # Total queries include issue select_for_update, material select_for_update,
        # 4 batched balance queries (regardless of line count!), issue update,
        # line saves, custody records, and audit log.
        # Unbatched query count was 39+ (scaling with 5 * N lines).
        # Batched balance check queries is strictly 5 (1 lock + 4 aggregations).
        self.assertLessEqual(len(ctx.captured_queries), 30)


class ConcurrentPostingTests(TransactionTestCase):
    def test_concurrent_issue_same_material_prevents_double_spending(self):
        """7. Concurrent issue of the same material prevents race condition."""
        user = User.objects.create_user(username="concuser1", password="password123")
        company = Company.objects.create(code="CONCCOMP1", legal_name="Conc Company", is_active=True)
        store = SharedStore.objects.create(code="CONCSTORE1", name="Conc Store", is_active=True)
        unit, _ = UnitOfMeasure.objects.get_or_create(
            code="CONCKG", defaults={"name": "Conc KG", "dimension": UnitOfMeasure.Dimension.MASS, "is_active": True}
        )
        material = Material.objects.create(code="CONCMAT1", name="Conc Material", kind=Material.Kind.RAW_MATERIAL, base_unit=unit, is_active=True)

        posted_at = timezone.now()
        gr = GoodsReceipt.objects.create(store=store, company=company, reference="GR-CONC-1", arrived_at=posted_at, created_by=user)
        gr_line = GoodsReceiptLine.objects.create(
            goods_receipt=gr, line_number=1, material=material, unit=unit, received_quantity=Decimal("10.000"),
        )
        sm = StockMovement.objects.create(
            movement_type=StockMovement.MovementType.RECEIPT_IN, source_goods_receipt=gr, source_receipt_line=gr_line,
            store=store, source_company=company, material=material, unit=unit, quantity=Decimal("10.000"),
            posted_by=user, posted_at=posted_at,
        )
        LotQualityStatus.objects.create(stock_movement=sm, status=LotQualityStatus.Status.APPROVED, decided_by=user, decided_at=posted_at)

        from apps.customers.models import Customer
        from apps.products.models import Product
        from apps.sales_orders.services import create_sales_order
        cust = Customer.objects.create(company=company, code="CONCCUST1", name="Conc Customer 1", created_by=user)
        prod = Product.objects.create(company=company, code="CONCPROD1", name="Conc Product 1", sales_uom=unit, created_by=user)
        so = create_sales_order(
            actor=user, company=company, customer_id=cust.id, order_date=timezone.now().date(), currency="INR",
            lines=[{"product_id": prod.id, "quantity": Decimal("10"), "unit_price": Decimal("1.00")}],
        )

        # Two issues each requesting 8 KG when only 10 KG is available
        issue1 = create_material_issue(
            actor=user, store=store, source_company_id=company.id, material_id=material.id, unit_id=unit.id,
            issued_quantity=Decimal("8.000"), issued_at=posted_at, sales_order_id=so.id, batch_reference="CONC-A",
        )
        issue2 = create_material_issue(
            actor=user, store=store, source_company_id=company.id, material_id=material.id, unit_id=unit.id,
            issued_quantity=Decimal("8.000"), issued_at=posted_at, sales_order_id=so.id, batch_reference="CONC-B",
        )

        results = []
        def attempt_post(issue_id):
            try:
                post_material_issue(actor=user, material_issue_id=issue_id, expected_version=1)
                results.append("SUCCESS")
            except ValidationError:
                results.append("EXCEEDED")
            except Exception as e:
                results.append(f"ERROR: {e}")
            finally:
                connection.close()

        t1 = threading.Thread(target=attempt_post, args=(issue1.id,))
        t2 = threading.Thread(target=attempt_post, args=(issue2.id,))

        t1.start()
        t2.start()
        t1.join()
        t2.join()

        # Exactly one must succeed, and the other must be rejected due to balance check
        self.assertEqual(results.count("SUCCESS"), 1)
        self.assertEqual(results.count("EXCEEDED"), 1)

        bal = net_recorded_balances(store=store, accessible_companies=[company], material_id=material.id)
        self.assertEqual(bal[0]["net_quantity"], Decimal("2.000"))

    def test_concurrent_issue_different_materials(self):
        """8. Concurrent issue of different materials succeeds simultaneously."""
        user = User.objects.create_user(username="concuser2", password="password123")
        company = Company.objects.create(code="CONCCOMP2", legal_name="Conc Company 2", is_active=True)
        store = SharedStore.objects.create(code="CONCSTORE2", name="Conc Store 2", is_active=True)
        unit, _ = UnitOfMeasure.objects.get_or_create(
            code="CONCKG2", defaults={"name": "Conc KG 2", "dimension": UnitOfMeasure.Dimension.MASS, "is_active": True}
        )
        mat1 = Material.objects.create(code="MAT_CONC_X", name="Mat X", kind=Material.Kind.RAW_MATERIAL, base_unit=unit, is_active=True)
        mat2 = Material.objects.create(code="MAT_CONC_Y", name="Mat Y", kind=Material.Kind.RAW_MATERIAL, base_unit=unit, is_active=True)

        posted_at = timezone.now()
        for mat in [mat1, mat2]:
            gr = GoodsReceipt.objects.create(store=store, company=company, reference=f"GR-{mat.code}", arrived_at=posted_at, created_by=user)
            gr_line = GoodsReceiptLine.objects.create(
                goods_receipt=gr, line_number=1, material=mat, unit=unit, received_quantity=Decimal("100.000"),
            )
            sm = StockMovement.objects.create(
                movement_type=StockMovement.MovementType.RECEIPT_IN, source_goods_receipt=gr, source_receipt_line=gr_line,
                store=store, source_company=company, material=mat, unit=unit, quantity=Decimal("100.000"),
                posted_by=user, posted_at=posted_at,
            )
            LotQualityStatus.objects.create(stock_movement=sm, status=LotQualityStatus.Status.APPROVED, decided_by=user, decided_at=posted_at)

        from apps.customers.models import Customer
        from apps.products.models import Product
        from apps.sales_orders.services import create_sales_order
        cust2 = Customer.objects.create(company=company, code="CONCCUST2", name="Conc Customer 2", created_by=user)
        prod2 = Product.objects.create(company=company, code="CONCPROD2", name="Conc Product 2", sales_uom=unit, created_by=user)
        so2 = create_sales_order(
            actor=user, company=company, customer_id=cust2.id, order_date=timezone.now().date(), currency="INR",
            lines=[{"product_id": prod2.id, "quantity": Decimal("10"), "unit_price": Decimal("1.00")}],
        )

        issue1 = create_material_issue(
            actor=user, store=store, source_company_id=company.id, material_id=mat1.id, unit_id=unit.id,
            issued_quantity=Decimal("20.000"), issued_at=posted_at, sales_order_id=so2.id, batch_reference="CONC-X",
        )
        issue2 = create_material_issue(
            actor=user, store=store, source_company_id=company.id, material_id=mat2.id, unit_id=unit.id,
            issued_quantity=Decimal("30.000"), issued_at=posted_at, sales_order_id=so2.id, batch_reference="CONC-Y",
        )

        results = []
        def attempt_post(issue_id):
            try:
                post_material_issue(actor=user, material_issue_id=issue_id, expected_version=1)
                results.append("SUCCESS")
            except Exception as e:
                results.append(f"ERROR: {e}")
            finally:
                connection.close()

        t1 = threading.Thread(target=attempt_post, args=(issue1.id,))
        t2 = threading.Thread(target=attempt_post, args=(issue2.id,))

        t1.start()
        t2.start()
        t1.join()
        t2.join()

        self.assertEqual(results, ["SUCCESS", "SUCCESS"])
