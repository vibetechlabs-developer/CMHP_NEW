from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "batch_plans.printing_edit",
        "name": "Edit batch printing fields",
        "module": "batch_plans",
        "description": "Edit MRP for printing and printing status on a batch plan. Separate from batch planning edits.",
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
        ("permissions", "0027_seed_material_requisitions_approve_revise_permissions"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, migrations.RunPython.noop),
    ]
