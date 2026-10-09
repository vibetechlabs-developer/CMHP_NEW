"""The current-user capability `can_manage_organization_setup` is read-only UI
information derived from the SAME rule as every Organization Setup write
endpoint (companies, shared stores, company/store roles and memberships,
units of measure, sales-order confirmation policy - all IsActiveSuperuser).
It grants nothing: each write endpoint still enforces authorization itself.

Synthetic users and fixtures only, in the isolated test database.
"""

import json

from django.test import Client, TestCase

from apps.common.permissions import IsActiveSuperuser, is_active_superuser
from tests.test_store_preparation import (
    bearer,
    grant_company_permission,
    make_company,
    make_superuser,
    make_user,
)

ME_URL = "/api/v1/auth/me/"


class OrganizationSetupCapabilityTests(TestCase):
    def setUp(self):
        self.client_ = Client()
        self.superuser = make_superuser("orgsetupsuper")
        self.business_admin = make_user("orgsetupbizadmin")
        self.company = make_company("ORGSETUPCO")
        # A business Admin: every company permission, but NOT a superuser -
        # must not be mistaken for setup authority either.
        from apps.permissions.models import PermissionDefinition

        codes = list(
            PermissionDefinition.objects.filter(scope="COMPANY", is_active=True).values_list("code", flat=True)
        )
        grant_company_permission(self.superuser, self.business_admin, self.company, *codes)
        self.plain = make_user("orgsetupplain")

    def me(self, user=None, query=""):
        return self.client_.get(ME_URL + query, **bearer(user or self.superuser))

    def test_active_superuser_gets_the_capability(self):
        res = self.me(self.superuser)
        self.assertEqual(res.status_code, 200, res.content[:200])
        self.assertTrue(res.json()["capabilities"]["can_manage_organization_setup"])

    def test_business_admin_with_every_company_permission_does_not_gain_setup_authority(self):
        # The whole point of this capability: holding every operational
        # company permission is not the same as being an active superuser.
        res = self.me(self.business_admin)
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.json()["capabilities"]["can_manage_organization_setup"])

    def test_ordinary_user_gets_false(self):
        self.assertFalse(self.me(self.plain).json()["capabilities"]["can_manage_organization_setup"])

    def test_anonymous_access_is_blocked(self):
        self.assertEqual(self.client_.get(ME_URL).status_code, 401)

    def test_client_cannot_set_the_capability(self):
        res = self.me(
            self.business_admin,
            query="?capabilities=%7B%22can_manage_organization_setup%22%3Atrue%7D&can_manage_organization_setup=true",
        )
        self.assertFalse(res.json()["capabilities"]["can_manage_organization_setup"])

    def test_capability_matches_the_server_write_rule_for_every_account(self):
        for user in (self.superuser, self.business_admin, self.plain):
            ui = self.me(user).json()["capabilities"]["can_manage_organization_setup"]
            self.assertEqual(ui, is_active_superuser(user))
            self.assertEqual(ui, IsActiveSuperuser().has_permission(type("R", (), {"user": user})(), None))

    def test_response_exposes_no_other_admin_flags(self):
        body = self.me(self.superuser).json()
        self.assertEqual(set(body.keys()), {"id", "username", "email", "first_name", "last_name", "capabilities"})
        self.assertNotIn("is_superuser", json.dumps(body))

    def test_server_still_refuses_company_create_from_a_non_superuser(self):
        # Even with the UI showing the setup entry point, every write
        # endpoint underneath it still decides for itself.
        payload = {"code": "ORG-FORGED", "legal_name": "Forged Co"}
        for user in (self.business_admin, self.plain):
            res = self.client_.post(
                "/api/v1/companies/", data=json.dumps(payload), content_type="application/json", **bearer(user)
            )
            self.assertEqual(res.status_code, 403, res.content[:200])

    def test_server_still_refuses_sales_order_confirmation_policy_read_from_a_non_superuser(self):
        for user in (self.business_admin, self.plain):
            res = self.client_.get(
                f"/api/v1/companies/{self.company.id}/sales-order-confirmation-policy/", **bearer(user)
            )
            self.assertEqual(res.status_code, 403, res.content[:200])
