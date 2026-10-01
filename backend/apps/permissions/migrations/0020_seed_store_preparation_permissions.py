from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "store_preparation.view",
        "name": "View store preparation records",
        "module": "store_preparation",
        "description": (
            "View confirmed store preparation information (Packing Type, whether an insert is required) "
            "for an existing batch plan at this store."
        ),
    },
    {
        "code": "store_preparation.create",
        "name": "Create store preparation records",
        "module": "store_preparation",
        "description": (
            "Record Packing Type and insert-required for an existing batch plan at this store. "
            "Does not authorize manufacturing, reserve material or establish stock ownership."
        ),
    },
    {
        "code": "store_preparation.edit",
        "name": "Edit store preparation records",
        "module": "store_preparation",
        "description": "Edit an existing store preparation record's Packing Type / insert-required at this store.",
    },
]


def seed_permissions(apps, schema_editor):
    """Idempotent, STORE scope, assigned to no role/user - same pattern as
    0009_seed_receiving_permissions.py and every permission-seeding
    migration since.
    """
    PermissionDefinition = apps.get_model("permissions", "PermissionDefinition")
    for entry in NEW_PERMISSIONS:
        PermissionDefinition.objects.get_or_create(
            code=entry["code"],
            defaults={
                "name": entry["name"],
                "module": entry["module"],
                "description": entry["description"],
                "scope": "STORE",
                "is_active": True,
            },
        )


def unseed_permissions(apps, schema_editor):
    PermissionDefinition = apps.get_model("permissions", "PermissionDefinition")
    for entry in NEW_PERMISSIONS:
        permission = PermissionDefinition.objects.filter(code=entry["code"]).first()
        if permission is None:
            continue
        if permission.store_roles.exists():
            continue
        permission.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("permissions", "0019_seed_batch_plan_permissions"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
