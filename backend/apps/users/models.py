from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Custom user model. Authentication identifier is username for now;
    company membership and company-scoped permissions are deliberately
    out of scope for this model and will be added as related models in
    a later task.
    """

    email = models.EmailField("email address", unique=True, blank=False)
    updated_at = models.DateTimeField(auto_now=True)

    REQUIRED_FIELDS = ["email"]

    def __str__(self):
        return self.username
