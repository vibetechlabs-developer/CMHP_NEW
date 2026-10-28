from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "materials.manage_reorder_level",
        "name": "Manage material reorder level",
        "module": "catalog",
        "description": (
            "Set or change this store's reorder threshold for a material (apps.catalog."
            "MaterialReorderSetting). Store-scoped, separate from the active-superuser-only "
            "material catalog write access - setting it never creates a stock movement and "
            "never changes the shared material master itself."
        ),
    },
]


def seed_permissions(apps, schema_editor):
    """Idempotently provisions the one STORE-scope permission the new
    store-specific reorder-level setting needs - mirrors 0034_seed_
    material_issue_permissions.py's get_or_create pattern exactly.
    Neither assigned to any role nor to any user here - provisioning the
    permission definition and granting access to a store's designated
    staff remain two separate actions, same as every prior permission-
    seeding migration in this project. Granting none of this to any live
    role preserves every existing user's current access unchanged.
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
    """Reverse only removes a row if nothing already references it - same
    caution as every prior permission-seeding migration's reverse.
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
        ("permissions", "0034_seed_material_issue_permissions"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
