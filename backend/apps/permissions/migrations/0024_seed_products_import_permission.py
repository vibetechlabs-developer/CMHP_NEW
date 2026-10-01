from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "products.import",
        "name": "Import products from CSV",
        "module": "product_imports",
        "description": (
            "Preview and commit a CSV import of the company-scoped Product master (Task 14A). Create-only: "
            "never updates, reactivates or overwrites an existing product. Always required together with "
            "products.view and products.create - it never substitutes for either."
        ),
    },
]


def seed_permissions(apps, schema_editor):
    """Idempotent, COMPANY scope, assigned to no role/user - same pattern
    as every permission-seeding migration since 0009_seed_receiving_
    permissions.py.
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
        ("permissions", "0023_seed_stock_view_permission"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
