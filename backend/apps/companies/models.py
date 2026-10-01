from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


def normalize_code(value):
    """Consistent normalisation for Company.code: trimmed and upper-cased,
    so "acme", " ACME ", and "Acme" are all treated as the same code.
    """
    return (value or "").strip().upper()


class Company(models.Model):
    code = models.CharField(max_length=32, unique=True)
    legal_name = models.CharField(max_length=255)
    display_name = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["code"]
        verbose_name_plural = "companies"

    def __str__(self):
        return self.code

    def clean(self):
        self.code = normalize_code(self.code)
        self.legal_name = (self.legal_name or "").strip()
        self.display_name = (self.display_name or "").strip()
        errors = {}
        if not self.code:
            errors["code"] = "Code is required."
        if not self.legal_name:
            errors["legal_name"] = "Legal name is required."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        # No REST/admin-form layer validates this yet for every write path,
        # so the model itself is the one place normalisation and the
        # blank/whitespace rule are guaranteed to run.
        self.clean()
        super().save(*args, **kwargs)


class CompanyMembershipManager(models.Manager):
    def activate(self, *, user, company):
        """Get-or-create a membership and make sure it is active.

        Reactivates an existing (possibly inactive) row instead of ever
        creating a second row for the same (user, company) pair - the
        unique constraint on that pair also covers inactive rows.
        """
        membership, created = self.get_or_create(user=user, company=company)
        if not created and not membership.is_active:
            membership.is_active = True
            membership.save(update_fields=["is_active", "updated_at"])
        return membership


class CompanyMembership(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="company_memberships",
    )
    company = models.ForeignKey(
        Company,
        on_delete=models.PROTECT,
        related_name="memberships",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = CompanyMembershipManager()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "company"], name="unique_user_company_membership"
            ),
        ]
        ordering = ["company__code", "user__username"]

    def __str__(self):
        return f"{self.user} @ {self.company}"

    def clean(self):
        super().clean()
        if self.pk:
            original_company_id = (
                CompanyMembership.objects.filter(pk=self.pk)
                .values_list("company_id", flat=True)
                .first()
            )
            if original_company_id is not None and original_company_id != self.company_id:
                raise ValidationError(
                    {"company": "Company cannot be changed after a membership is created."}
                )

    def save(self, *args, **kwargs):
        # Company is immutable after creation. apps.permissions.models.
        # MembershipRole only checks "role and membership belong to the
        # same company" at assignment time, not continuously - reassigning
        # an existing membership's company would silently strand its role
        # assignments in what is now the wrong company. clean() is also
        # what Django Admin's ModelForm validates through before save().
        # KNOWN LIMITATION: QuerySet.update() bypasses save()/clean()
        # entirely and could still reassign `company` on an existing row -
        # see docs/backend-decisions.md (Task 04) for why permission
        # resolution stays safe (fails closed) even if that happens.
        self.clean()
        super().save(*args, **kwargs)
