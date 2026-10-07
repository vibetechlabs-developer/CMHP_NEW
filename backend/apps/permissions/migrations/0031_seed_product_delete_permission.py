from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "products.delete",
        "name": "Delete products with no references",
        "module": "products",
        "description": "Permanently delete a product that no sales order line, quotation line or formula references. Assigned to no role by default.",
    },
]


def seed_permissions(apps, schema_editor):
    """Idempotent, COMPANY scope, assigned to no role/user."""
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


class Migration(migrations.Migration):
    dependencies = [
        ("permissions", "0030_seed_customer_delete_permission"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, migrations.RunPython.noop),
    ]
