from django.core.exceptions import ValidationError
from django.db import models

from apps.companies.models import Company, CompanyMembership, normalize_code
from apps.stores.models import SharedStore, StoreMembership


def normalize_permission_code(value):
    """Consistent normalisation for PermissionDefinition.code: trimmed and
    lower-cased, so "Orders.View", " orders.view ", and "orders.view" are
    all treated as the same code (dotted module.action convention, e.g.
    "orders.view").
    """
    return (value or "").strip().lower()


class PermissionDefinition(models.Model):
    class Scope(models.TextChoices):
        COMPANY = "COMPANY", "Company"
        STORE = "STORE", "Store"

    code = models.CharField(max_length=100, unique=True)
    name = models.CharField(max_length=150)
    module = models.CharField(max_length=50)
    description = models.TextField(blank=True)
    scope = models.CharField(max_length=10, choices=Scope.choices, default=Scope.COMPANY)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["module", "code"]

    def __str__(self):
        return self.code

    def clean(self):
        self.code = normalize_permission_code(self.code)
        self.name = (self.name or "").strip()
        self.module = (self.module or "").strip()
        self.description = (self.description or "").strip()
        errors = {}
        if not self.code:
            errors["code"] = "Code is required."
        if not self.name:
            errors["name"] = "Name is required."
        if not self.module:
            errors["module"] = "Module is required."
        if self.scope not in self.Scope.values:
            errors["scope"] = f"Scope must be one of {self.Scope.values}."
        if self.pk:
            original_scope = (
                PermissionDefinition.objects.filter(pk=self.pk).values_list("scope", flat=True).first()
            )
            if original_scope is not None and original_scope != self.scope:
                errors["scope"] = "Scope cannot be changed after a permission definition is created."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        # As with Company (apps.companies.models), there is no
        # serializer/form layer yet for every write path, so the model
        # itself guarantees normalisation and the blank/whitespace rule.
        # scope is immutable after creation for the same reason company/
        # role codes are: apps.permissions.services already resolves
        # company-role and store-role permissions through separate,
        # scope-filtered queries (effective_permission_codes/
        # effective_store_permission_codes) - a permission changing scope
        # after roles already reference it would silently change what
        # those existing role assignments grant.
        self.clean()
        super().save(*args, **kwargs)


class CompanyRole(models.Model):
    """A named bundle of permissions, scoped to exactly one company. The
    same role code can exist independently in two different companies
    (e.g. both companies define "MANAGER") without colliding, because
    uniqueness is scoped to (company, code), not code alone.
    """

    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="roles")
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    permissions = models.ManyToManyField(
        PermissionDefinition, related_name="company_roles", blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["company", "code"], name="unique_company_role_code"),
        ]
        ordering = ["company__code", "code"]

    def __str__(self):
        return f"{self.company}: {self.code}"

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
            original_company_id = (
                CompanyRole.objects.filter(pk=self.pk).values_list("company_id", flat=True).first()
            )
            if original_company_id is not None and original_company_id != self.company_id:
                raise ValidationError(
                    {"company": "Company cannot be changed after a role is created."}
                )

    def save(self, *args, **kwargs):
        # Company is immutable after creation, for the same reason as
        # CompanyMembership.company (see apps.companies.models): existing
        # MembershipRole assignments for this role assume its company
        # stays fixed. Same KNOWN LIMITATION as documented there -
        # QuerySet.update() bypasses this check.
        self.clean()
        super().save(*args, **kwargs)


class MembershipRole(models.Model):
    """Assigns one CompanyRole to one CompanyMembership. A membership can
    hold several roles at once - effective permissions are the union of
    all its active roles' permissions (see apps.permissions.services).
    """

    membership = models.ForeignKey(
        CompanyMembership, on_delete=models.PROTECT, related_name="role_assignments"
    )
    role = models.ForeignKey(
        CompanyRole, on_delete=models.PROTECT, related_name="membership_assignments"
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["membership", "role"], name="unique_membership_role"),
        ]
        ordering = ["membership__company__code", "membership__user__username", "role__code"]

    def __str__(self):
        return f"{self.membership} -> {self.role}"

    def clean(self):
        super().clean()
        if (
            self.membership_id
            and self.role_id
            and self.membership.company_id != self.role.company_id
        ):
            raise ValidationError(
                "Role and membership must belong to the same company."
            )

    def save(self, *args, **kwargs):
        # clean() is also what Django Admin's ModelForm validates through
        # (full_clean() before save), so a cross-company assignment is
        # rejected there too - not just here. KNOWN LIMITATION: bulk write
        # paths that never call save()/clean() - QuerySet.bulk_create() and
        # QuerySet.update() - bypass this Python-level check entirely.
        # There is no database-level constraint backing it either: a
        # Postgres CHECK constraint cannot reference columns on another
        # table, so nothing below the ORM stops a bulk_create() call from
        # inserting a cross-company row. Callers must use
        # apps.permissions.services.assign_role() (or plain .save()),
        # never bulk_create(), to create MembershipRole rows.
        self.clean()
        super().save(*args, **kwargs)


class StoreRole(models.Model):
    """A named bundle of STORE-scope permissions, scoped to exactly one
    shared store. Structurally identical to CompanyRole - the same role
    code can exist independently in two different stores - but kept as a
    separate model rather than a shared base class: the two are backed by
    different parent FKs (SharedStore vs Company) and there is no other
    behaviour to share beyond field shape, so an inheritance hierarchy
    would add indirection without removing real duplication (each still
    needs its own clean()/save() immutability check against its own
    parent FK).

    Enforcing "only STORE-scope PermissionDefinition rows may be attached"
    is not, and cannot be, a database or M2M-level constraint - it is
    enforced by apps.permissions.services.replace_store_role_permissions
    (which only resolves codes among scope=STORE definitions) and by
    apps.permissions.admin.StoreRoleAdmin's form. KNOWN LIMITATION,
    documented rather than hidden: `StoreRole.permissions.add()`/`.set()`
    called directly (bypassing the service and the admin form) run no
    validation at all - Django never calls clean() for M2M writes. This
    is harmless for permission *resolution*, though: effective_store_
    permission_codes() only ever resolves scope=STORE permissions reached
    through `company_roles`... i.e. through `StoreRole`, and effective_
    permission_codes() (company) only resolves scope=COMPANY permissions
    reached through CompanyRole - so a wrong-scope permission attached to
    the wrong role type via such a bypass is simply never resolved by
    either lookup, not leaked across scopes.
    """

    store = models.ForeignKey(SharedStore, on_delete=models.PROTECT, related_name="roles")
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    permissions = models.ManyToManyField(
        PermissionDefinition, related_name="store_roles", blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["store", "code"], name="unique_store_role_code"),
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
                StoreRole.objects.filter(pk=self.pk).values_list("store_id", flat=True).first()
            )
            if original_store_id is not None and original_store_id != self.store_id:
                raise ValidationError(
                    {"store": "Store cannot be changed after a role is created."}
                )

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class StoreRoleAssignment(models.Model):
    """Assigns one StoreRole to one StoreMembership. Structurally
    identical to MembershipRole (see CompanyRole's docstring above for why
    this is a separate model rather than a shared base class).
    """

    membership = models.ForeignKey(
        StoreMembership, on_delete=models.PROTECT, related_name="role_assignments"
    )
    role = models.ForeignKey(
        StoreRole, on_delete=models.PROTECT, related_name="membership_assignments"
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["membership", "role"], name="unique_store_membership_role"),
        ]
        ordering = ["membership__store__code", "membership__user__username", "role__code"]

    def __str__(self):
        return f"{self.membership} -> {self.role}"

    def clean(self):
        super().clean()
        if (
            self.membership_id
            and self.role_id
            and self.membership.store_id != self.role.store_id
        ):
            raise ValidationError(
                "Role and membership must belong to the same store."
            )

    def save(self, *args, **kwargs):
        # Same KNOWN LIMITATION as MembershipRole: QuerySet.bulk_create()/
        # .update() bypass this check entirely, and no database-level
        # constraint backs it either. Callers must use
        # apps.permissions.services.assign_store_role() (or plain
        # .save()), never bulk_create(), to create StoreRoleAssignment
        # rows.
        self.clean()
        super().save(*args, **kwargs)
