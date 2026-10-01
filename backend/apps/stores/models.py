from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.companies.models import normalize_code


class SharedStore(models.Model):
    """A single physical store, shared across companies. Deliberately has
    no owning-company FK - store access is a separate axis from company
    membership (see apps.stores.services/apps.permissions.services), and
    a store must never be duplicated per company that uses it. This model
    establishes store *identity* only; item masters, stock quantities,
    ownership accounting, and business-transaction models are a separate,
    future task and are not represented here at all.
    """

    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return self.code

    def clean(self):
        # Reuses Company's own normalisation rule (trim + upper) rather
        # than redefining an equivalent function - store codes follow the
        # identical convention, just for a different model.
        self.code = normalize_code(self.code)
        self.name = (self.name or "").strip()
        self.description = (self.description or "").strip()
        errors = {}
        if not self.code:
            errors["code"] = "Code is required."
        if not self.name:
            errors["name"] = "Name is required."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class StoreMembershipManager(models.Manager):
    def activate(self, *, user, store):
        """Get-or-create a membership and make sure it is active.

        Reactivates an existing (possibly inactive) row instead of ever
        creating a second row for the same (user, store) pair - the
        unique constraint on that pair also covers inactive rows. Mirrors
        apps.companies.models.CompanyMembershipManager.activate exactly.
        """
        membership, created = self.get_or_create(user=user, store=store)
        if not created and not membership.is_active:
            membership.is_active = True
            membership.save(update_fields=["is_active", "updated_at"])
        return membership


class StoreMembership(models.Model):
    """A user's access to a particular shared store. Entirely independent
    of CompanyMembership - an active user may hold a StoreMembership with
    no company membership at all, and vice versa. Neither implies the
    other (see apps.stores.services.active_stores_for_user and
    apps.companies.services.active_companies_for_user, which never
    consult each other's tables).
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="store_memberships",
    )
    store = models.ForeignKey(
        SharedStore,
        on_delete=models.PROTECT,
        related_name="memberships",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = StoreMembershipManager()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "store"], name="unique_user_store_membership"),
        ]
        ordering = ["store__code", "user__username"]

    def __str__(self):
        return f"{self.user} @ {self.store}"

    def clean(self):
        super().clean()
        if self.pk:
            original_store_id = (
                StoreMembership.objects.filter(pk=self.pk).values_list("store_id", flat=True).first()
            )
            if original_store_id is not None and original_store_id != self.store_id:
                raise ValidationError(
                    {"store": "Store cannot be changed after a membership is created."}
                )

    def save(self, *args, **kwargs):
        # Store is immutable after creation, for the same reason as
        # CompanyMembership.company (see apps.companies.models):
        # StoreRoleAssignment only checks "role and membership belong to
        # the same store" at assignment time, not continuously.
        # KNOWN LIMITATION: QuerySet.update()/bulk_create() bypass
        # save()/clean() entirely - see apps.companies.models for the
        # same documented limitation and why permission resolution stays
        # fail-closed regardless (apps.permissions.services.
        # effective_store_permission_codes constrains both sides of the
        # relation in one query).
        self.clean()
        super().save(*args, **kwargs)


class StorageLocation(models.Model):
    """A physical or logical storage location within exactly one shared
    store - a shelf, a room, a bin. Its `name` is arbitrary, free-text
    identity only: nothing in this model, or anywhere else in this task,
    ever inspects `name` for words like "approved"/"rejected" to decide
    whether material stored there is usable. Quality/lot status is a
    separate concept, explicitly not modelled here, that a later task
    will design on its own terms - a location is never itself a QC
    verdict. Likewise, no company-owner FK and no stock-quantity field:
    this task establishes location identity only, not what is stored
    where or in what amount.
    """

    store = models.ForeignKey(SharedStore, on_delete=models.PROTECT, related_name="locations")
    code = models.CharField(max_length=32)
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["store", "code"], name="unique_store_location_code"),
        ]
        ordering = ["store__code", "code"]

    def __str__(self):
        return f"{self.store}: {self.code}"

    def clean(self):
        self.code = normalize_code(self.code)
        self.name = (self.name or "").strip()
        self.description = (self.description or "").strip()
        errors = {}
        if not self.code:
            errors["code"] = "Code is required."
        if not self.name:
            errors["name"] = "Name is required."
        if errors:
            raise ValidationError(errors)
        if self.pk:
            original_store_id = (
                StorageLocation.objects.filter(pk=self.pk).values_list("store_id", flat=True).first()
            )
            if original_store_id is not None and original_store_id != self.store_id:
                raise ValidationError(
                    {"store": "Store cannot be changed after a location is created."}
                )

    def save(self, *args, **kwargs):
        # Store immutable after creation, same documented QuerySet.update()/
        # bulk_create() bypass limitation as StoreMembership.store above.
        self.clean()
        super().save(*args, **kwargs)
