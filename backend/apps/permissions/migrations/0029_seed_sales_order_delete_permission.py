from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "sales_orders.delete",
        "name": "Delete draft sales orders",
        "module": "sales_orders",
        "description": "Permanently delete a DRAFT sales order that has no batch plans. Assigned to no role by default.",
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
        ("permissions", "0028_seed_batch_plan_printing_edit_permission"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, migrations.RunPython.noop),
    ]
