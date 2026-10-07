from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Custom user model. Authentication identifier is username for now;
    company membership and company-scoped permissions are deliberately
    out of scope for this model and will be added as related models in
    a later task.
    """

    class EmploymentStatus(models.TextChoices):
        ACTIVE = "active", "Active"
        PROBATION = "probation", "Probation"
        NOTICE = "notice", "Notice period"
        RESIGNED = "resigned", "Resigned"
        TERMINATED = "terminated", "Terminated"

    email = models.EmailField("email address", unique=True, blank=False)
    phone = models.CharField(max_length=30, blank=True, default="")
    employee_id = models.CharField(max_length=50, blank=True, default="")
    department = models.CharField(max_length=100, blank=True, default="")
    designation = models.CharField(max_length=100, blank=True, default="")
    joining_date = models.DateField(null=True, blank=True)
    employment_status = models.CharField(
        max_length=20,
        choices=EmploymentStatus.choices,
        default=EmploymentStatus.ACTIVE,
    )
    common_inventory_access = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    REQUIRED_FIELDS = ["email"]

    def __str__(self):
        return self.username
