from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from apps.permissions.models import PermissionDefinition, StoreRole, StoreRoleAssignment
from apps.permissions.services import replace_store_role_permissions
from apps.stores.models import SharedStore, StoreMembership
from tests.test_stores import make_user, make_store_role, assign_store_role, access_token_for
from tests.test_production_custody import (
    ISSUE_ALL_PERMS,
    RECEIVING_ALL_PERMS,
    ProductionCustodyTestCase,
    bearer,
)


class StoreSummaryTests(TestCase):
    def setUp(self):
        self.client_ = APIClient()
        self.user = make_user("summary_user")
        self.store = SharedStore.objects.create(code="SUM_STORE", name="Summary Store")
        self.membership = StoreMembership.objects.create(store=self.store, user=self.user)
        self.view_perm, _ = PermissionDefinition.objects.get_or_create(
            code="shared_store.view",
            defaults={"name": "View Shared Store", "scope": PermissionDefinition.Scope.STORE},
        )
        self.role = make_store_role(self.store, "SUMMARY_VIEWER", permissions=[self.view_perm])
        assign_store_role(self.membership, self.role)

    def test_store_summary_200(self):
        url = f"/api/v1/stores/{self.store.id}/summary/"
        token = access_token_for(self.user)
        self.client_.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        response = self.client_.get(url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["store"]["id"], self.store.id)
        self.assertEqual(data["store"]["code"], self.store.code)
        self.assertIn("materials", data)
        self.assertIn("receipts", data)
        self.assertIn("issues", data)
        self.assertIn("requisitions", data)
        self.assertIn("ledger", data)
        self.assertIn("pending_work", data)
        self.assertIn("recent_activity", data)
        self.assertIn("features", data)
        self.assertEqual(data["features"]["low_stock"]["status"], "NOT_CONFIGURED")
        self.assertEqual(data["features"]["quality_disposition"]["status"], "UNAVAILABLE")
        self.assertIn("user_permissions", data)
        self.assertEqual(data["user_permissions"], ["shared_store.view"])
        self.assertEqual(data["business_time_zone"], "Asia/Kolkata")

    def test_store_summary_date_filtering(self):
        url = f"/api/v1/stores/{self.store.id}/summary/?date_from=2026-01-01&date_to=2026-01-31"
        token = access_token_for(self.user)
        self.client_.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        response = self.client_.get(url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["filter_period"]["date_from"], "2026-01-01")
        self.assertEqual(data["filter_period"]["date_to"], "2026-01-31")

    def test_store_summary_invalid_date_range(self):
        token = access_token_for(self.user)
        self.client_.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        # Invalid format
        res = self.client_.get(f"/api/v1/stores/{self.store.id}/summary/?date_from=bad-date")
        self.assertEqual(res.status_code, 400)

        # date_from after date_to
        res2 = self.client_.get(f"/api/v1/stores/{self.store.id}/summary/?date_from=2026-02-01&date_to=2026-01-01")
        self.assertEqual(res2.status_code, 400)

    def test_store_summary_permission_denied(self):
        unauthorized_user = make_user("no_perm_user")
        StoreMembership.objects.create(store=self.store, user=unauthorized_user)
        token = access_token_for(unauthorized_user)
        self.client_.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        response = self.client_.get(f"/api/v1/stores/{self.store.id}/summary/")
        self.assertEqual(response.status_code, 403)

    def test_store_summary_not_found(self):
        non_member_user = make_user("non_member")
        token = access_token_for(non_member_user)
        self.client_.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        response = self.client_.get(f"/api/v1/stores/{self.store.id}/summary/")
        self.assertEqual(response.status_code, 404)


class StoreSummaryLowStockTests(ProductionCustodyTestCase):
    """Exercises the real, end-to-end low-stock alert this task adds to
    StoreSummaryView: an admin-set MaterialReorderSetting (already
    existing, bookkeeping-only - see that model's own docstring) compared
    against the SAME authoritative receipt/issue balance the Material
    Register already computes, surfaced as a real `LOW_STOCK` alert
    instead of the stale "no reorder levels are captured" disclosure.
    """

    def setUp(self):
        super().setUp()
        # ProductionCustodyTestCase.setUp() already granted self.user a
        # store role (fixed code SROLE<user.id><store.id> - see
        # grant_store_permission) with ISSUE_ALL_PERMS/RECEIVING_ALL_PERMS/
        # stock.view. Extend that SAME role's permission set (replace_*
        # takes the complete set, not an add) rather than calling
        # grant_store_permission a second time, which would try to create
        # a second role under that same deterministic code and collide on
        # unique_store_role_code.
        PermissionDefinition.objects.get_or_create(
            code="shared_store.view",
            defaults={"name": "shared_store.view", "scope": PermissionDefinition.Scope.STORE},
        )
        PermissionDefinition.objects.get_or_create(
            code="materials.manage_reorder_level",
            defaults={"name": "materials.manage_reorder_level", "scope": PermissionDefinition.Scope.STORE},
        )
        existing_role = StoreRole.objects.get(store=self.store, code=f"SROLE{self.user.id}{self.store.id}")
        replace_store_role_permissions(
            actor=self.superuser,
            role=existing_role,
            permission_codes=[
                *ISSUE_ALL_PERMS, *RECEIVING_ALL_PERMS, "stock.view",
                "shared_store.view", "materials.manage_reorder_level",
            ],
        )

    def _set_reorder_level(self, level):
        res = self.client_.put(
            f"/api/v1/stores/{self.store.id}/materials/{self.material.id}/reorder-setting/",
            data={"reorder_level": str(level)},
            content_type="application/json",
            **bearer(self.token),
        )
        self.assertEqual(res.status_code, 200, res.content)
        return res.json()

    def _summary(self):
        res = self.client_.get(f"/api/v1/stores/{self.store.id}/summary/", **bearer(self.token))
        self.assertEqual(res.status_code, 200, res.content)
        return res.json()

    def test_low_stock_alert_appears_once_stock_drops_to_or_below_the_configured_level(self):
        self._set_reorder_level(Decimal("50.000"))

        # No stock received yet at all: current quantity is 0, which is
        # still "at or below" any positive reorder level - configured but
        # never stocked is the clearest low-stock case there is.
        data = self._summary()
        self.assertTrue(data["features"]["low_stock"]["configured"])
        self.assertEqual(data["features"]["low_stock"]["status"], "OK")
        self.assertEqual(data["features"]["low_stock"]["low_stock_count"], 1)
        low_stock_alerts = [a for a in data["alerts"]["items"] if a["type"] == "LOW_STOCK"]
        self.assertEqual(len(low_stock_alerts), 1)
        self.assertEqual(low_stock_alerts[0]["severity"], "critical")
        self.assertIn(self.material.code, low_stock_alerts[0]["message"])

        # Receive 120 (well above the 50 reorder level): alert clears.
        self._seed_recorded_receipt(Decimal("120.000"))
        data = self._summary()
        low_stock_alerts = [a for a in data["alerts"]["items"] if a["type"] == "LOW_STOCK"]
        self.assertEqual(len(low_stock_alerts), 0)
        self.assertEqual(data["features"]["low_stock"]["low_stock_count"], 0)

        # Issue 80 of it, leaving 40 - at or below the 50 reorder level
        # again, so the alert reappears, now a "warning" (not "critical"),
        # since some stock remains.
        from datetime import timedelta
        from django.utils import timezone
        import json

        issue_res = self.client_.post(
            f"/api/v1/stores/{self.store.id}/material-issues/",
            data=json.dumps({
                "source_company_id": self.company.id,
                "material_id": self.material.id,
                "issued_quantity": "80.000",
                "issued_at": (timezone.now() - timedelta(minutes=5)).isoformat(),
            }),
            content_type="application/json",
            **bearer(self.token),
        )
        self.assertEqual(issue_res.status_code, 201, issue_res.content)
        issue_id = issue_res.json()["id"]
        post_res = self.client_.post(
            f"/api/v1/stores/{self.store.id}/material-issues/{issue_id}/post/",
            data=json.dumps({"expected_version": 1}),
            content_type="application/json",
            **bearer(self.token),
        )
        self.assertEqual(post_res.status_code, 200, post_res.content)

        data = self._summary()
        low_stock_alerts = [a for a in data["alerts"]["items"] if a["type"] == "LOW_STOCK"]
        self.assertEqual(len(low_stock_alerts), 1)
        self.assertEqual(low_stock_alerts[0]["severity"], "warning")
        self.assertEqual(data["features"]["low_stock"]["low_stock_count"], 1)

    def test_an_inactive_material_is_never_surfaced_as_low_stock(self):
        self._set_reorder_level(Decimal("50.000"))
        self.material.is_active = False
        self.material.save(update_fields=["is_active"])

        data = self._summary()
        self.assertEqual(len(data["alerts"]["items"]), 0)
        self.assertEqual(data["features"]["low_stock"]["low_stock_count"], 0)

    def test_no_reorder_setting_means_no_low_stock_alert_at_all(self):
        data = self._summary()
        low_stock_alerts = [a for a in data["alerts"]["items"] if a["type"] == "LOW_STOCK"]
        self.assertEqual(len(low_stock_alerts), 0)
        self.assertFalse(data["features"]["low_stock"]["configured"])
        self.assertEqual(data["features"]["low_stock"]["status"], "NOT_CONFIGURED")


# `StoreSummaryLowStockTests` above already captured `ProductionCustodyTestCase`
# via inheritance - this import name is removed from the module namespace so
# Django's test discovery (which runs every TestCase subclass it finds in a
# module's own attributes) does not also independently re-run its tests a
# second time here, under this file.
del ProductionCustodyTestCase
