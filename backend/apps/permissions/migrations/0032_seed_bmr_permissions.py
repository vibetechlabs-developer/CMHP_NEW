from django.db import migrations


NEW_PERMISSIONS = [
    {"code": "bmr.view", "name": "View batch manufacturing records", "module": "bmr", "description": "Read a batch manufacturing record and its slips."},
    {"code": "bmr.create", "name": "Create batch manufacturing records", "module": "bmr", "description": "Create the BMR for a batch plan from its requirement preview."},
    {"code": "bmr.edit", "name": "Edit batch manufacturing record lines", "module": "bmr", "description": "Edit Label Claim, AR No., special values and qty received on BMR lines."},
]


def seed_permissions(apps, schema_editor):
    """Idempotent, COMPANY scope, assigned to no role or user."""
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
        ("permissions", "0031_seed_product_delete_permission"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, migrations.RunPython.noop),
    ]
