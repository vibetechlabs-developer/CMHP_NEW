from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "shared_catalog.view",
        "name": "View shared material catalog",
        "module": "catalog",
        "description": "View units of measure, material categories and materials in the shared catalog.",
    },
    {
        "code": "storage_locations.view",
        "name": "View storage locations",
        "module": "stores",
        "description": "View storage locations within a store.",
    },
]


def seed_permissions(apps, schema_editor):
    """Idempotently provisions exactly the two STORE-scope permissions
    Task 07B needs - mirrors 0003_seed_shared_store_view_permission.py's
    get_or_create pattern exactly. Neither is granted to any role or user
    here - provisioning the catalog entry and granting access are two
    separate actions, same as every prior permission-seeding migration in
    this project.
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
    """Reverse only removes a row if nothing already references it -
    same caution as 0003's reverse migration.
    """
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
        ("permissions", "0003_seed_shared_store_view_permission"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
