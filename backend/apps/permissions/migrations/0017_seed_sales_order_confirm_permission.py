from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "sales_orders.confirm",
        "name": "Confirm sales orders",
        "module": "sales_orders",
        "description": (
            "Confirm a draft direct sales order (DRAFT to CONFIRMED) subject to the company's explicit "
            "confirmation policy. Assigned explicitly to whoever the client designates - never inferred "
            "from a role name, is_staff or is_superuser. Confirming authorizes nothing else: no stock "
            "reservation, batch, invoice or production."
        ),
    },
]


def seed_permissions(apps, schema_editor):
    """Idempotent, COMPANY scope, assigned to no role/user - same pattern
    as 0012-0016.
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
        ("permissions", "0016_seed_formula_permissions"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
