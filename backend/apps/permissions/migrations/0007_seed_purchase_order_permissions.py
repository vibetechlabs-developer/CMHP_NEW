from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "purchase_orders.view",
        "name": "View purchase orders",
        "module": "purchasing",
        "description": "View draft/cancelled purchase orders raised by this company.",
    },
    {
        "code": "purchase_orders.create",
        "name": "Create purchase orders",
        "module": "purchasing",
        "description": (
            "Create a draft purchase order from an already-APPROVED purchase request belonging to "
            "this company."
        ),
    },
    {
        "code": "purchase_orders.edit",
        "name": "Edit draft purchase orders",
        "module": "purchasing",
        "description": (
            "Edit an existing draft purchase order for this company - supplier, line prices, "
            "expected delivery date and notes only."
        ),
    },
    {
        "code": "purchase_orders.cancel",
        "name": "Cancel purchase orders",
        "module": "purchasing",
        "description": "Cancel a draft purchase order for this company.",
    },
]


def seed_permissions(apps, schema_editor):
    """Idempotently provisions the four COMPANY-scope permissions Task
    08C-1 needs - mirrors 0005_seed_purchase_request_permissions.py's
    get_or_create pattern exactly. Neither assigned to any role nor to
    any user here - provisioning the permission definitions and granting
    access remain two separate actions, same as every prior permission-
    seeding migration in this project.
    """
    PermissionDefinition = apps.get_model("permissions", "PermissionDefinition")
    for entry in NEW_PERMISSIONS:
        PermissionDefinition.objects.get_or_create(
            code=entry["code"],
            defaults={
                "name": entry["name"],
                "module": entry["module"],
                "description": entry["description"],
                "scope": "COMPANY",
                "is_active": True,
            },
        )


def unseed_permissions(apps, schema_editor):
    """Reverse only removes a row if nothing already references it - same
    caution as every prior permission-seeding migration's reverse.
    """
    PermissionDefinition = apps.get_model("permissions", "PermissionDefinition")
    for entry in NEW_PERMISSIONS:
        permission = PermissionDefinition.objects.filter(code=entry["code"]).first()
        if permission is None:
            continue
        if permission.company_roles.exists():
            continue
        permission.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("permissions", "0006_seed_purchase_request_approval_permissions"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
